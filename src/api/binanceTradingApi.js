import axios from 'axios';
import crypto from 'crypto';

const BASE = 'https://fapi.binance.com';
const api     = axios.create({timeout: 5000});
const apiLong = axios.create({timeout: 20000});

let symbolsCache = null;
let symbolsCacheTime = 0;

const sign = (params) => {
  const qs = new URLSearchParams(params).toString();
  return crypto.createHmac('sha256', process.env.BINANCE_API_SECRET).update(qs).digest('hex');
};

const authRequest = async (method, path, params = {}) => {
  const p = { ...params, timestamp: Date.now() };
  p.signature = sign(p);
  const headers = { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY };
  const body = new URLSearchParams(p).toString();

  if (method === 'POST') {
    const res = await api.post(`${BASE}${path}`, body, {
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return res.data;
  }
  if (method === 'DELETE') {
    const res = await api.delete(`${BASE}${path}?${body}`, { headers });
    return res.data;
  }
  const res = await api.get(`${BASE}${path}?${body}`, { headers });
  return res.data;
};

const getSymbolInfo = async (symbol) => {
  const now = Date.now();
  if (!symbolsCache || now - symbolsCacheTime > 3_600_000) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await apiLong.get(`${BASE}/fapi/v1/exchangeInfo`);
        symbolsCache = res.data.symbols;
        symbolsCacheTime = now;
        break;
      } catch (err) {
        if (attempt === 3) {
          // fallback на устаревший кэш если сеть нестабильна
          if (symbolsCache) break;
          throw err;
        }
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return symbolsCache?.find(s => s.symbol === symbol) ?? null;
};

const roundToStep = (value, step) => {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return parseFloat((Math.floor(value / step) * step).toFixed(decimals));
};

export const getUsdtBalance = async () => {
  const data = await authRequest('GET', '/fapi/v2/account');
  const asset = data.assets?.find(a => a.asset === 'USDT');
  return parseFloat(asset?.availableBalance ?? 0);
};

const getPositionMode = async () => {
  try {
    const data = await authRequest('GET', '/fapi/v1/positionSide/dual');
    return data.dualSidePosition === true;
  } catch {
    return false;
  }
};

export const placeTradeWithSLTP = async ({
  symbol, side, entryPrice, usdtMargin, leverage,
  slPercent = 2, tpPercent = 4, trailingStop = false, limitEntry = false,
}) => {
  const closeSide    = side === 'BUY' ? 'SELL' : 'BUY';
  const isLong       = side === 'BUY';

  // Параллельно: режим позиции + параметры символа + маржа/плечо
  const [hedgeMode, info] = await Promise.all([
    getPositionMode(),
    getSymbolInfo(symbol),
    authRequest('POST', '/fapi/v1/marginType', { symbol, marginType: 'ISOLATED' }).catch(() => {}),
    authRequest('POST', '/fapi/v1/leverage', { symbol, leverage }),
  ]);

  const posSide      = isLong ? 'LONG' : 'SHORT';
  const closePosSide = isLong ? 'SHORT' : 'LONG';

  // В hedge mode reduceOnly запрещён — используем positionSide
  const closeExtra = hedgeMode
    ? { positionSide: closePosSide }
    : { reduceOnly: 'true' };

  const lotFilter   = info?.filters?.find(f => f.filterType === 'LOT_SIZE');
  const priceFilter = info?.filters?.find(f => f.filterType === 'PRICE_FILTER');
  const stepSize = parseFloat(lotFilter?.stepSize  ?? '0.001');
  const tickSize = parseFloat(priceFilter?.tickSize ?? '0.01');

  const fmtQty   = (v) => roundToStep(v, stepSize);
  const fmtPrice = (v) => roundToStep(v, tickSize);

  const quantity = fmtQty((usdtMargin * leverage) / entryPrice);

  if (quantity <= 0) throw new Error('Размер позиции 0. Увеличь маржу или плечо.');
  if (quantity * entryPrice < 20) throw new Error(`Номинал позиции $${(quantity * entryPrice).toFixed(2)} < минимума $20. Увеличь маржу или плечо.`);

  // п.13: лимитный вход — пробуем LIMIT FOK, иначе MARKET
  let order;
  const openExtra = hedgeMode ? { positionSide: posSide } : {};
  if (limitEntry) {
    const limitPrice = fmtPrice(isLong ? entryPrice * 0.999 : entryPrice * 1.001);
    let filled = false;
    try {
      order = await authRequest('POST', '/fapi/v1/order', {
        symbol, side, type: 'LIMIT',
        price: limitPrice, quantity, timeInForce: 'FOK',
        ...openExtra,
      });
      filled = order.status === 'FILLED';
    } catch { /* лимит не прошёл — упадём на маркет */ }
    if (!filled) {
      order = await authRequest('POST', '/fapi/v1/order', {
        symbol, side, type: 'MARKET', quantity, ...openExtra,
      });
    }
  } else {
    order = await authRequest('POST', '/fapi/v1/order', {
      symbol, side, type: 'MARKET', quantity, ...openExtra,
    });
  }

  const fillPrice = parseFloat(order.avgPrice) || entryPrice;

  const actualSL  = fmtPrice(isLong ? fillPrice * (1 - slPercent / 100) : fillPrice * (1 + slPercent / 100));
  const actualTP1 = fmtPrice(isLong ? fillPrice * (1 + slPercent / 100) : fillPrice * (1 - slPercent / 100));
  const actualTP2 = fmtPrice(isLong ? fillPrice * (1 + tpPercent / 100) : fillPrice * (1 - tpPercent / 100));

  // п.9: два тейка — 50% на TP1, 50% на TP2
  // Если qty1 округляется до 0 (маленькая позиция) — весь объём на TP2
  const qty1 = fmtQty(quantity / 2);
  const qty2 = qty1 > 0 ? fmtQty(quantity - qty1) : quantity;

  // Binance с 2025-12-09 требует алго-эндпоинт для условных ордеров
  const placedAlgoIds = [];
  const algoOrder = async (params) => {
    const result = await authRequest('POST', '/fapi/v1/algoOrder', {
      algoType: 'CONDITIONAL', ...params,
    });
    if (result?.algoId) placedAlgoIds.push(result.algoId);
    return result;
  };

  // Цены лимитного исполнения: небольшой offset от триггера чтобы ордер точно прошёл
  const tp1LimitPrice = fmtPrice(isLong ? actualTP1 * 0.999 : actualTP1 * 1.001);
  const tp2LimitPrice = fmtPrice(isLong ? actualTP2 * 0.999 : actualTP2 * 1.001);

  // п.3: SL/TP в отдельном try/catch — открытая позиция не должна висеть без защиты молча
  let slTpError = null;
  try {
    // п.10: фиксированный SL всегда — защита до срабатывания TP1
    const slLimitPrice = fmtPrice(isLong ? actualSL * 0.998 : actualSL * 1.002);
    await algoOrder({
      symbol, side: closeSide, type: 'STOP',
      price: slLimitPrice, triggerPrice: actualSL,
      quantity, timeInForce: 'GTC', ...closeExtra,
    });

    // Трейлинг активируется только после TP1 — до этого момента спит
    if (trailingStop) {
      try {
        await algoOrder({
          symbol, side: closeSide, type: 'TRAILING_STOP_MARKET',
          callbackRate: slPercent,
          activationPrice: actualTP1,
          quantity, ...closeExtra,
        });
      } catch {
        // Если трейлинг не прошёл — фиксированный SL уже стоит, этого достаточно
      }
    }

    if (qty1 > 0) {
      await algoOrder({
        symbol, side: closeSide, type: 'TAKE_PROFIT',
        price: tp1LimitPrice, triggerPrice: actualTP1,
        quantity: qty1, timeInForce: 'GTC', ...closeExtra,
      });
    }

    await algoOrder({
      symbol, side: closeSide, type: 'TAKE_PROFIT',
      price: tp2LimitPrice, triggerPrice: actualTP2,
      quantity: qty2, timeInForce: 'GTC', ...closeExtra,
    });
  } catch (err) {
    slTpError = err?.response?.data?.msg || err.message || 'Ошибка выставления SL/TP';
  }

  return { quantity, fillPrice, slPrice: actualSL, tp1Price: actualTP1, tpPrice: actualTP2, slTpError, algoIds: placedAlgoIds };
};

export const getDailyPnl = async () => {
  try {
    const startTime = Date.now() - 24 * 60 * 60 * 1000;
    const data = await authRequest('GET', '/fapi/v1/income', {
      incomeType: 'REALIZED_PNL',
      startTime,
      limit: 1000,
    });
    let earned = 0, lost = 0;
    for (const item of data) {
      const val = parseFloat(item.income);
      if (val > 0) earned += val;
      else lost += val;
    }
    return { earned: earned.toFixed(2), lost: Math.abs(lost).toFixed(2) };
  } catch {
    return null;
  }
};

export const getOpenPosition = async (symbol) => {
  try {
    const data = await authRequest('GET', '/fapi/v2/positionRisk', {symbol});
    return data?.find(p => parseFloat(p.positionAmt) !== 0) ?? null;
  } catch {
    return null;
  }
};

export const getOpenPositions = async () => {
  try {
    const data = await authRequest('GET', '/fapi/v2/positionRisk');
    return data?.filter(p => parseFloat(p.positionAmt) !== 0) ?? [];
  } catch {
    return [];
  }
};

export const cancelAlgoOrdersById = async (algoIds) => {
  if (!algoIds?.length) return;
  await Promise.all(algoIds.map(algoId =>
    authRequest('DELETE', '/fapi/v1/algoOrder', { algoId }).catch(err => {
      const code = err?.response?.data?.code;
      if (code !== -2011) console.error('cancelAlgoOrder error:', algoId, err?.response?.data || err.message);
    })
  ));
};

export const cancelAllSymbolOrders = async (symbol) => {
  // Отменяем обычные условные ордера (STOP, TAKE_PROFIT)
  try {
    await authRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol });
  } catch (err) {
    const code = err?.response?.data?.code;
    if (code !== -2011) console.error('cancelAllOpenOrders error:', err?.response?.data || err.message);
  }

  // Резервная попытка отмены algo-ордеров по символу (если algoIds не переданы)
  try {
    const res = await authRequest('GET', '/fapi/v1/openAlgoOrders', { symbol });
    const orders = res?.orders ?? [];
    if (orders.length) {
      await Promise.all(orders.map(o =>
        authRequest('DELETE', '/fapi/v1/algoOrder', { algoId: o.algoId }).catch(err => {
          console.error('cancelAlgoOrder (by symbol) error:', o.algoId, err?.response?.data || err.message);
        })
      ));
    }
  } catch (err) {
    console.error('openAlgoOrders fetch error:', err?.response?.data || err.message);
  }
};

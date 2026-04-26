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
  const res = await api.get(`${BASE}${path}?${body}`, { headers });
  return res.data;
};

const getSymbolInfo = async (symbol) => {
  const now = Date.now();
  if (!symbolsCache || now - symbolsCacheTime > 3_600_000) {
    const res = await apiLong.get(`${BASE}/fapi/v1/exchangeInfo`); // п.4: apiLong для большого ответа
    symbolsCache = res.data.symbols;
    symbolsCacheTime = now;
  }
  return symbolsCache.find(s => s.symbol === symbol) ?? null;
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

export const placeTradeWithSLTP = async ({
  symbol, side, entryPrice, usdtMargin, leverage,
  slPercent = 2, tpPercent = 4, trailingStop = false, limitEntry = false,
}) => {
  const closeSide = side === 'BUY' ? 'SELL' : 'BUY';

  await authRequest('POST', '/fapi/v1/marginType', { symbol, marginType: 'ISOLATED' }).catch(() => {});
  await authRequest('POST', '/fapi/v1/leverage', { symbol, leverage });

  const info = await getSymbolInfo(symbol);
  const lotFilter   = info?.filters?.find(f => f.filterType === 'LOT_SIZE');
  const priceFilter = info?.filters?.find(f => f.filterType === 'PRICE_FILTER');
  const stepSize = parseFloat(lotFilter?.stepSize  ?? '0.001');
  const tickSize = parseFloat(priceFilter?.tickSize ?? '0.01');

  const fmtQty   = (v) => roundToStep(v, stepSize);
  const fmtPrice = (v) => roundToStep(v, tickSize);

  const quantity = fmtQty((usdtMargin * leverage) / entryPrice);

  // п.13: лимитный вход — пробуем LIMIT FOK, иначе MARKET
  let order;
  if (limitEntry) {
    const isLong = side === 'BUY';
    const limitPrice = fmtPrice(isLong ? entryPrice * 0.999 : entryPrice * 1.001);
    let filled = false;
    try {
      order = await authRequest('POST', '/fapi/v1/order', {
        symbol, side, type: 'LIMIT',
        price: limitPrice, quantity, timeInForce: 'FOK',
      });
      filled = order.status === 'FILLED';
    } catch { /* лимит не прошёл — упадём на маркет */ }
    if (!filled) {
      order = await authRequest('POST', '/fapi/v1/order', {
        symbol, side, type: 'MARKET', quantity,
      });
    }
  } else {
    order = await authRequest('POST', '/fapi/v1/order', {
      symbol, side, type: 'MARKET', quantity,
    });
  }

  const fillPrice = parseFloat(order.avgPrice) || entryPrice;
  const isLong    = side === 'BUY';

  const actualSL  = fmtPrice(isLong ? fillPrice * (1 - slPercent / 100) : fillPrice * (1 + slPercent / 100));
  const actualTP1 = fmtPrice(isLong ? fillPrice * (1 + slPercent / 100) : fillPrice * (1 - slPercent / 100));
  const actualTP2 = fmtPrice(isLong ? fillPrice * (1 + tpPercent / 100) : fillPrice * (1 - tpPercent / 100));

  // п.9: два тейка — 50% на TP1, 50% на TP2
  const qty1 = fmtQty(quantity / 2);
  const qty2 = fmtQty(quantity - qty1);

  // п.3: SL/TP в отдельном try/catch — открытая позиция не должна висеть без защиты молча
  let slTpError = null;
  try {
    // п.10: трейлинг-стоп или фиксированный стоп
    if (trailingStop) {
      try {
        await authRequest('POST', '/fapi/v1/order', {
          symbol, side: closeSide, type: 'TRAILING_STOP_MARKET',
          callbackRate: slPercent,
          quantity, reduceOnly: 'true',
        });
      } catch {
        // fallback на stop-limit если TRAILING_STOP_MARKET не прошёл
        const slLimitPrice = fmtPrice(isLong ? actualSL * 0.998 : actualSL * 1.002);
        await authRequest('POST', '/fapi/v1/order', {
          symbol, side: closeSide, type: 'STOP',
          price: slLimitPrice, stopPrice: actualSL,
          quantity, reduceOnly: 'true', timeInForce: 'GTC',
        });
      }
    } else {
      const slLimitPrice = fmtPrice(isLong ? actualSL * 0.998 : actualSL * 1.002);
      await authRequest('POST', '/fapi/v1/order', {
        symbol, side: closeSide, type: 'STOP',
        price: slLimitPrice, stopPrice: actualSL,
        quantity, reduceOnly: 'true', timeInForce: 'GTC',
      });
    }

    await authRequest('POST', '/fapi/v1/order', {
      symbol, side: closeSide, type: 'TAKE_PROFIT',
      price: actualTP1, stopPrice: actualTP1,
      quantity: qty1, reduceOnly: 'true', timeInForce: 'GTC',
    });

    await authRequest('POST', '/fapi/v1/order', {
      symbol, side: closeSide, type: 'TAKE_PROFIT',
      price: actualTP2, stopPrice: actualTP2,
      quantity: qty2, reduceOnly: 'true', timeInForce: 'GTC',
    });
  } catch (err) {
    slTpError = err?.response?.data?.msg || err.message || 'Ошибка выставления SL/TP';
  }

  return { quantity, fillPrice, slPrice: actualSL, tp1Price: actualTP1, tpPrice: actualTP2, slTpError };
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

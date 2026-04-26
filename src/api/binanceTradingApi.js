import axios from 'axios';
import crypto from 'crypto';

const BASE = 'https://fapi.binance.com';
const api  = axios.create({timeout: 5000});

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
    const res = await api.get(`${BASE}/fapi/v1/exchangeInfo`);
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

export const placeTradeWithSLTP = async ({ symbol, side, entryPrice, usdtMargin, leverage, slPercent = 2, tpPercent = 4 }) => {
  const closeSide = side === 'BUY' ? 'SELL' : 'BUY';

  // 1. Выставляем плечо
  await authRequest('POST', '/fapi/v1/leverage', { symbol, leverage });

  // 2. Получаем точность по символу
  const info = await getSymbolInfo(symbol);
  const lotFilter   = info?.filters?.find(f => f.filterType === 'LOT_SIZE');
  const priceFilter = info?.filters?.find(f => f.filterType === 'PRICE_FILTER');
  const stepSize = parseFloat(lotFilter?.stepSize  ?? '0.001');
  const tickSize = parseFloat(priceFilter?.tickSize ?? '0.01');

  const fmtQty   = (v) => roundToStep(v, stepSize);
  const fmtPrice = (v) => roundToStep(v, tickSize);

  // 3. Количество: маржа * плечо / цена
  const quantity = fmtQty((usdtMargin * leverage) / entryPrice);

  // 4. Рыночный ордер — мгновенное исполнение
  const order = await authRequest('POST', '/fapi/v1/order', {
    symbol, side, type: 'MARKET', quantity,
  });

  const fillPrice = parseFloat(order.avgPrice) || entryPrice;
  const isLong    = side === 'BUY';
  const actualSL  = fmtPrice(isLong ? fillPrice * (1 - slPercent / 100) : fillPrice * (1 + slPercent / 100));
  const actualTP  = fmtPrice(isLong ? fillPrice * (1 + tpPercent / 100) : fillPrice * (1 - tpPercent / 100));

  // 5. Стоп-лосс
  await authRequest('POST', '/fapi/v1/order', {
    symbol, side: closeSide, type: 'STOP_MARKET',
    stopPrice: actualSL, closePosition: 'true',
  });

  // 6. Тейк-профит
  await authRequest('POST', '/fapi/v1/order', {
    symbol, side: closeSide, type: 'TAKE_PROFIT_MARKET',
    stopPrice: actualTP, closePosition: 'true',
  });

  return { quantity, fillPrice, slPrice: actualSL, tpPrice: actualTP };
};

export const getOpenPosition = async (symbol) => {
  try {
    const data = await authRequest('GET', '/fapi/v2/positionRisk', {symbol});
    return data?.find(p => parseFloat(p.positionAmt) !== 0) ?? null;
  } catch {
    return null;
  }
};

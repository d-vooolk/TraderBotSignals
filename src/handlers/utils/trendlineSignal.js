import { getFuturesCandlestickData } from '../../api/binanceApi.js';
import { SETTINGS } from '../../settings.js';
import { generateTrendlineChart } from './chartGenerator.js';

const trendCooldown = {}; // symbol -> timestamp

const fmt = (p) => {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toPrecision(4);
};

const getNextPivotLevels = (closes, direction, currentPrice) => {
  const { highs, lows } = findPivots(closes.slice(0, -1));
  if (direction === 'up') {
    return highs
      .filter(p => p.price > currentPrice)
      .map(p => p.price)
      .sort((a, b) => a - b)
      .slice(0, 3);
  } else {
    return lows
      .filter(p => p.price < currentPrice)
      .map(p => p.price)
      .sort((a, b) => b - a)
      .slice(0, 3);
  }
};

const pearsonCorr = (a, b) => {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  const ax = a.slice(-n), bx = b.slice(-n);
  const ret = arr => arr.slice(1).map((v, i) => (v - arr[i]) / arr[i]);
  const ra = ret(ax), rb = ret(bx);
  const m = ra.length;
  const meanA = ra.reduce((s, v) => s + v, 0) / m;
  const meanB = rb.reduce((s, v) => s + v, 0) / m;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < m; i++) {
    const ea = ra[i] - meanA, eb = rb[i] - meanB;
    num += ea * eb; da += ea * ea; db += eb * eb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
};

const findPivots = (closes, lookback = 2) => {
  const highs = [], lows = [];
  for (let i = lookback; i < closes.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (closes[j] >= closes[i]) isHigh = false;
      if (closes[j] <= closes[i]) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, price: closes[i] });
    if (isLow)  lows.push({ idx: i, price: closes[i] });
  }
  return { highs, lows };
};

const lineAt = (x, x1, y1, x2, y2) => y1 + (y2 - y1) * (x - x1) / (x2 - x1);

const detectBreakout = (closes, minBreakPct) => {
  const n = closes.length - 1;
  const curr = closes[n];
  const { highs, lows } = findPivots(closes);

  let resistLine = null, supportLine = null, direction = null;

  const pivHighs = highs.filter(p => p.idx < n);
  if (pivHighs.length >= 2) {
    const [p1, p2] = pivHighs.slice(-2);
    const lineNow = lineAt(n, p1.idx, p1.price, p2.idx, p2.price);
    resistLine = { p1, p2, valueAtN: lineNow };
    if (curr > lineNow * (1 + minBreakPct / 100)) direction = 'up';
  }

  const pivLows = lows.filter(p => p.idx < n);
  if (pivLows.length >= 2) {
    const [p1, p2] = pivLows.slice(-2);
    const lineNow = lineAt(n, p1.idx, p1.price, p2.idx, p2.price);
    supportLine = { p1, p2, valueAtN: lineNow };
    if (!direction && curr < lineNow * (1 - minBreakPct / 100)) direction = 'down';
  }

  if (!direction) return null;
  return { direction, resistLine, supportLine };
};

const fetchTfDir = async (symbol, interval) => {
  try {
    const candles = await getFuturesCandlestickData({ symbol: `${symbol}USDT`, interval, limit: 2 });
    if (!candles?.length) return null;
    const c = candles[candles.length - 1];
    return parseFloat(c[4]) >= parseFloat(c[1]) ? 'up' : 'down';
  } catch { return null; }
};

export const checkTrendlineSignal = async (symbol, closes, volumes, btcCloses, telegram) => {
  const chatId = SETTINGS.savedChatId;
  if (!telegram || !chatId) return;

  const cfg         = SETTINGS.trendSignal ?? {};
  const minBreakPct = cfg.minBreakPercent   ?? 0.3;
  const maxBtcCorr  = cfg.maxBtcCorrelation ?? 0.65;
  const cooldownMs  = (cfg.cooldownHours    ?? 4) * 3_600_000;
  const minAvgVol   = cfg.minAvgVolumeUsdt  ?? 500_000;

  const now = Date.now();
  if (now - (trendCooldown[symbol] || 0) < cooldownMs) return;

  if (closes.length < 20) return;

  // Volume filter: average of previous candles must exceed threshold
  if (volumes.length >= 5) {
    const prev = volumes.slice(0, -1);
    const avgVol = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (avgVol < minAvgVol) return;
  }

  // BTC correlation filter
  if (btcCloses.length >= 20) {
    const corr = Math.abs(pearsonCorr(btcCloses, closes));
    if (corr >= maxBtcCorr) return;
  }

  // Trend line breakout detection
  const breakout = detectBreakout(closes, minBreakPct);
  if (!breakout) return;

  const { direction } = breakout;
  const coinSymbol = symbol.replace(/usdt$/i, '').toUpperCase();

  // 1h confirmation is required
  const dir1h = await fetchTfDir(coinSymbol, '1h');
  if (!dir1h || dir1h !== direction) return;

  // 4h confirmation is optional — determines signal strength
  const dir4h = await fetchTfDir(coinSymbol, '4h');
  const isStrong = dir4h === direction;

  trendCooldown[symbol] = now;

  // Stagger 0–5 s so simultaneous signals don't arrive as a burst
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5000)));

  const arrow    = direction === 'up' ? '↑' : '↓';
  const strength = isStrong ? '🟢' : '🟡';
  const tfLabel  = isStrong ? '15m + 1h + 4h' : '15m + 1h';
  const dirLabel = direction === 'up' ? 'ПРОБОЙ ВВЕРХ' : 'ПРОБОЙ ВНИЗ';
  const price    = closes[closes.length - 1];

  // S/R analysis
  const brokenVal = direction === 'up'
    ? breakout.resistLine?.valueAtN
    : breakout.supportLine?.valueAtN;
  const nextLevels = getNextPivotLevels(closes, direction, price);

  const brokenText = brokenVal != null
    ? `\n📍 Пробит: <code>$${fmt(brokenVal)}</code> → теперь ${direction === 'up' ? 'поддержка' : 'сопротивление'}`
    : '';
  const nextText = nextLevels.length > 0
    ? '\n📌 Следующие уровни: ' + nextLevels.map(p => `<code>$${fmt(p)}</code>`).join(' → ')
    : '';

  const caption =
    `📐 <b>ТРЕНД-ПРОБОЙ ${arrow}</b>  <code>${coinSymbol}USDT</code>\n` +
    `${strength} <b>${dirLabel}</b>  [${tfLabel}]\n` +
    `💵 <code>$${price}</code>` +
    brokenText +
    nextText;

  const buttons = {
    inline_keyboard: [[
      { text: '🔗 Binance', url: `https://www.binance.com/futures/${coinSymbol}USDT` },
      { text: '📊 TradingView', url: `https://www.tradingview.com/chart/?symbol=BINANCE:${coinSymbol}USDT.P` },
    ]],
  };

  try {
    const imgBuffer = await generateTrendlineChart(
      coinSymbol, closes, breakout.resistLine, breakout.supportLine, direction,
    );
    await telegram.sendPhoto(chatId, { source: imgBuffer }, { caption, parse_mode: 'HTML', reply_markup: buttons });
  } catch {
    await telegram.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: buttons }).catch(() => {});
  }
};

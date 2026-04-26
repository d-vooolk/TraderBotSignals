import WebSocket from "ws";
import { fetchFuturesSymbols, getFuturesCandlestickData, getFundingRate, getOpenInterest } from "../../api/binanceApi.js";
import { handleCoinPriceRequest } from "../../handlers/handleCoinPriceRequest/handleCoinPriceRequest.js";
import { SETTINGS } from "../../settings.js";
import { isSlCoolingDown } from "../../handlers/utils/slCooldown.js";
import { autoTrader } from "../../handlers/utils/autoTrader.js";
import { checkBBReentry } from "../../handlers/utils/bbReentry.js";

const getWsUrl = (streams) => `wss://fstream.binance.com/stream?streams=${streams}`;

export const wsStatus = { running: false, symbolsCount: 0, lastSignalAt: null, lastCandleAt: null };

const cache1h      = {};           // symbol -> { data, ts }
const CACHE_1H_TTL = 60_000;

const fundingCache = {};           // symbol -> { rate, ts }
const FUNDING_TTL  = 4 * 3600_000;

const oiCache      = {};           // symbol -> { oi, ts }
const OI_TTL       = 5 * 60_000;

const signalCooldown = {};         // symbol -> timestamp

// ─── Индикаторы ──────────────────────────────────────────────────────────────

const calculateRSI = (closes, period = 14) => {
  if (closes.length < period + 1) return 50;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
};

// SuperTrend(10, 3) — возвращает 'up' | 'down' | null
const calculateSuperTrend = (highs, lows, closes, period = 10, mult = 3) => {
  if (closes.length < period + 1) return null;

  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }

  let direction = null;
  let finalUpper = Infinity;
  let finalLower = 0;

  for (let i = period - 1; i < trs.length; i++) {
    const atr = trs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const ci  = i + 1;
    const hl2 = (highs[ci] + lows[ci]) / 2;

    const rawUpper = hl2 + mult * atr;
    const rawLower = hl2 - mult * atr;
    const prevClose = closes[ci - 1];

    const newUpper = (rawUpper < finalUpper || prevClose > finalUpper) ? rawUpper : finalUpper;
    const newLower = (rawLower > finalLower || prevClose < finalLower) ? rawLower : finalLower;

    if (direction === null) {
      direction = closes[ci] > hl2 ? 'up' : 'down';
    } else if (direction === 'down' && closes[ci] > newUpper) {
      direction = 'up';
    } else if (direction === 'up' && closes[ci] < newLower) {
      direction = 'down';
    }

    finalUpper = newUpper;
    finalLower = newLower;
  }

  return direction;
};

// ─── Async-фильтры ───────────────────────────────────────────────────────────

const check1hConfirmation = async (symbol, direction) => {
  try {
    const now    = Date.now();
    const cached = cache1h[symbol];
    const needsFetch = !cached || now - cached.ts >= CACHE_1H_TTL;
    const candles = needsFetch
      ? await getFuturesCandlestickData({ symbol: `${symbol.toUpperCase()}USDT`, interval: '1h', limit: 2 })
      : cached.data;
    if (needsFetch && candles) cache1h[symbol] = { data: candles, ts: now };
    if (!candles || candles.length < 1) return true;
    const c = candles[candles.length - 1];
    const change1h = parseFloat(c[4]) - parseFloat(c[1]);
    return direction === 'up' ? change1h >= 0 : change1h <= 0;
  } catch { return true; }
};

const checkFundingRate = async (symbol, direction) => {
  try {
    const now    = Date.now();
    const cached = fundingCache[symbol];
    const rate   = (cached && now - cached.ts < FUNDING_TTL)
      ? cached.rate
      : await getFundingRate(`${symbol.toUpperCase()}USDT`);
    fundingCache[symbol] = { rate, ts: now };

    const threshold = SETTINGS.handler.fundingThreshold ?? 0.0005;
    // Слишком много лонгов — избегаем LONG входов; слишком много шортов — SHORT входов
    if (direction === 'up'   && rate >  threshold) return false;
    if (direction === 'down' && rate < -threshold) return false;
    return true;
  } catch { return true; }
};

const checkOI = async (symbol, direction) => {
  try {
    const now    = Date.now();
    const sym    = `${symbol.toUpperCase()}USDT`;
    const cached = oiCache[symbol];

    const currentOI = (cached && now - cached.ts < OI_TTL)
      ? cached.oi
      : await getOpenInterest(sym);
    if (!currentOI) return true;

    const prevOI = cached?.oi ?? null;
    oiCache[symbol] = { oi: currentOI, ts: now };

    if (prevOI && prevOI > 0) {
      const oiChange = (currentOI - prevOI) / prevOI;
      const threshold = SETTINGS.handler.oiDropThreshold ?? 0.05;
      // OI значительно упал — скорее всего ликвидации, а не реальный импульс
      if (oiChange < -threshold) return false;
    }
    return true;
  } catch { return true; }
};

// ─── WebSocket ───────────────────────────────────────────────────────────────

export const startWebSocket = async (bot) => {
  console.info("Старт WebSocket Binance...");

  const symbols = await fetchFuturesSymbols();
  if (symbols.length === 0) {
    console.error("❌ Список монет пуст, повтор через 60s...");
    setTimeout(() => startWebSocket(bot), 60_000);
    return;
  }
  wsStatus.symbolsCount = symbols.length;

  const batchSize = 200;
  const batches   = [];
  for (let i = 0; i < symbols.length; i += batchSize) batches.push(symbols.slice(i, i + batchSize));
  console.info(`📦 Разбито на ${batches.length} пакетов по ${batchSize} монет.`);

  // symbol -> { lastChange, closes[], highs[], lows[], volumes[] }
  const symbolData = {};

  const fireSignal = (coinSymbol, direction, absChange, closePrice) => {
    wsStatus.lastSignalAt = new Date().toISOString();
    const dirEmoji = direction === 'up' ? '📈 ВЫРОСЛА' : '📉 УПАЛА';
    console.info(`🚀 [ALERT] ${coinSymbol.toUpperCase()}USDT ${dirEmoji} на ${absChange.toFixed(2)}% за ${SETTINGS.handler.temporaryCandle}.`);
    if (bot && SETTINGS.savedChatId) {
      if (autoTrader.isEnabled()) {
        autoTrader.execute(coinSymbol, direction, bot.telegram, closePrice);
      } else {
        handleCoinPriceRequest(bot, SETTINGS.savedChatId, coinSymbol, absChange.toFixed(2), direction);
      }
    }
  };

  const processCandle = async (symbol, candle) => {
    const openPrice  = parseFloat(candle.o);
    const closePrice = parseFloat(candle.c);
    const highPrice  = parseFloat(candle.h);
    const lowPrice   = parseFloat(candle.l);
    const volume     = parseFloat(candle.q);
    const isClosed   = candle.x;

    wsStatus.lastCandleAt = new Date().toISOString();

    if (!symbolData[symbol]) {
      symbolData[symbol] = { lastChange: 0, closes: [], highs: [], lows: [], volumes: [] };
    }
    const data = symbolData[symbol];

    if (isClosed) {
      data.lastChange = 0;
      data.closes.push(closePrice);  if (data.closes.length  > 25) data.closes.shift();
      data.highs.push(highPrice);    if (data.highs.length   > 25) data.highs.shift();
      data.lows.push(lowPrice);      if (data.lows.length    > 25) data.lows.shift();
      data.volumes.push(volume);     if (data.volumes.length > 25) data.volumes.shift();

      // BB перезаход: отдельный сигнал, не зависит от основных фильтров
      const coinSymbol = symbol.slice(0, -4);
      const reentryDir = checkBBReentry(symbol, data.closes);
      if (reentryDir) {
        const now = Date.now();
        const cooldownMs = (SETTINGS.handler.signalCooldownMin ?? 10) * 60_000;
        if (now - (signalCooldown[symbol] || 0) >= cooldownMs) {
          signalCooldown[symbol] = now;
          console.info(`🔄 [BB RE-ENTRY] ${symbol.toUpperCase()} ${reentryDir === 'up' ? '↑' : '↓'}`);
          fireSignal(coinSymbol, reentryDir, 0, closePrice);
        }
      }
    }

    // ── Основной сигнал ───────────────────────────────────────────────────────

    // 1. Процент движения текущей свечи
    const percentChange = ((closePrice - openPrice) / openPrice) * 100;
    const absChange     = Math.abs(percentChange);
    const direction     = percentChange > 0 ? 'up' : 'down';

    // 2. Порог изменения
    if (absChange < SETTINGS.handler.priceChangeThreshold) return;
    if (absChange < data.lastChange + SETTINGS.handler.priceChangeThreshold) return;

    // 3. Фильтр объёма
    if (data.volumes.length >= 5) {
      const prev = data.volumes.slice(0, -1);
      const avg  = prev.reduce((a, b) => a + b, 0) / prev.length;
      const multiplier = SETTINGS.handler.volumeMultiplier ?? 2;
      if (avg > 0 && volume < multiplier * avg) return;
      const minVol = SETTINGS.handler.minVolumeUsdt ?? 200_000;
      if (avg < minVol) return;
    }

    // 4. RSI
    if (data.closes.length >= 15) {
      const rsi = calculateRSI(data.closes);
      const rsiOverbought = SETTINGS.handler.rsiOverbought ?? 70;
      const rsiOversold   = SETTINGS.handler.rsiOversold   ?? 30;
      if (direction === 'up'   && rsi > rsiOverbought) return;
      if (direction === 'down' && rsi < rsiOversold)   return;
    }

    // 5. SMA10 тренд
    if (data.closes.length >= 10) {
      const sma10 = data.closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
      if (direction === 'up'   && closePrice < sma10) return;
      if (direction === 'down' && closePrice > sma10) return;
    }

    // 6. SuperTrend: торгуем только по направлению тренда
    if (data.closes.length >= 11) {
      const st = calculateSuperTrend(data.highs, data.lows, data.closes);
      if (st && st !== direction) return;
    }

    // 7. SL кулдаун
    if (isSlCoolingDown(symbol)) return;

    // 8. Общий кулдаун (синхронно, до любых await)
    const now = Date.now();
    const signalCooldownMs = (SETTINGS.handler.signalCooldownMin ?? 10) * 60_000;
    if (now - (signalCooldown[symbol] || 0) < signalCooldownMs) return;
    signalCooldown[symbol] = now;

    // 9. Подтверждение 1h
    const confirmed = await check1hConfirmation(symbol.slice(0, -4), direction);
    if (!confirmed) return;

    // 10. Фандинг-рейт: не входим против перегруженного рынка
    const fundingOk = await checkFundingRate(symbol.slice(0, -4), direction);
    if (!fundingOk) return;

    // 11. Open Interest: не входим при падающем OI (ликвидации, а не реальный импульс)
    const oiOk = await checkOI(symbol.slice(0, -4), direction);
    if (!oiOk) return;

    fireSignal(symbol.slice(0, -4), direction, absChange, closePrice);
    data.lastChange = absChange;
  };

  const connectWebSocket = (symbolsBatch, index) => {
    let attempt = 0;
    const connect = () => {
      console.info(`🔗 Подключение WebSocket №${index + 1}... (попытка ${attempt + 1})`);
      const streams = symbolsBatch.map(s => `${s.toLowerCase()}@kline_${SETTINGS.handler.temporaryCandle}`).join("/");
      const ws = new WebSocket(getWsUrl(streams));

      ws.addEventListener("open", () => {
        attempt = 0;
        wsStatus.running = true;
        console.info(`✅ WebSocket ${index + 1} на ${symbolsBatch.length} монет открыт.`);
      });

      ws.addEventListener("error", (error) => console.error(`❌ Ошибка WebSocket ${index + 1}:`, error));

      ws.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.data?.k) processCandle(data.data.s.toLowerCase(), data.data.k);
        } catch (error) {
          console.error("❌ Ошибка парсинга сообщения:", error);
        }
      });

      ws.addEventListener("close", () => {
        const delay = Math.min(1000 * 2 ** attempt, 60_000);
        console.info(`🔄 WebSocket ${index + 1} закрылся. Перезапуск через ${delay / 1000}s...`);
        attempt++;
        setTimeout(connect, delay);
      });
    };
    connect();
  };

  batches.forEach((batch, index) => connectWebSocket(batch, index));
};

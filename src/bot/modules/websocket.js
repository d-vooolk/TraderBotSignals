import WebSocket from "ws";
import {fetchFuturesSymbols, getFuturesCandlestickData} from "../../api/binanceApi.js";
import {handleCoinPriceRequest} from "../../handlers/handleCoinPriceRequest/handleCoinPriceRequest.js";
import {SETTINGS} from "../../settings.js";
import {isSlCoolingDown} from "../../handlers/utils/slCooldown.js";
import {autoTrader} from "../../handlers/utils/autoTrader.js";

const getWsUrl = (streams) => `wss://fstream.binance.com/stream?streams=${streams}`;

export const wsStatus = {running: false, symbolsCount: 0, lastSignalAt: null, lastCandleAt: null};

const cache1h = {};           // symbol -> { data, ts }
const CACHE_1H_TTL = 60_000; // 60 секунд

const signalCooldown = {};        // symbol -> timestamp

const calculateRSI = (closes, period = 14) => {
  if (closes.length < period + 1) return 50;
  const recent = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
};

const check1hConfirmation = async (symbol, direction) => {
  try {
    const now = Date.now();
    const cached = cache1h[symbol];
    const needsFetch = !cached || now - cached.ts >= CACHE_1H_TTL;
    const candles = needsFetch
      ? await getFuturesCandlestickData({symbol: `${symbol.toUpperCase()}USDT`, interval: '1h', limit: 2})
      : cached.data;
    if (needsFetch && candles) cache1h[symbol] = {data: candles, ts: now};

    if (!candles || candles.length < 1) return true;
    const c = candles[candles.length - 1];
    const change1h = parseFloat(c[4]) - parseFloat(c[1]);
    return direction === 'up' ? change1h >= 0 : change1h <= 0;
  } catch {
    return true;
  }
};

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
  const batches = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }

  console.info(`📦 Разбито на ${batches.length} пакетов по ${batchSize} монет.`);

  // { symbol: { lastChange, closes: [], volumes: [] } }
  const symbolData = {};

  const processCandle = async (symbol, candle) => {
    const openPrice  = parseFloat(candle.o);
    const closePrice = parseFloat(candle.c);
    const volume     = parseFloat(candle.q); // quote volume (USDT)
    const isClosed   = candle.x;             // true = свеча закрыта

    wsStatus.lastCandleAt = new Date().toISOString();

    if (!symbolData[symbol]) {
      symbolData[symbol] = { lastChange: 0, closes: [], volumes: [] };
    }
    const data = symbolData[symbol];

    // Историю накапливаем только по закрытым свечам — не по промежуточным
    if (isClosed) {
      data.lastChange = 0;

      data.closes.push(closePrice);
      if (data.closes.length > 25) data.closes.shift();

      data.volumes.push(volume);
      if (data.volumes.length > 25) data.volumes.shift();
    }

    // 1. Процент считаем от открытия — реальное движение свечи
    const percentChange = ((closePrice - openPrice) / openPrice) * 100;
    const absChange     = Math.abs(percentChange);
    const direction     = percentChange > 0 ? 'up' : 'down';
    const dirEmoji      = percentChange > 0 ? '📈 ВЫРОСЛА' : '📉 УПАЛА';

    // 2. Порог изменения
    if (absChange < SETTINGS.handler.priceChangeThreshold) return;
    if (absChange < data.lastChange + SETTINGS.handler.priceChangeThreshold) return;

    // 3. Фильтр объёма: текущий объём >= volumeMultiplier * среднего по предыдущим свечам
    if (data.volumes.length >= 5) {
      const prev = data.volumes.slice(0, -1);
      const avg  = prev.reduce((a, b) => a + b, 0) / prev.length;
      const multiplier = SETTINGS.handler.volumeMultiplier ?? 2;
      if (avg > 0 && volume < multiplier * avg) return;

      // 3b. Абсолютный минимум объёма — фильтрует микрокапы
      const minVol = SETTINGS.handler.minVolumeUsdt ?? 200_000;
      if (avg < minVol) return;
    }

    // 4. RSI-фильтр: не входим в уже перекупленный/перепроданный рынок
    if (data.closes.length >= 15) {
      const rsi = calculateRSI(data.closes);
      const rsiOverbought = SETTINGS.handler.rsiOverbought ?? 70;
      const rsiOversold   = SETTINGS.handler.rsiOversold   ?? 30;
      if (direction === 'up'   && rsi > rsiOverbought) return;
      if (direction === 'down' && rsi < rsiOversold)   return;
    }

    // 5. Фильтр тренда по SMA10: торгуем только по тренду
    if (data.closes.length >= 10) {
      const sma10 = data.closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
      if (direction === 'up'   && closePrice < sma10) return;
      if (direction === 'down' && closePrice > sma10) return;
    }

    // 6. Пост-SL кулдаун: не входить повторно если последняя сделка закрылась в SL
    if (isSlCoolingDown(symbol)) return;

    // 7. Общий кулдаун — СИНХРОННО до любых await, чтобы избежать гонки
    const now = Date.now();
    const signalCooldownMs = (SETTINGS.handler.signalCooldownMin ?? 10) * 60_000;
    if (now - (signalCooldown[symbol] || 0) < signalCooldownMs) return;
    signalCooldown[symbol] = now;

    // 8. Подтверждение на 1h таймфрейме (async — после кулдауна, чтобы не было гонки)
    const confirmed = await check1hConfirmation(symbol.slice(0, -4), direction);
    if (!confirmed) return;

    wsStatus.lastSignalAt = new Date().toISOString();
    const coinSymbol = symbol.slice(0, -4);
    console.info(`🚀 [ALERT] ${symbol.toUpperCase()} ${dirEmoji} на ${absChange.toFixed(2)}% за ${SETTINGS.handler.temporaryCandle}.`);

    if (bot && SETTINGS.savedChatId) {
      if (autoTrader.isEnabled()) {
        // Автотрейдинг: передаём текущую цену из WebSocket — не нужен отдельный API запрос
        autoTrader.execute(coinSymbol, direction, bot.telegram, closePrice);
      } else {
        // Ручной режим: отправляем сигнал с кнопкой
        handleCoinPriceRequest(bot, SETTINGS.savedChatId, coinSymbol, absChange.toFixed(2), direction);
      }
    }

    data.lastChange = absChange;
  };

  const connectWebSocket = (symbolsBatch, index) => {
    let attempt = 0;

    const connect = () => {
      console.info(`🔗 Подключение WebSocket №${index + 1}... (попытка ${attempt + 1})`);
      const streams = symbolsBatch.map((s) => `${s.toLowerCase()}@kline_${SETTINGS.handler.temporaryCandle}`).join("/");
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

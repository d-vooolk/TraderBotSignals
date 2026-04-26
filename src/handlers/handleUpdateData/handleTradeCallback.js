import {tradeStore} from "../utils/tradeStore.js";
import {placeTradeWithSLTP, getUsdtBalance, getOpenPosition} from "../../api/binanceTradingApi.js";
import {logTrade} from "../utils/tradeHistory.js";
import {SETTINGS} from "../../settings.js";
import {startPositionWatcher} from "../utils/positionWatcher.js";
import {getBinanceFuturesPrice} from "../../api/binanceApi.js";

const LARGE_POSITION_THRESHOLD = 25; // % — выше этого показываем предупреждение

const executeOpenTrade = async (ctx, trade) => {
  const balance = await getUsdtBalance();
  if (balance < 5) {
    return ctx.reply("❌ Недостаточно USDT на фьючерсном балансе.");
  }

  const existing = await getOpenPosition(`${trade.coinSymbol}USDT`);
  if (existing) {
    return ctx.reply(
      `⚠️ По *${trade.coinSymbol}* уже есть открытая позиция (${existing.positionAmt} контрактов).\nЗакрой её перед открытием новой.`,
      {parse_mode: 'Markdown'}
    );
  }

  const freshData = await getBinanceFuturesPrice(trade.coinSymbol);
  if (freshData?.price) {
    trade.entryPrice = parseFloat(freshData.price);
  }

  const usdtMargin = balance * (SETTINGS.trade.depositPercent / 100);
  const side       = trade.direction === 'up' ? 'BUY' : 'SELL';

  const result = await placeTradeWithSLTP({
    symbol:       `${trade.coinSymbol}USDT`,
    side,
    entryPrice:   trade.entryPrice,
    usdtMargin,
    leverage:     SETTINGS.trade.leverage,
    slPercent:    SETTINGS.trade.slPercent,
    tpPercent:    SETTINGS.trade.tpPercent,
    trailingStop: SETTINGS.trade.trailingStop,
    limitEntry:   SETTINGS.trade.limitEntry,
  });

  logTrade({
    coinSymbol: trade.coinSymbol,
    direction:  trade.direction,
    side,
    fillPrice:  result.fillPrice,
    slPrice:    result.slPrice,
    tp1Price:   result.tp1Price,
    tpPrice:    result.tpPrice,
    quantity:   result.quantity,
    margin:     usdtMargin,
    leverage:   SETTINGS.trade.leverage,
  });

  const emoji    = side === 'BUY' ? '🟩 LONG' : '🟥 SHORT';
  const slLabel  = SETTINGS.trade.trailingStop ? `🔄 Трейлинг ${SETTINGS.trade.slPercent}%` : `🛑 SL: <code>$${result.slPrice}</code>  (-${SETTINGS.trade.slPercent}%)`;

  await ctx.reply(
    `✅ <b>Позиция открыта!</b>\n\n` +
    `${emoji} <b>${trade.coinSymbol}</b>\n` +
    `📊 Кол-во: <code>${result.quantity}</code>\n` +
    `💰 Маржа: <code>$${usdtMargin.toFixed(2)}</code> (${SETTINGS.trade.leverage}x)\n` +
    `🎯 Вход: <code>$${result.fillPrice}</code>\n` +
    `${slLabel}\n` +
    `🎯 TP1: <code>$${result.tp1Price}</code>  (+${SETTINGS.trade.slPercent}%) — 50%\n` +
    `🎯 TP2: <code>$${result.tpPrice}</code>  (+${SETTINGS.trade.tpPercent}%) — 50%`,
    {parse_mode: 'HTML'}
  );

  // п.3: позиция открыта, но SL/TP не выставились — предупреждаем
  if (result.slTpError) {
    await ctx.reply(
      `⚠️ <b>Внимание!</b> Позиция открыта, но SL/TP не выставились:\n<code>${result.slTpError}</code>\n\nВыстави стоп вручную на Binance!`,
      {parse_mode: 'HTML'}
    );
  }

  startPositionWatcher(`${trade.coinSymbol}USDT`, ctx.telegram, result.algoIds ?? []);
};

export const handleTradeCallback = async (ctx) => {
  const tradeId = ctx.match?.[1];
  const trade   = tradeStore.get(tradeId);

  if (!trade) {
    return ctx.answerCbQuery("❌ Сигнал устарел. Дождитесь нового.", {show_alert: true});
  }

  if (SETTINGS.trade.depositPercent >= LARGE_POSITION_THRESHOLD) {
    await ctx.answerCbQuery();
    const balance    = await getUsdtBalance();
    const margin     = (balance * SETTINGS.trade.depositPercent / 100).toFixed(2);
    const dirLabel   = trade.direction === 'up' ? '🟩 LONG' : '🟥 SHORT';
    return ctx.reply(
      `⚠️ *Подтверди сделку*\n\n` +
      `${dirLabel} *${trade.coinSymbol}*\n` +
      `Маржа: *$${margin}* (${SETTINGS.trade.depositPercent}% баланса × ${SETTINGS.trade.leverage}x)\n\n` +
      `Нажми «Подтвердить» чтобы открыть позицию.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {text: '✅ Подтвердить', callback_data: `confirmTrade_${tradeId}`},
            {text: '❌ Отмена',      callback_data: `cancelTrade_${tradeId}`},
          ]],
        },
      }
    );
  }

  await ctx.answerCbQuery("⏳ Открываю позицию...");
  try {
    await executeOpenTrade(ctx, trade);
    tradeStore.delete(tradeId); // удаляем только после успеха
  } catch (err) {
    console.error("Ошибка при открытии позиции:", err?.response?.data || err.message);
    const msg = err?.response?.data?.msg || err.message || "Неизвестная ошибка";
    await ctx.reply(`❌ Ошибка открытия позиции: ${msg}`);
  }
};

export const handleConfirmTradeCallback = async (ctx) => {
  const tradeId = ctx.match?.[1];
  const trade   = tradeStore.get(tradeId);

  if (!trade) {
    return ctx.answerCbQuery("❌ Сигнал устарел.", {show_alert: true});
  }

  await ctx.answerCbQuery("⏳ Открываю позицию...");
  try {
    await executeOpenTrade(ctx, trade);
    tradeStore.delete(tradeId);
  } catch (err) {
    console.error("Ошибка при открытии позиции:", err?.response?.data || err.message);
    const msg = err?.response?.data?.msg || err.message || "Неизвестная ошибка";
    await ctx.reply(`❌ Ошибка открытия позиции: ${msg}`);
  }
};

export const handleCancelTradeCallback = async (ctx) => {
  const tradeId = ctx.match?.[1];
  tradeStore.delete(tradeId);
  await ctx.answerCbQuery("❌ Сделка отменена.");
  await ctx.editMessageReplyMarkup({inline_keyboard: []});
};

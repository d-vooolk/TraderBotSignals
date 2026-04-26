import {tradeStore} from "../utils/tradeStore.js";
import {placeTradeWithSLTP, getUsdtBalance} from "../../api/binanceTradingApi.js";
import {SETTINGS} from "../../settings.js";

export const handleTradeCallback = async (context) => {
  const tradeId = context.match?.[1];
  const trade   = tradeStore.get(tradeId);

  if (!trade) {
    return context.answerCbQuery("❌ Сигнал устарел. Дождитесь нового.", {show_alert: true});
  }

  await context.answerCbQuery("⏳ Открываю позицию...");

  try {
    const balance = await getUsdtBalance();
    if (balance < 5) {
      return context.reply("❌ Недостаточно USDT на фьючерсном балансе.");
    }

    const usdtMargin = balance * (SETTINGS.trade.depositPercent / 100);
    const side       = trade.direction === 'up' ? 'BUY' : 'SELL';

    const result = await placeTradeWithSLTP({
      symbol:     `${trade.coinSymbol}USDT`,
      side,
      entryPrice: trade.entryPrice,
      usdtMargin,
      leverage:   SETTINGS.trade.leverage,
      slPercent:  SETTINGS.trade.slPercent,
      tpPercent:  SETTINGS.trade.tpPercent,
    });

    tradeStore.delete(tradeId);

    const emoji = side === 'BUY' ? '🟩 LONG' : '🟥 SHORT';
    await context.reply(
      `✅ <b>Позиция открыта!</b>\n\n` +
      `${emoji} <b>${trade.coinSymbol}</b>\n` +
      `📊 Кол-во: <code>${result.quantity}</code>\n` +
      `💰 Маржа: <code>$${usdtMargin.toFixed(2)}</code> (${SETTINGS.trade.leverage}x)\n` +
      `🎯 Вход: <code>$${result.fillPrice}</code>\n` +
      `🛑 SL: <code>$${result.slPrice}</code>  (-${SETTINGS.trade.slPercent}%)\n` +
      `🎯 TP: <code>$${result.tpPrice}</code>  (+${SETTINGS.trade.tpPercent}%)`,
      {parse_mode: 'HTML'}
    );
  } catch (err) {
    console.error("Ошибка при открытии позиции:", err?.response?.data || err.message);
    const msg = err?.response?.data?.msg || err.message || "Неизвестная ошибка";
    await context.reply(`❌ Ошибка открытия позиции: ${msg}`);
  }
};

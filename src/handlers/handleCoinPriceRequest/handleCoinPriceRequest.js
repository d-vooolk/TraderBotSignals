import {getPrice} from "../utils/getPrice.js";
import {getError} from "../utils/getError.js";
import {getUndefinedCoinNotification} from "../utils/getUndefinedCoinNotification.js";
import {getSendData} from "../utils/getSendData.js";
import {getFuturesCandlestickData} from "../../api/binanceApi.js";
import {candlestickParams} from "../constants/candlestick.js";
import {SETTINGS} from "../../settings.js";
import {generateChartURL} from "./generateCandlestickChart.js";

export const handleCoinPriceRequest = async (context, chat_id, symbol, changePriceSignal, direction = null) => {

  if (!chat_id) {
    console.error("❌ Ошибка: chat_id не найден");
    return;
  }

  const coinSymbol = symbol?.toUpperCase();

  try {
    if (!coinSymbol) return;
    context.telegram.sendChatAction(chat_id, "typing");

    if (context?.message?.message_id) {
      await context.deleteMessage(context.message.message_id);
    }

    const interval = SETTINGS.candlestick.interval;
    const limit    = SETTINGS.candlestick.limit;
    const params   = candlestickParams(coinSymbol, interval, limit);
    const [futuresData, candles] = await Promise.all([
      getPrice(coinSymbol),
      getFuturesCandlestickData(params),
    ]);

    if (!futuresData) {
      return await getUndefinedCoinNotification(context, coinSymbol);
    }

    const [, message, buttons] = await getSendData(
      coinSymbol, futuresData, candles, changePriceSignal, direction, interval, limit, true,
    );

    const sentMsg = await context.telegram.sendMessage(chat_id, message, {
      parse_mode: "MarkdownV2",
      ...buttons,
    });

    generateChartURL(candles).then(async (chartUrl) => {
      if (!chartUrl) return;
      try {
        await context.telegram.editMessageMedia(
          chat_id,
          sentMsg.message_id,
          null,
          { type: 'photo', media: chartUrl, caption: message, parse_mode: 'MarkdownV2' },
          { reply_markup: buttons.reply_markup },
        );
      } catch { /* chart unavailable — text message stays */ }
    }).catch(() => {});

  } catch (error) {
    await getError(context, chat_id, coinSymbol, error);
  }
};

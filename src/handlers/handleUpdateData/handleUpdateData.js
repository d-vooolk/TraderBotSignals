import {getPrice} from "../utils/getPrice.js";
import {getError} from "../utils/getError.js";
import {getUndefinedCoinNotification} from "../utils/getUndefinedCoinNotification.js";
import {getSendData} from "../utils/getSendData.js";
import {getFuturesCandlestickData} from "../../api/binanceApi.js";
import {candlestickParams} from "../constants/candlestick.js";

export const handleUpdateCallback = async (context) => {
  const callbackData = context.update.callback_query.data;
  const parts = callbackData.split('_');

  // Формат: update_COIN_direction_interval_limit (новый, 5 частей)
  // или:    update_COIN_interval_limit            (старый, 4 части)
  let coinSymbol, direction, interval, limit;
  if (parts.length >= 5) {
    [, coinSymbol, direction, interval, limit] = parts;
    if (direction === 'none') direction = null;
  } else {
    [, coinSymbol, interval, limit] = parts;
    direction = null;
  }

  if (parts[0] === 'update') {
    try {
      const params = candlestickParams(coinSymbol, interval, parseInt(limit));
      const [futuresData, candles] = await Promise.all([
        getPrice(coinSymbol),
        getFuturesCandlestickData(params),
      ]);

      if (!futuresData) {
        return await getUndefinedCoinNotification(context, coinSymbol);
      }

      // direction передаётся из оригинального сигнала — getSendData пересчитает
      // точку входа по текущей цене и создаст свежую запись в tradeStore
      const [chartUrl, message, buttons] = await getSendData(coinSymbol, futuresData, candles, null, direction, interval, parseInt(limit));

      if (chartUrl) {
        try {
          await context.editMessageMedia({ type: 'photo', media: chartUrl });
          await context.editMessageCaption(message, {
            parse_mode: "MarkdownV2",
            reply_markup: buttons.reply_markup,
          });
        } catch {
          await context.telegram.sendPhoto(context.chat.id, chartUrl, {
            caption: message,
            parse_mode: "MarkdownV2",
            ...buttons,
          });
        }
      } else {
        try {
          await context.editMessageText(message, {
            parse_mode: "MarkdownV2",
            reply_markup: buttons.reply_markup,
          });
        } catch {
          await context.editMessageCaption(message, {
            parse_mode: "MarkdownV2",
            reply_markup: buttons.reply_markup,
          });
        }
      }

    } catch (error) {
      await getError(context, context?.chat?.id, coinSymbol, error);
    }
  }
};

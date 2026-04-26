import {getPrice} from "../utils/getPrice.js";
import {getError} from "../utils/getError.js";
import {getUndefinedCoinNotification} from "../utils/getUndefinedCoinNotification.js";
import {getSendData} from "../utils/getSendData.js";
import {getFuturesCandlestickData} from "../../api/binanceApi.js";
import {candlestickParams} from "../constants/candlestick.js";

export const handleUpdateCallback = async (context) => {
  const callbackData = context.update.callback_query.data;
  const [action, coinSymbol, interval, limit] = callbackData.split('_');

  if (action === 'update') {
    try {
      const params = candlestickParams(coinSymbol, interval, parseInt(limit));
      const [futuresData, candles] = await Promise.all([
        getPrice(coinSymbol),
        getFuturesCandlestickData(params),
      ]);

      if (!futuresData) {
        return await getUndefinedCoinNotification(context, coinSymbol);
      }

      const [chartUrl, message, buttons] = await getSendData(coinSymbol, futuresData, candles, null, null);

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

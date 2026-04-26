import {getPrice} from "../utils/getPrice.js";
import {getError} from "../utils/getError.js";
import {getUndefinedCoinNotification} from "../utils/getUndefinedCoinNotification.js";
import {getSendData} from "../utils/getSendData.js";
import {SETTINGS} from "../../settings.js";

export const handleCoinPriceRequest = async (context, chat_id, symbol, changePriceSignal, direction = null) => {

  if (!chat_id) {
    console.error("❌ Ошибка: chat_id не найден");
    return;
  }

  const coinSymbol = symbol?.toUpperCase();

  try {
    if (!coinSymbol) return;
    await context.telegram.sendChatAction(chat_id, "typing");

    if (context?.message?.message_id) {
      await context.deleteMessage(context.message.message_id);
    }

    const futuresData = await getPrice(coinSymbol);

    if (!futuresData) {
      return await getUndefinedCoinNotification(context, coinSymbol);
    }

    const [chartUrl, message, buttons] = await getSendData(
      coinSymbol,
      futuresData,
      changePriceSignal,
      SETTINGS.candlestick.interval,
      SETTINGS.candlestick.limit,
      direction,
    );

    if (chartUrl) {
      context.telegram.sendPhoto(chat_id, chartUrl, {
        caption: message,
        parse_mode: "MarkdownV2",
        ...buttons,
      });
    } else {
      context.telegram.sendMessage(chat_id, message, {
        parse_mode: "MarkdownV2",
        ...buttons,
      });
    }

  } catch (error) {
    await getError(context, chat_id, coinSymbol, error);
  }
};
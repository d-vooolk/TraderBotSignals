import {formatCoinResponse} from "../handleCoinPriceRequest/formatResponse.js";
import {getCandlestickData} from "../../api/binanceApi.js";
import {candlestickParams} from "../constants/candlestick.js";
import {generateChartURL} from "../handleCoinPriceRequest/generateCandlestickChart.js";
import {generateButtons} from "./generateButtons.js";
import {Markup} from "telegraf";

export const getSendData = async (
  coinSymbol,
  spotData,
  futuresData,
  changePriceSignal,
  interval = "15m",
  limit = 60,
  direction = null,
) => {
  const resCandlestick = await getCandlestickData(candlestickParams(coinSymbol, interval, limit));
  const chartUrl = await generateChartURL(resCandlestick);

  // Рассчитываем параметры сделки один раз — используются и в сообщении и в кнопке
  let tradeParams = null;
  if (direction) {
    const rawPrice = parseFloat(spotData?.price) || parseFloat(futuresData?.price);
    if (rawPrice && !isNaN(rawPrice)) {
      const isLong = direction === 'up';
      tradeParams = {
        direction,
        entryPrice: rawPrice,
        slPrice:    isLong ? rawPrice * 0.98 : rawPrice * 1.02,
        tp1Price:   isLong ? rawPrice * 1.02 : rawPrice * 0.98,
        tpPrice:    isLong ? rawPrice * 1.04 : rawPrice * 0.96,
      };
    }
  }

  const message = formatCoinResponse({coinSymbol, spotData, futuresData, changePriceSignal, tradeParams});
  const buttons = Markup.inlineKeyboard(generateButtons(coinSymbol, tradeParams));

  return [chartUrl, message, buttons, resCandlestick];
};

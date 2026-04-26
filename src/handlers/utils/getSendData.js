import {formatCoinResponse} from "../handleCoinPriceRequest/formatResponse.js";
import {getFuturesCandlestickData} from "../../api/binanceApi.js";
import {candlestickParams} from "../constants/candlestick.js";
import {SETTINGS} from "../../settings.js";
import {generateChartURL} from "../handleCoinPriceRequest/generateCandlestickChart.js";
import {generateButtons} from "./generateButtons.js";
import {Markup} from "telegraf";

export const getSendData = async (
  coinSymbol,
  futuresData,
  changePriceSignal,
  interval = "15m",
  limit = 60,
  direction = null,
) => {
  const params = candlestickParams(coinSymbol, interval, limit);
  const resCandlestick = await getFuturesCandlestickData(params);
  const chartUrl = await generateChartURL(resCandlestick);

  let tradeParams = null;
  if (direction) {
    const rawPrice = parseFloat(futuresData?.price);
    if (rawPrice && !isNaN(rawPrice)) {
      const isLong = direction === 'up';
      const {slPercent, tpPercent} = SETTINGS.trade;
      tradeParams = {
        direction,
        entryPrice: rawPrice,
        slPrice:  isLong ? rawPrice * (1 - slPercent / 100) : rawPrice * (1 + slPercent / 100),
        tp1Price: isLong ? rawPrice * (1 + slPercent / 100) : rawPrice * (1 - slPercent / 100),
        tpPrice:  isLong ? rawPrice * (1 + tpPercent / 100) : rawPrice * (1 - tpPercent / 100),
      };
    }
  }

  const message = formatCoinResponse({coinSymbol, futuresData, changePriceSignal, tradeParams});
  const buttons = Markup.inlineKeyboard(generateButtons(coinSymbol, tradeParams));

  return [chartUrl, message, buttons, resCandlestick];
};

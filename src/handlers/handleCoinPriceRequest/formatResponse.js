import {cleanData, formatLargeNumber} from "./helpers.js";
import {SETTINGS} from "../../settings.js";

const formatPrice = (n) => {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1)    return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(7);
};

export const formatCoinResponse = ({coinSymbol, futuresData, changePriceSignal = null, tradeParams = null}) => {

  const {
    price: futuresPrice = null,
    high: futuresHigh = null,
    low: futuresLow = null,
    volume: futuresVolume = null,
    change: futuresChange = null,
  } = cleanData(futuresData) || {};

  const changePriceFinal = changePriceSignal
    ? `🔥  За последние *${SETTINGS.handler.temporaryCandle}* \`\\(${changePriceSignal}\`%\\)` + '\n'
    : '';

  const title = `${futuresChange === 0 ? '⚪️' : (futuresChange > 0 ? '🟢' : '🔴')} \`${coinSymbol}\` \`\\(${futuresChange}\`%\\)` + '\n';

  const futures = futuresPrice
    ? `🎢 *FT:*  $\`${futuresPrice}\`` + '\n'
    : '';

  const minMax = futuresHigh && futuresLow
    ? `⛅️️  $\`${futuresHigh}\`   🌧  $\`${futuresLow}\`` + '\n'
    : '';

  const volumeFinal = formatLargeNumber(futuresVolume)
    ? `💰  $\`${formatLargeNumber(futuresVolume)}\`` + '\n'
    : '';

  const slTp = (() => {
    if (!tradeParams) return '';
    const {direction, slPrice, tp1Price, tpPrice} = tradeParams;
    const isLong = direction === 'up';
    const label  = isLong ? '🟩 *LONG*' : '🟥 *SHORT*';
    return `\n${label}\n` +
      `🛑 *SL:*   $\`${formatPrice(slPrice)}\`` + '\n' +
      `🎯 *TP1:* $\`${formatPrice(tp1Price)}\`` + '\n' +
      `🎯 *TP2:* $\`${formatPrice(tpPrice)}\`` + '\n';
  })();

  return `${changePriceFinal}\n${title}\n${futures}\n${minMax}${volumeFinal}${slTp}`;
};

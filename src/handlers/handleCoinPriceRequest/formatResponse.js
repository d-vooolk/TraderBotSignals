import {cleanData, formatLargeNumber} from "./helpers.js";
import {SETTINGS} from "../../settings.js";

const formatPrice = (n) => {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1)    return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(7);
};

export const formatCoinResponse = ({coinSymbol, spotData, futuresData, changePriceSignal = null, tradeParams = null}) => {

  const {
    price: spotPrice = null,
    high: spotHigh = null,
    low: spotLow = null,
    volume: spotVolume = null,
    change: spotChange = null,
  } = cleanData(spotData) || {};

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

  const changePars = (spotChange || futuresChange);
  const title = `${changePars === 0 ? '⚪️' : (changePars > 0 ? '🟢' : '🔴')} \`${coinSymbol}\` \`\\(${changePars}\`%\\)` + '\n';

  const spot = spotPrice
    ? `🏦 *SP:*  $\`${spotPrice}\`` + '\n'
    : '';

  const futures = futuresPrice
    ? `🎢 *FT:*  $\`${futuresPrice}\`` + '\n'
    : '';

  const minMax = (spotHigh || futuresHigh) && (spotLow || futuresLow)
    ? `⛅️️  $\`${spotHigh || futuresHigh}\`   🌧  $\`${spotLow || futuresLow}\`` + '\n'
    : '';

  const volumePars = formatLargeNumber(spotVolume || futuresVolume);
  const volumeFinal = volumePars
    ? `💰  $\`${volumePars}\`` + '\n'
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

  return `${changePriceFinal}\n${title}\n${spot}${futures}\n${minMax}${volumeFinal}${slTp}`;
};

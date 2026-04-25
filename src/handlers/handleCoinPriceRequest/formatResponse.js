import {cleanData, formatLargeNumber} from "./helpers.js";
import {SETTINGS} from "../../settings.js";

const formatPrice = (n) => {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1)    return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(7);
};

export const formatCoinResponse = ({coinSymbol, spotData, futuresData, changePriceSignal = null, direction = null}) => {

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

  const futures =
    futuresPrice
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
    if (!direction || (!spotPrice && !futuresPrice)) return '';
    const entry = parseFloat(spotPrice || futuresPrice);
    if (!entry || isNaN(entry)) return '';
    const isLong = direction === 'up';
    const sl  = isLong ? entry * 0.98  : entry * 1.02;
    const tp1 = isLong ? entry * 1.02  : entry * 0.98;
    const tp2 = isLong ? entry * 1.04  : entry * 0.96;
    const label = isLong ? '🟩 *LONG*' : '🟥 *SHORT*';
    return `\n${label}\n` +
      `🛑 *SL:*   $\`${formatPrice(sl)}\`` + '\n' +
      `🎯 *TP1:* $\`${formatPrice(tp1)}\`` + '\n' +
      `🎯 *TP2:* $\`${formatPrice(tp2)}\`` + '\n';
  })();

  return `${changePriceFinal}\n${title}\n${spot}${futures}\n${minMax}${volumeFinal}${slTp}`;
};


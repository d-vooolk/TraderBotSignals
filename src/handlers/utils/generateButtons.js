import {timeframes} from "../constants/buttons.js";
import {Markup} from "telegraf";
import {tradeStore} from "./tradeStore.js";
import {SETTINGS} from "../../settings.js";

const hasApiKeys = () => !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);

export const generateButtons = (coinSymbol, tradeParams = null, interval = SETTINGS.candlestick.interval, limit = SETTINGS.candlestick.limit) => {
  const dir = tradeParams?.direction ?? 'none';
  const topLine = [
    ...timeframes.map(({label, interval: tfInterval, limit: tfLimit}) =>
      Markup.button.callback(label, `update_${coinSymbol}_${dir}_${tfInterval}_${tfLimit}`)
    ),
    Markup.button.callback('🔄', `update_${coinSymbol}_${dir}_${interval}_${limit}`),
  ];

  const bottomLine = [
    Markup.button.url('🔗 Binance', `https://www.binance.com/futures/${coinSymbol}USDT`),
  ];

  if (tradeParams && hasApiKeys()) {
    const tradeId = crypto.randomUUID();
    const label   = tradeParams.direction === 'up'
      ? `✅ LONG ${SETTINGS.trade.leverage}x`
      : `✅ SHORT ${SETTINGS.trade.leverage}x`;

    tradeStore.set(tradeId, {coinSymbol, ...tradeParams});
    bottomLine.unshift(Markup.button.callback(label, `openTrade_${tradeId}`));
  }

  return [topLine, bottomLine];
};

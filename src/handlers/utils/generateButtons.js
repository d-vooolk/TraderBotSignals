import {timeframes} from "../constants/buttons.js";
import {Markup} from "telegraf";
import {tradeStore} from "./tradeStore.js";
import {SETTINGS} from "../../settings.js";

const hasApiKeys = () => !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);

export const generateButtons = (coinSymbol, tradeParams = null) => {
  const topLine = timeframes.map(({label, interval, limit}) =>
    Markup.button.callback(label, `update_${coinSymbol}_${interval}_${limit}`)
  );

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

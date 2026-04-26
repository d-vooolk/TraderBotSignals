import path from "path";

export const COMMANDS = {
  COIN_PRICE: "$",
};

export const SETTINGS_TEXT = {
  settingsError: '❌ Ошибка при загрузке настроек:',
  saveError: '❌ Ошибка при сохранении настроек:',
}

export const SETTINGS_FILE = path.resolve("settings.json");

export const DEFAULT_SETTINGS = {
  candlestick: {
    interval: "15m",
    limit: 60,
  },
  handler: {
    temporaryCandle: "15m",
    priceChangeThreshold: 2,
    signalCooldownMin: 10,
    slCooldownMin: 45,
    volumeMultiplier: 2,
    minVolumeUsdt: 200000,
    rsiOverbought: 70,
    rsiOversold: 30,
  },
  trade: {
    leverage: 5,
    depositPercent: 10,
    slPercent: 1,
    tpPercent: 3,
    breakEvenAt: 0.5,
    trailingStop: false,
    limitEntry: false,
    timeStopMin: 45,
  },
  autoTrade: {
    leverage: 5,
    depositPercent: 10,
    dailyStopLoss: 10,
  },
  savedChatId: null,
};
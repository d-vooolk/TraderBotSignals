import {SETTINGS} from "../../settings.js";
import {SETTINGS_OPTIONS} from "./commands/constants.js";
import {autoTrader} from "../../handlers/utils/autoTrader.js";

const BACK = {text: '← Назад', callback_data: 'settings_menu'};
const mark = (label, active) => active ? `✅ ${label}` : label;

const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
};

export const MENU_TITLE = '⚙️ Настройки бота';

export const SUB_TITLES = {
  deposit:  '💰 Размер позиции (% от баланса)',
  leverage: '⚡ Плечо',
  sltp:     '🛡 Стоп-лосс / Тейк-профит',
};

export const buildMainKeyboard = () => ({
  inline_keyboard: [
    [
      {text: `💰 Позиция: ${SETTINGS.trade.depositPercent}%`, callback_data: 'settings_show_deposit'},
      {text: `⚡ Плечо: ${SETTINGS.trade.leverage}x`,         callback_data: 'settings_show_leverage'},
    ],
    [
      {text: `🛡 SL ${SETTINGS.trade.slPercent}% / TP ${SETTINGS.trade.tpPercent}%`, callback_data: 'settings_show_sltp'},
    ],
    [
      {
        text: SETTINGS.trade.trailingStop ? '🔄 Трейлинг-стоп: ВКЛ' : '🔄 Трейлинг-стоп: ВЫКЛ',
        callback_data: 'settings_toggle_trailing',
      },
      {
        text: SETTINGS.trade.limitEntry ? '📊 Лимит-вход: ВКЛ' : '📊 Лимит-вход: ВЫКЛ',
        callback_data: 'settings_toggle_limit',
      },
    ],
    [
      {text: '🤖 Автотрейдинг', callback_data: 'autotrade_menu'},
    ],
  ],
});

export const buildSubKeyboard = (type) => {
  switch (type) {
    case 'deposit': {
      const cur = SETTINGS.trade.depositPercent;
      const btns = SETTINGS_OPTIONS.deposits.map(v => ({
        text: mark(`${v}%`, v === cur),
        callback_data: `settings_set_deposit_${v}`,
      }));
      return {inline_keyboard: [...chunk(btns, 3), [BACK]]};
    }
    case 'leverage': {
      const cur = SETTINGS.trade.leverage;
      const btns = SETTINGS_OPTIONS.leverages.map(v => ({
        text: mark(`${v}x`, v === cur),
        callback_data: `settings_set_leverage_${v}`,
      }));
      return {inline_keyboard: [...chunk(btns, 3), [BACK]]};
    }
    case 'sltp': {
      const {slPercent: sl, tpPercent: tp} = SETTINGS.trade;
      const btns = SETTINGS_OPTIONS.sltpPairs.map(([s, t]) => ({
        text: mark(`SL${s}/TP${t}`, s === sl && t === tp),
        callback_data: `settings_set_sltp_${s}_${t}`,
      }));
      return {inline_keyboard: [...chunk(btns, 3), [BACK]]};
    }
    default:
      return buildMainKeyboard();
  }
};

export const AUTO_TRADE_TITLE = '🤖 Автотрейдинг';

export const buildAutoTradeKeyboard = () => {
  const enabled  = autoTrader.isEnabled();
  const pnl      = autoTrader.getDailyPnl();
  const earned   = autoTrader.getDailyEarned();
  const lost     = autoTrader.getDailyLost();
  const stopHit  = autoTrader.isStopHit();
  const { leverage, depositPercent, dailyStopLoss } = SETTINGS.autoTrade;

  const toggleBtn = enabled
    ? {text: '⏹ Остановить', callback_data: 'autotrade_toggle'}
    : {text: '▶️ Запустить',  callback_data: 'autotrade_toggle'};

  const pnlSign  = pnl >= 0 ? '+' : '';
  const stopInfo = stopHit ? '  ⛔' : '';

  return {
    inline_keyboard: [
      [{text: `✅ +$${earned.toFixed(2)}  ❌ -$${lost.toFixed(2)}  Итого: ${pnlSign}$${pnl.toFixed(2)} / Стоп: $${dailyStopLoss}${stopInfo}`, callback_data: 'autotrade_menu'}],
      [toggleBtn],
      [
        {text: mark(`⚡ Плечо: ${leverage}x`,       false), callback_data: 'autotrade_show_leverage'},
        {text: mark(`💰 Позиция: ${depositPercent}%`, false), callback_data: 'autotrade_show_deposit'},
      ],
      [{text: `🛑 Стоп дня: $${dailyStopLoss}`, callback_data: 'autotrade_show_stop'}],
      [{text: '← Назад', callback_data: 'settings_menu'}],
    ],
  };
};

export const buildAutoTradeSubKeyboard = (type) => {
  const BACK = {text: '← Назад', callback_data: 'autotrade_menu'};
  switch (type) {
    case 'leverage': {
      const cur  = SETTINGS.autoTrade.leverage;
      const btns = SETTINGS_OPTIONS.leverages.map(v => ({
        text: mark(`${v}x`, v === cur),
        callback_data: `autotrade_set_leverage_${v}`,
      }));
      return {inline_keyboard: [...chunk(btns, 3), [BACK]]};
    }
    case 'deposit': {
      const cur  = SETTINGS.autoTrade.depositPercent;
      const btns = SETTINGS_OPTIONS.deposits.map(v => ({
        text: mark(`${v}%`, v === cur),
        callback_data: `autotrade_set_deposit_${v}`,
      }));
      return {inline_keyboard: [...chunk(btns, 3), [BACK]]};
    }
    case 'stop': {
      const cur  = SETTINGS.autoTrade.dailyStopLoss;
      const btns = SETTINGS_OPTIONS.autoTradeStops.map(v => ({
        text: mark(`$${v}`, v === cur),
        callback_data: `autotrade_set_stop_${v}`,
      }));
      return {inline_keyboard: [...chunk(btns, 3), [BACK]]};
    }
    default:
      return buildAutoTradeKeyboard();
  }
};

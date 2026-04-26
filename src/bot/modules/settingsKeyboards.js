import {SETTINGS} from "../../settings.js";
import {SETTINGS_OPTIONS} from "./commands/constants.js";

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
      {text: `⚡ Плечо: ${SETTINGS.trade.leverage}x`, callback_data: 'settings_show_leverage'},
    ],
    [
      {text: `🛡 SL ${SETTINGS.trade.slPercent}% / TP ${SETTINGS.trade.tpPercent}%`, callback_data: 'settings_show_sltp'},
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

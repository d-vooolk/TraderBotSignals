import {handleUpdateCallback} from "../../../handlers/handleUpdateData/handleUpdateData.js";
import {handleTradeCallback, handleConfirmTradeCallback, handleCancelTradeCallback} from "../../../handlers/handleUpdateData/handleTradeCallback.js";
import {BOT_COMMANDS_DATA} from "../commands/constants.js";
import {SETTINGS, saveSettings} from "../../../settings.js";
import {buildMainKeyboard, buildSubKeyboard, MENU_TITLE, SUB_TITLES} from "../settingsKeyboards.js";

export const setupActions = (bot) => {
  bot.action(BOT_COMMANDS_DATA.update, async (ctx) => {
    try {
      await ctx.answerCbQuery('🔄 Обновляем данные...');
      await handleUpdateCallback(ctx);
    } catch (e) {
      await ctx.reply('❌ Ошибка при обновлении данных.');
    }
  });

  bot.action(BOT_COMMANDS_DATA.openTrade, async (ctx) => {
    try {
      await handleTradeCallback(ctx);
    } catch (e) {
      console.error('Ошибка при открытии сделки:', e);
      await ctx.reply('❌ Ошибка при открытии сделки.');
    }
  });

  bot.action(BOT_COMMANDS_DATA.confirmTrade, async (ctx) => {
    try { await handleConfirmTradeCallback(ctx); }
    catch (e) { await ctx.reply('❌ Ошибка при открытии сделки.'); }
  });

  bot.action(BOT_COMMANDS_DATA.cancelTrade, async (ctx) => {
    try { await handleCancelTradeCallback(ctx); }
    catch (e) { await ctx.answerCbQuery(); }
  });

  bot.action(BOT_COMMANDS_DATA.settingsMenu, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(MENU_TITLE, {reply_markup: buildMainKeyboard()});
  });

  bot.action(BOT_COMMANDS_DATA.settingsShowSub, async (ctx) => {
    const type = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `${MENU_TITLE}\n\n${SUB_TITLES[type]}`,
      {reply_markup: buildSubKeyboard(type)}
    );
  });

  bot.action(BOT_COMMANDS_DATA.settingsSetDeposit, async (ctx) => {
    SETTINGS.trade.depositPercent = parseFloat(ctx.match[1]);
    saveSettings(SETTINGS);
    await ctx.answerCbQuery(`✅ Позиция: ${ctx.match[1]}%`);
    await ctx.editMessageText(MENU_TITLE, {reply_markup: buildMainKeyboard()});
  });

  bot.action(BOT_COMMANDS_DATA.settingsSetLeverage, async (ctx) => {
    SETTINGS.trade.leverage = parseInt(ctx.match[1]);
    saveSettings(SETTINGS);
    await ctx.answerCbQuery(`✅ Плечо: ${ctx.match[1]}x`);
    await ctx.editMessageText(MENU_TITLE, {reply_markup: buildMainKeyboard()});
  });

  bot.action(BOT_COMMANDS_DATA.settingsSetSltp, async (ctx) => {
    const [sl, tp] = ctx.match[1].split('_').map(Number);
    SETTINGS.trade.slPercent = sl;
    SETTINGS.trade.tpPercent = tp;
    saveSettings(SETTINGS);
    await ctx.answerCbQuery(`✅ SL ${sl}% / TP ${tp}%`);
    await ctx.editMessageText(MENU_TITLE, {reply_markup: buildMainKeyboard()});
  });

  bot.action(BOT_COMMANDS_DATA.settingsToggleTrailing, async (ctx) => {
    SETTINGS.trade.trailingStop = !SETTINGS.trade.trailingStop;
    saveSettings(SETTINGS);
    const state = SETTINGS.trade.trailingStop ? 'ВКЛ' : 'ВЫКЛ';
    await ctx.answerCbQuery(`🔄 Трейлинг-стоп: ${state}`);
    await ctx.editMessageText(MENU_TITLE, {reply_markup: buildMainKeyboard()});
  });

  bot.action(BOT_COMMANDS_DATA.settingsToggleLimit, async (ctx) => {
    SETTINGS.trade.limitEntry = !SETTINGS.trade.limitEntry;
    saveSettings(SETTINGS);
    const state = SETTINGS.trade.limitEntry ? 'ВКЛ' : 'ВЫКЛ';
    await ctx.answerCbQuery(`📊 Лимит-вход: ${state}`);
    await ctx.editMessageText(MENU_TITLE, {reply_markup: buildMainKeyboard()});
  });
};

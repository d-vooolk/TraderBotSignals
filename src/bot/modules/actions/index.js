import {handleUpdateCallback} from "../../../handlers/handleUpdateData/handleUpdateData.js";
import {handleTradeCallback, handleConfirmTradeCallback, handleCancelTradeCallback} from "../../../handlers/handleUpdateData/handleTradeCallback.js";
import {BOT_COMMANDS_DATA} from "../commands/constants.js";
import {SETTINGS, saveSettings} from "../../../settings.js";
import {buildMainKeyboard, buildSubKeyboard, MENU_TITLE, SUB_TITLES, buildAutoTradeKeyboard, buildAutoTradeSubKeyboard, AUTO_TRADE_TITLE} from "../settingsKeyboards.js";
import {autoTrader} from "../../../handlers/utils/autoTrader.js";

const buildAutoTradeStatusText = () => {
  const enabled  = autoTrader.isEnabled();
  const stopHit  = autoTrader.isStopHit();
  const pnl      = autoTrader.getDailyPnl();
  const earned   = autoTrader.getDailyEarned();
  const lost     = autoTrader.getDailyLost();
  const { leverage, depositPercent, dailyStopLoss } = SETTINGS.autoTrade;
  const statusLine = stopHit
    ? '⛔ Остановлен (лимит убытка)'
    : enabled ? '✅ Работает' : '⏸ Остановлен';
  const pnlSign = pnl >= 0 ? '+' : '';
  return (
    `<b>🤖 Автотрейдинг</b>\n\n` +
    `Статус: ${statusLine}\n` +
    `Заработано: <code>+$${earned.toFixed(2)}</code>  Потеряно: <code>-$${lost.toFixed(2)}</code>\n` +
    `Итого: <code>${pnlSign}$${pnl.toFixed(2)}</code>\n\n` +
    `Плечо: <b>${leverage}x</b> | Позиция: <b>${depositPercent}%</b> | Стоп: <b>$${dailyStopLoss}</b>\n` +
    `SL/TP берутся из ручных настроек`
  );
};

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

  // ─── Автотрейдинг ────────────────────────────────────────────────────────

  bot.action(BOT_COMMANDS_DATA.autoTradeMenu, async (ctx) => {
    await ctx.answerCbQuery();
    const text = buildAutoTradeStatusText();
    try {
      await ctx.editMessageText(text, {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
    } catch {
      await ctx.reply(text, {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
    }
  });

  bot.action(BOT_COMMANDS_DATA.autoTradeToggle, async (ctx) => {
    if (autoTrader.isEnabled()) {
      await autoTrader.stop(ctx.telegram);
      await ctx.answerCbQuery('⏹ Автотрейдинг остановлен');
    } else {
      if (autoTrader.isStopHit()) {
        return ctx.answerCbQuery('⛔ Дневной лимит убытка исчерпан', {show_alert: true});
      }
      await autoTrader.start(ctx.telegram);
      await ctx.answerCbQuery('▶️ Автотрейдинг запущен');
    }
    await ctx.editMessageText(buildAutoTradeStatusText(), {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
  });

  bot.action(BOT_COMMANDS_DATA.autoTradeShowSub, async (ctx) => {
    const type = ctx.match[1];
    const titles = {leverage: '⚡ Плечо', deposit: '💰 Позиция (%)', stop: '🛑 Стоп дня ($)'};
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `${AUTO_TRADE_TITLE}\n\n${titles[type] ?? ''}`,
      {reply_markup: buildAutoTradeSubKeyboard(type)}
    );
  });

  bot.action(BOT_COMMANDS_DATA.autoTradeSetLeverage, async (ctx) => {
    SETTINGS.autoTrade.leverage = parseInt(ctx.match[1]);
    saveSettings(SETTINGS);
    await ctx.answerCbQuery(`✅ Плечо авто: ${ctx.match[1]}x`);
    await ctx.editMessageText(buildAutoTradeStatusText(), {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
  });

  bot.action(BOT_COMMANDS_DATA.autoTradeSetDeposit, async (ctx) => {
    SETTINGS.autoTrade.depositPercent = parseFloat(ctx.match[1]);
    saveSettings(SETTINGS);
    await ctx.answerCbQuery(`✅ Позиция авто: ${ctx.match[1]}%`);
    await ctx.editMessageText(buildAutoTradeStatusText(), {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
  });

  bot.action(BOT_COMMANDS_DATA.autoTradeSetStop, async (ctx) => {
    SETTINGS.autoTrade.dailyStopLoss = parseFloat(ctx.match[1]);
    saveSettings(SETTINGS);
    await ctx.answerCbQuery(`✅ Стоп дня: $${ctx.match[1]}`);
    await ctx.editMessageText(buildAutoTradeStatusText(), {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
  });
};

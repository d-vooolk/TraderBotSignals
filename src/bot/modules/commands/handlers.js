import {buildMainKeyboard, MENU_TITLE, buildAutoTradeKeyboard} from "../settingsKeyboards.js";
import {wsStatus} from "../websocket.js";
import {getDailyPnl, getOpenPositions} from "../../../api/binanceTradingApi.js";
import {SETTINGS} from "../../../settings.js";
import {autoTrader} from "../../../handlers/utils/autoTrader.js";

export const settingsHandler = (context) => {
    context.reply(MENU_TITLE, {reply_markup: buildMainKeyboard()});
};

const toMsk = (iso) => {
    const d = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16).replace('T', ' ') + ' MSK';
};

const fmtPositionPrice = (n) => {
    const num = parseFloat(n);
    if (isNaN(num) || num === 0) return '—';
    if (num >= 1000) return num.toFixed(2);
    if (num >= 1)    return num.toFixed(3);
    if (num >= 0.01) return num.toFixed(5);
    return num.toFixed(7);
};

export const positionsHandler = async (context) => {
    const positions = await getOpenPositions();

    if (!positions.length) {
        return context.reply('📭 Нет открытых позиций.');
    }

    const lines = positions.map(p => {
        const amt   = parseFloat(p.positionAmt);
        const side  = amt > 0 ? '🟩 LONG' : '🟥 SHORT';
        const pnl   = parseFloat(p.unrealizedProfit).toFixed(2);
        const pnlMark = parseFloat(pnl) >= 0 ? '✅' : '❌';
        return `${side} *${p.symbol}*\n` +
               `Вход: \`${fmtPositionPrice(p.entryPrice)}\` | Маркет: \`${fmtPositionPrice(p.markPrice)}\`\n` +
               `${pnlMark} PnL: *$${pnl}*`;
    });

    context.reply(
        `📊 *Позиции (${positions.length})*\n\n` + lines.join('\n\n'),
        { parse_mode: 'Markdown' }
    );
};

export const autoTradeHandler = (context) => {
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
  const text =
    `<b>🤖 Автотрейдинг</b>\n\n` +
    `Статус: ${statusLine}\n` +
    `Заработано: <code>+$${earned.toFixed(2)}</code>  Потеряно: <code>-$${lost.toFixed(2)}</code>\n` +
    `Итого: <code>${pnlSign}$${pnl.toFixed(2)}</code>\n\n` +
    `Плечо: <b>${leverage}x</b> | Позиция: <b>${depositPercent}%</b> | Стоп: <b>$${dailyStopLoss}</b>\n` +
    `SL/TP берутся из ручных настроек`;
  context.reply(text, {reply_markup: buildAutoTradeKeyboard(), parse_mode: 'HTML'});
};

export const statusHandler = async (context) => {
    const ws         = wsStatus.running ? '✅ Работает' : '❌ Остановлен';
    const lastCandle = wsStatus.lastCandleAt ? toMsk(wsStatus.lastCandleAt) : 'нет данных';

    const pnl = await getDailyPnl();
    const pnlStr = pnl
        ? `\n\n💹 *За последние 24ч:*\n✅ Заработано: *$${pnl.earned}*\n❌ Потеряно: *$${pnl.lost}*`
        : '';

    context.reply(
        `📊 *Статус бота*\n\n` +
        `WebSocket: ${ws}\n` +
        `Монет в мониторинге: *${wsStatus.symbolsCount}*\n` +
        `📡 Последний анализ: *${lastCandle}*` +
        pnlStr,
        {parse_mode: 'Markdown'}
    );
};

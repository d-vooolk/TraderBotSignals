import {buildMainKeyboard, MENU_TITLE} from "../settingsKeyboards.js";
import {wsStatus} from "../websocket.js";
import {readHistory} from "../../../handlers/utils/tradeHistory.js";
import {getDailyPnl} from "../../../api/binanceTradingApi.js";

export const settingsHandler = (context) => {
    context.reply(MENU_TITLE, {reply_markup: buildMainKeyboard()});
};

export const statusHandler = async (context) => {
    const ws      = wsStatus.running ? '✅ Работает' : '❌ Остановлен';
    const history = readHistory();
    const last    = history[history.length - 1];

    const lastCandle = wsStatus.lastCandleAt
        ? wsStatus.lastCandleAt.slice(0, 19).replace('T', ' ') + ' UTC'
        : 'нет данных';

    const lastSignal = wsStatus.lastSignalAt
        ? wsStatus.lastSignalAt.slice(0, 19).replace('T', ' ') + ' UTC'
        : 'нет сигналов';

    const lastTrade = last
        ? `\n🕐 Последняя сделка: *${last.coinSymbol}* ${last.direction === 'up' ? '📈' : '📉'} — ${last.timestamp.slice(0, 16).replace('T', ' ')}`
        : '';

    const pnl = await getDailyPnl();
    const pnlStr = pnl
        ? `\n\n💹 *За последние 24ч:*\n✅ Заработано: *$${pnl.earned}*\n❌ Потеряно: *$${pnl.lost}*`
        : '';

    context.reply(
        `📊 *Статус бота*\n\n` +
        `WebSocket: ${ws}\n` +
        `Монет в мониторинге: *${wsStatus.symbolsCount}*\n` +
        `📡 Последний анализ: *${lastCandle}*\n` +
        `🚀 Последний сигнал: *${lastSignal}*\n` +
        `Сделок в истории: *${history.length}*` +
        lastTrade +
        pnlStr,
        {parse_mode: 'Markdown'}
    );
};

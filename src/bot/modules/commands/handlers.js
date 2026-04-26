import {longPhrases, shortPhrases} from "./constants.js";
import {buildMainKeyboard, MENU_TITLE} from "../settingsKeyboards.js";
import {wsStatus} from "../websocket.js";
import {readHistory} from "../../../handlers/utils/tradeHistory.js";

export const settingsHandler = (context) => {
    context.reply(MENU_TITLE, {reply_markup: buildMainKeyboard()});
};

export const statusHandler = (context) => {
    const ws      = wsStatus.running ? '✅ Работает' : '❌ Остановлен';
    const history = readHistory();
    const last    = history[history.length - 1];
    const lastStr = last
        ? `\n🕐 Последняя сделка: *${last.coinSymbol}* ${last.direction === 'up' ? '📈' : '📉'} — ${last.timestamp.slice(0, 16).replace('T', ' ')}`
        : '';

    context.reply(
        `📊 *Статус бота*\n\n` +
        `WebSocket: ${ws}\n` +
        `Монет в мониторинге: *${wsStatus.symbolsCount}*\n` +
        `Сделок в истории: *${history.length}*` +
        lastStr,
        {parse_mode: 'Markdown'}
    );
};

export const shortHandler = (context) => {
    const i = Math.floor(Math.random() * shortPhrases.length);
    context.reply(shortPhrases[i]);
};

export const longHandler = (context) => {
    const i = Math.floor(Math.random() * longPhrases.length);
    context.reply(longPhrases[i]);
};

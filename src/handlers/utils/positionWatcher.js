import { getOpenPosition, cancelAllSymbolOrders } from '../../api/binanceTradingApi.js';
import { SETTINGS } from '../../settings.js';

const POLL_INTERVAL_MS = 15_000;
const MAX_WATCH_MS = 48 * 60 * 60 * 1000;

export const startPositionWatcher = (symbol, telegram) => {
  const chatId = SETTINGS.savedChatId;
  if (!chatId) return;

  let hasSeenPosition = false;
  const startTime = Date.now();

  const interval = setInterval(async () => {
    try {
      if (Date.now() - startTime > MAX_WATCH_MS) {
        clearInterval(interval);
        return;
      }

      const position = await getOpenPosition(symbol);

      if (position) {
        hasSeenPosition = true;
        return;
      }

      if (!hasSeenPosition) return; // Позиция ещё не зарегистрировалась на бирже

      clearInterval(interval);
      await cancelAllSymbolOrders(symbol);
      await telegram.sendMessage(
        chatId,
        `🔔 <b>Позиция ${symbol} закрыта</b> — висящие ордера отменены.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('positionWatcher error:', err?.message);
    }
  }, POLL_INTERVAL_MS);
};

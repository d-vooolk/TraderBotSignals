import { getOpenPosition, cancelAllSymbolOrders, cancelAlgoOrdersById, getSymbolCloseSummary } from '../../api/binanceTradingApi.js';
import { SETTINGS } from '../../settings.js';

const POLL_INTERVAL_MS = 15_000;
const MAX_WATCH_MS = 48 * 60 * 60 * 1000;

export const startPositionWatcher = (symbol, telegram, algoIds = []) => {
  const chatId = SETTINGS.savedChatId;
  if (!chatId) return;

  let hasSeenPosition = false;
  let openTime = null;
  const startTime = Date.now();

  const interval = setInterval(async () => {
    try {
      if (Date.now() - startTime > MAX_WATCH_MS) {
        clearInterval(interval);
        return;
      }

      const position = await getOpenPosition(symbol);

      if (position) {
        if (!hasSeenPosition) {
          hasSeenPosition = true;
          openTime = Date.now();
        }
        return;
      }

      if (!hasSeenPosition) return; // Позиция ещё не зарегистрировалась на бирже

      clearInterval(interval);
      // Отменяем по сохранённым algoId (точно) + по символу (резервно)
      await cancelAlgoOrdersById(algoIds);
      await cancelAllSymbolOrders(symbol);

      const { pnl, closeReason } = await getSymbolCloseSummary(symbol, openTime);

      const pnlStr = pnl !== null
        ? `\n💰 PnL: <code>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT</code> ${pnl >= 0 ? '✅' : '❌'}`
        : '';
      const reasonStr = closeReason
        ? `\n📋 Причина: ${closeReason}`
        : '';

      await telegram.sendMessage(
        chatId,
        `🔔 <b>Позиция ${symbol} закрыта</b>${reasonStr}${pnlStr}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('positionWatcher error:', err?.message);
    }
  }, POLL_INTERVAL_MS);
};

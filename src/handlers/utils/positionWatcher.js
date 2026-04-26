import { getOpenPosition, cancelAllSymbolOrders, cancelAlgoOrdersById, getSymbolCloseSummary, placeSLAtBreakeven } from '../../api/binanceTradingApi.js';
import { SETTINGS } from '../../settings.js';
import { markSlHit } from './slCooldown.js';

const POLL_INTERVAL_MS = 15_000;
const MAX_WATCH_MS = 48 * 60 * 60 * 1000;

export const startPositionWatcher = (symbol, telegram, algoIds = [], onClose = null, silent = false, breakEvenData = null) => {
  const chatId = SETTINGS.savedChatId;
  if (!chatId) return;

  let hasSeenPosition = false;
  let openTime        = null;
  let openQty         = 0;
  let breakEvenMoved  = false;
  const startTime     = Date.now();

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
          openQty  = Math.abs(parseFloat(position.positionAmt));
        }

        // Детектируем срабатывание TP1: объём упал примерно на 40%
        if (!breakEvenMoved && breakEvenData && openQty > 0) {
          const currentQty = Math.abs(parseFloat(position.positionAmt));
          if (currentQty > 0 && currentQty < openQty * 0.7) {
            breakEvenMoved = true;
            try {
              await placeSLAtBreakeven(
                symbol,
                breakEvenData.side,
                breakEvenData.fillPrice,
                currentQty,
                breakEvenData.slAlgoId,
              );
              telegram.sendMessage(
                chatId,
                `🔄 <b>${symbol}</b>: TP1 взят — SL перенесён в безубыток`,
                { parse_mode: 'HTML' }
              ).catch(() => {});
            } catch (err) {
              console.error('breakeven SL error:', symbol, err?.message);
            }
          }
        }

        return;
      }

      if (!hasSeenPosition) return; // Позиция ещё не зарегистрировалась на бирже

      clearInterval(interval);
      // Отменяем по сохранённым algoId (точно) + по символу (резервно)
      await cancelAlgoOrdersById(algoIds);
      await cancelAllSymbolOrders(symbol);

      const { pnl, closeReason } = await getSymbolCloseSummary(symbol, openTime);

      const hasSL = closeReason?.includes('SL');
      if (hasSL) {
        const cooldownMs = (SETTINGS.handler.slCooldownMin ?? 45) * 60_000;
        markSlHit(symbol, cooldownMs);
      }

      if (onClose) {
        await onClose(pnl, closeReason);
      }

      if (!silent) {
        const pnlStr = pnl !== null
          ? `\n💰 PnL: <code>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT</code> ${pnl >= 0 ? '✅' : '❌'}`
          : '';
        const reasonStr = closeReason ? `\n📋 Причина: ${closeReason}` : '';
        await telegram.sendMessage(
          chatId,
          `🔔 <b>Позиция ${symbol} закрыта</b>${reasonStr}${pnlStr}`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      console.error('positionWatcher error:', err?.message);
    }
  }, POLL_INTERVAL_MS);
};

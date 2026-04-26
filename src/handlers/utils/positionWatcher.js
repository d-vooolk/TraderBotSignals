import { getOpenPosition, cancelAllSymbolOrders, cancelAlgoOrdersById, getSymbolCloseSummary, placeSLAtBreakeven, closePositionMarket } from '../../api/binanceTradingApi.js';
import { SETTINGS } from '../../settings.js';
import { markSlHit } from './slCooldown.js';

const POLL_INTERVAL_MS = 15_000;
const MAX_WATCH_MS = 48 * 60 * 60 * 1000;

export const startPositionWatcher = (symbol, telegram, algoIds = [], onClose = null, silent = false, breakEvenData = null) => {
  const chatId = SETTINGS.savedChatId;
  if (!chatId) return;

  let hasSeenPosition = false;
  let openTime        = null;
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
        }

        // Переносим SL в безубыток когда цена прошла breakEvenAt% в нашу сторону
        if (!breakEvenMoved && breakEvenData && openTime) {
          const markPrice = parseFloat(position.markPrice);
          const isLong    = breakEvenData.side === 'BUY';
          const beAt      = breakEvenData.breakEvenAt ?? 0.5;
          const threshold = isLong
            ? breakEvenData.fillPrice * (1 + beAt / 100)
            : breakEvenData.fillPrice * (1 - beAt / 100);
          const reached = isLong ? markPrice >= threshold : markPrice <= threshold;

          if (reached) {
            breakEvenMoved = true;
            try {
              const currentQty = Math.abs(parseFloat(position.positionAmt));
              await placeSLAtBreakeven(
                symbol,
                breakEvenData.side,
                breakEvenData.fillPrice,
                currentQty,
                breakEvenData.slAlgoId,
              );
              telegram.sendMessage(
                chatId,
                `🔄 <b>${symbol}</b>: +${beAt}% — SL перенесён в безубыток`,
                { parse_mode: 'HTML' }
              ).catch(() => {});
            } catch (err) {
              console.error('breakeven SL error:', symbol, err?.message);
            }
          }
        }

        // Тайм-стоп: если цена не пошла в нужную сторону за N минут — закрываем
        const timeStopMs = (SETTINGS.trade?.timeStopMin ?? 45) * 60_000;
        if (!breakEvenMoved && openTime && Date.now() - openTime > timeStopMs) {
          clearInterval(interval);
          await cancelAlgoOrdersById(algoIds);
          await cancelAllSymbolOrders(symbol);
          try { await closePositionMarket(symbol); } catch {}
          await new Promise(r => setTimeout(r, 2000));
          const { pnl } = await getSymbolCloseSummary(symbol, openTime);
          if (onClose) await onClose(pnl, '⏱ Тайм-стоп');
          return;
        }

        return;
      }

      if (!hasSeenPosition) return;

      clearInterval(interval);
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

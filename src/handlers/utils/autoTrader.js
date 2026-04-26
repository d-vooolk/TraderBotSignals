import { SETTINGS } from '../../settings.js';
import { placeTradeWithSLTP, getUsdtBalance, getOpenPosition } from '../../api/binanceTradingApi.js';
import { getBinanceFuturesPrice } from '../../api/binanceApi.js';
import { logTrade } from './tradeHistory.js';
import { startPositionWatcher } from './positionWatcher.js';

let _enabled        = false;
let _dailyPnl       = 0;
let _dailyEarned    = 0;
let _dailyLost      = 0;
let _dailyDate      = '';
let _pinnedMsgId    = null;
let _telegramRef    = null;

const todayStr = () => new Date().toISOString().slice(0, 10);

const checkReset = () => {
  const today = todayStr();
  if (_dailyDate !== today) {
    _dailyDate   = today;
    _dailyPnl    = 0;
    _dailyEarned = 0;
    _dailyLost   = 0;
  }
};

const isStopHit = () => {
  const stop = SETTINGS.autoTrade?.dailyStopLoss ?? 10;
  return _dailyPnl <= -stop;
};

// ─── Закреплённое сообщение ───────────────────────────────────────────────

const buildPinnedText = (active = true) => {
  const { leverage, depositPercent, dailyStopLoss } = SETTINGS.autoTrade;
  const totalSign = _dailyPnl >= 0 ? '+' : '';
  const statusIcon = active ? '🟢 АКТИВЕН' : '🔴 ОСТАНОВЛЕН';
  return (
    `📌 <b>Автотрейдинг ${statusIcon}</b>\n` +
    `⚡ ${leverage}x  💰 ${depositPercent}%  🛑 $${dailyStopLoss}\n` +
    `✅ +$${_dailyEarned.toFixed(2)}  ❌ -$${_dailyLost.toFixed(2)}  Итого: <code>${totalSign}$${_dailyPnl.toFixed(2)}</code>`
  );
};

const pinStatusMessage = async (telegram) => {
  const chatId = SETTINGS.savedChatId;
  if (!telegram || !chatId) return;
  try {
    const msg = await telegram.sendMessage(chatId, buildPinnedText(true), { parse_mode: 'HTML' });
    _pinnedMsgId = msg.message_id;
    await telegram.pinChatMessage(chatId, _pinnedMsgId, { disable_notification: true });
  } catch (err) {
    console.error('autoTrader pin error:', err?.message);
  }
};

const unpinStatusMessage = async (telegram) => {
  const chatId = SETTINGS.savedChatId;
  const tg = telegram ?? _telegramRef;
  if (!tg || !chatId || !_pinnedMsgId) return;
  try {
    await tg.editMessageText(chatId, _pinnedMsgId, undefined, buildPinnedText(false), { parse_mode: 'HTML' });
    await tg.unpinChatMessage(chatId, _pinnedMsgId);
  } catch {}
  _pinnedMsgId = null;
};

const updatePinnedMessage = async (telegram) => {
  const chatId = SETTINGS.savedChatId;
  const tg = telegram ?? _telegramRef;
  if (!tg || !chatId || !_pinnedMsgId) return;
  try {
    await tg.editMessageText(chatId, _pinnedMsgId, undefined, buildPinnedText(true), { parse_mode: 'HTML' });
  } catch {}
};

// ─── Закрытие сделки ─────────────────────────────────────────────────────

const onTradeClosed = async (pnl, closeReason, coinSymbol, telegram) => {
  checkReset();
  if (pnl !== null) {
    _dailyPnl += pnl;
    if (pnl > 0) _dailyEarned += pnl;
    else          _dailyLost  += Math.abs(pnl);
  }

  const chatId = SETTINGS.savedChatId;
  const totalSign = _dailyPnl >= 0 ? '+' : '';

  // Уведомление о закрытии с накопленной статистикой
  if (chatId && telegram) {
    const pnlStr    = pnl !== null
      ? `\n💰 PnL: <code>${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT</code> ${pnl >= 0 ? '✅' : '❌'}`
      : '';
    const reasonStr = closeReason ? `\n📋 Причина: ${closeReason}` : '';
    await telegram.sendMessage(
      chatId,
      `🤖 <b>Авто: ${coinSymbol}USDT закрыта</b>${reasonStr}${pnlStr}\n\n` +
      `📊 <b>Авто сегодня:</b>  ✅ +$${_dailyEarned.toFixed(2)}  ❌ -$${_dailyLost.toFixed(2)}  Итого: <code>${totalSign}$${_dailyPnl.toFixed(2)}</code>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }

  // Обновляем закреплённое сообщение
  await updatePinnedMessage(telegram);

  // Проверяем лимит убытка
  if (_enabled && isStopHit()) {
    _enabled = false;
    await unpinStatusMessage(telegram);
    if (chatId && telegram) {
      await telegram.sendMessage(
        chatId,
        `🛑 <b>Автотрейдинг остановлен</b>\n` +
        `Дневной лимит убытка достигнут: <code>-$${_dailyLost.toFixed(2)}</code>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  }
};

// ─── Публичный объект ─────────────────────────────────────────────────────

export const autoTrader = {
  isEnabled() {
    checkReset();
    return _enabled;
  },

  async start(telegram) {
    checkReset();
    _enabled     = true;
    _telegramRef = telegram;
    await pinStatusMessage(telegram);
  },

  async stop(telegram) {
    _enabled = false;
    await unpinStatusMessage(telegram ?? _telegramRef);
  },

  getDailyPnl()    { checkReset(); return _dailyPnl; },
  getDailyEarned() { checkReset(); return _dailyEarned; },
  getDailyLost()   { checkReset(); return _dailyLost; },

  isStopHit() {
    checkReset();
    return isStopHit();
  },

  async execute(coinSymbol, direction, telegram) {
    checkReset();
    if (!_enabled) return;
    if (isStopHit()) {
      _enabled = false;
      return;
    }

    const chatId = SETTINGS.savedChatId;

    try {
      const balance = await getUsdtBalance();
      if (balance < 5) return;

      const existing = await getOpenPosition(`${coinSymbol}USDT`);
      if (existing) return;

      const freshData = await getBinanceFuturesPrice(coinSymbol);
      if (!freshData?.price) return;

      const entryPrice             = parseFloat(freshData.price);
      const { leverage, depositPercent } = SETTINGS.autoTrade;
      const usdtMargin             = balance * (depositPercent / 100);
      const side                   = direction === 'up' ? 'BUY' : 'SELL';

      const result = await placeTradeWithSLTP({
        symbol:       `${coinSymbol}USDT`,
        side,
        entryPrice,
        usdtMargin,
        leverage,
        slPercent:    SETTINGS.trade.slPercent,
        tpPercent:    SETTINGS.trade.tpPercent,
        trailingStop: SETTINGS.trade.trailingStop,
        limitEntry:   SETTINGS.trade.limitEntry,
      });

      logTrade({
        coinSymbol, direction, side,
        fillPrice:  result.fillPrice,
        slPrice:    result.slPrice,
        tp1Price:   result.tp1Price,
        tpPrice:    result.tpPrice,
        quantity:   result.quantity,
        margin:     usdtMargin,
        leverage,
        auto:       true,
      });

      const emoji   = side === 'BUY' ? '🟩 LONG' : '🟥 SHORT';
      const slLabel = SETTINGS.trade.trailingStop
        ? `🔄 Трейлинг ${SETTINGS.trade.slPercent}%`
        : `🛑 SL: <code>$${result.slPrice}</code>  (-${SETTINGS.trade.slPercent}%)`;

      if (chatId && telegram) {
        await telegram.sendMessage(
          chatId,
          `🤖 <b>Авто-сделка открыта</b>\n\n` +
          `${emoji} <b>${coinSymbol}</b>\n` +
          `📊 Кол-во: <code>${result.quantity}</code>\n` +
          `💰 Маржа: <code>$${usdtMargin.toFixed(2)}</code> (${leverage}x)\n` +
          `🎯 Вход: <code>$${result.fillPrice}</code>\n` +
          `${slLabel}\n` +
          `🎯 TP1: <code>$${result.tp1Price}</code>  (+${SETTINGS.trade.slPercent}%) — 50%\n` +
          `🎯 TP2: <code>$${result.tpPrice}</code>  (+${SETTINGS.trade.tpPercent}%) — 50%`,
          { parse_mode: 'HTML' }
        );
        if (result.slTpError) {
          await telegram.sendMessage(
            chatId,
            `⚠️ Авто-сделка: SL/TP не выставились:\n<code>${result.slTpError}</code>`,
            { parse_mode: 'HTML' }
          );
        }
      }

      startPositionWatcher(
        `${coinSymbol}USDT`,
        telegram,
        result.algoIds ?? [],
        (pnl, closeReason) => onTradeClosed(pnl, closeReason, coinSymbol, telegram),
        true,
        { side, fillPrice: result.fillPrice, slAlgoId: result.namedAlgoIds?.sl },
      );

    } catch (err) {
      console.error('autoTrader.execute error:', err?.response?.data || err.message);
      if (chatId && telegram) {
        telegram.sendMessage(
          chatId,
          `❌ Авто-сделка <b>${coinSymbol}</b>: ${err?.response?.data?.msg || err.message}`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    }
  },
};

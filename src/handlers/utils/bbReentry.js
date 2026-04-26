const watching = {}; // symbol -> { direction, since }
const MAX_WATCH_MS = 2 * 60 * 60 * 1000; // 2 часа

const calcBB = (closes, period = 20, mult = 2) => {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, p) => s + (p - sma) ** 2, 0) / period);
  return { upper: sma + mult * std, lower: sma - mult * std };
};

export const watchForBBReentry = (symbol, direction) => {
  watching[symbol.toUpperCase()] = { direction, since: Date.now() };
};

// Вызывать только на закрытых свечах после того как closes[] обновлён
// Возвращает направление ('up'/'down') если сработало, иначе null
export const checkBBReentry = (symbol, closes) => {
  const key = symbol.toUpperCase();
  const entry = watching[key];
  if (!entry) return null;

  if (Date.now() - entry.since > MAX_WATCH_MS) {
    delete watching[key];
    return null;
  }

  if (closes.length < 22) return null; // нужно 20 для BB + 2 свечи для сравнения

  // BB считаем по всем свечам кроме последней (чтобы не смотреть в будущее)
  const bb = calcBB(closes.slice(0, -1));
  if (!bb) return null;

  const prev = closes[closes.length - 2];
  const curr = closes[closes.length - 1];

  // UP: цена была ниже верхней полосы → пересекла вверх → возобновляет пробой
  if (entry.direction === 'up' && prev < bb.upper && curr >= bb.upper) {
    delete watching[key];
    return 'up';
  }
  // DOWN: цена была выше нижней полосы → пересекла вниз → возобновляет пробой
  if (entry.direction === 'down' && prev > bb.lower && curr <= bb.lower) {
    delete watching[key];
    return 'down';
  }

  return null;
};

const slCooldownMap = {};

export const markSlHit = (symbol, cooldownMs) => {
  slCooldownMap[symbol] = { ts: Date.now(), cooldownMs };
};

export const isSlCoolingDown = (symbol) => {
  const entry = slCooldownMap[symbol];
  if (!entry) return false;
  return Date.now() - entry.ts < entry.cooldownMs;
};

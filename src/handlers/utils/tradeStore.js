const TTL_MS = 10 * 60 * 1000; // сигнал живёт 10 минут

class TradeStore {
  #map = new Map();

  set(id, data) {
    this.#map.set(id, {...data, expiresAt: Date.now() + TTL_MS});
    this.#cleanup();
  }

  get(id) {
    const entry = this.#map.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.#map.delete(id);
      return null;
    }
    return entry;
  }

  delete(id) {
    this.#map.delete(id);
  }

  #cleanup() {
    const now = Date.now();
    for (const [k, v] of this.#map) {
      if (now > v.expiresAt) this.#map.delete(k);
    }
  }
}

export const tradeStore = new TradeStore();

import axios from 'axios';

const api = axios.create({timeout: 5000});
const apiLong = axios.create({timeout: 20000});

export async function getBinanceFuturesPrice(symbol) {
  try {
    const response = await api.get(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}USDT`);

    const data = response?.data;
    if (data) {
      return {
        price: data?.['lastPrice'],
        volume: data?.['quoteVolume'],
        high: data?.['highPrice'],
        low: data?.['lowPrice'],
        change: data?.['priceChangePercent']
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Binance FUTURES не поддерживает ${symbol}`);
    return null;
  }
}

export async function getFuturesCandlestickData(params) {
  try {
    const response = await api.get('https://fapi.binance.com/fapi/v1/klines', {params});
    return response?.data;
  } catch (error) {
    return null;
  }
}

export const fetchFuturesSymbols = async (retries = 4) => {
  console.info("📡 Запрос списка фьючерсных монет...");
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await apiLong.get("https://fapi.binance.com/fapi/v1/exchangeInfo");
      const symbols = response?.data?.symbols?.map(s => s?.symbol?.toLowerCase());
      console.info(`✅ Найдено ${symbols.length} монет.`);
      return symbols;
    } catch (error) {
      console.error(`❌ Ошибка при получении списка монет (попытка ${attempt}/${retries}): ${error.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
  return [];
};
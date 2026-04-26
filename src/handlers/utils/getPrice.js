import {getBinanceFuturesPrice} from "../../api/binanceApi.js";

export const getPrice = (coinSymbol) => getBinanceFuturesPrice(coinSymbol);

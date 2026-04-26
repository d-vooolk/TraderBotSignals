import {COMMANDS} from "../../constants.js";
import {handleCoinPriceRequest} from "../../handlers/handleCoinPriceRequest/handleCoinPriceRequest.js";

const map = {
  [COMMANDS.COIN_PRICE]: handleCoinPriceRequest,
};

export const handleMessage = async (context) => {
  const text = context?.message?.text;
  if (!text) return;

  const message = text.trim();
  const handler = map[message.charAt(0)];
  if (!handler) return;

  return await handler(context, context?.chat?.id, message.slice(1).trim());
};

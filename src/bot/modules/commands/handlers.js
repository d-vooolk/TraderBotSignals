import {longPhrases, shortPhrases} from "./constants.js";
import {buildMainKeyboard, MENU_TITLE} from "../settingsKeyboards.js";

export const settingsHandler = (context) => {
    context.reply(MENU_TITLE, {reply_markup: buildMainKeyboard()});
};

export const shortHandler = (context) => {
    const i = Math.floor(Math.random() * shortPhrases.length);
    context.reply(shortPhrases[i]);
};

export const longHandler = (context) => {
    const i = Math.floor(Math.random() * longPhrases.length);
    context.reply(longPhrases[i]);
};

import fs from "fs";
import {DEFAULT_SETTINGS, SETTINGS_FILE, SETTINGS_TEXT} from "./constants.js";

const deepMerge = (defaults, saved) => {
  const result = { ...defaults };
  for (const key of Object.keys(saved)) {
    if (
      typeof saved[key] === 'object' && saved[key] !== null &&
      !Array.isArray(saved[key]) && typeof defaults[key] === 'object'
    ) {
      result[key] = deepMerge(defaults[key], saved[key]);
    } else {
      result[key] = saved[key];
    }
  }
  return result;
};

const applyEnvChatId = (settings) => {
  const raw = process.env.CHAT_ID?.trim();
  if (!raw) return settings;
  const id = Number(raw);
  if (!Number.isNaN(id)) settings.savedChatId = id;
  return settings;
};

const loadSettings = () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf8");
      return applyEnvChatId(deepMerge(DEFAULT_SETTINGS, JSON.parse(data)));
    }
  } catch (error) {
    console.error(SETTINGS_TEXT.settingsError, error);
  }
  return applyEnvChatId({ ...DEFAULT_SETTINGS });
};

const saveSettings = (settings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error(SETTINGS_TEXT.saveError, error);
  }
};

const setChatId = (chatId) => {
  const settings = loadSettings();
  settings.savedChatId = chatId;
  saveSettings(settings);
  SETTINGS.savedChatId = chatId;
};

const SETTINGS = loadSettings();

export { SETTINGS, saveSettings, setChatId };
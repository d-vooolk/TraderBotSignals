import fs from 'fs';
import path from 'path';

const HISTORY_FILE = path.resolve('trades.json');
const MAX_ENTRIES  = 200;

export const logTrade = (entry) => {
  let history = readHistory();
  history.push({...entry, timestamp: new Date().toISOString()});
  if (history.length > MAX_ENTRIES) history = history.slice(-MAX_ENTRIES);
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2)); } catch {}
};

export const readHistory = () => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch { return []; }
};

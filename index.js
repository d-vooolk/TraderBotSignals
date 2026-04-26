import "dotenv/config";
import bot from "./src/bot/index.js";

let pollingActive = true;

const startPolling = async () => {
  let offset = 0;
  try {
    bot.botInfo = await bot.telegram.getMe();
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    console.info("🤖 Бот запущен!");
  } catch (err) {
    console.error("Ошибка запуска:", err);
    setTimeout(startPolling, 5000);
    return;
  }

  const poll = async () => {
    if (!pollingActive) return;
    try {
      const updates = await bot.telegram.callApi('getUpdates', {
        timeout: 10,
        limit: 100,
        offset,
        allowed_updates: [],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        bot.handleUpdate(update).catch(err => console.error("Ошибка обработки обновления:", err));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (pollingActive) setTimeout(poll, 50);
  };

  poll();
};

startPolling();

process.once("SIGINT",  () => { pollingActive = false; bot.stop(); });
process.once("SIGTERM", () => { pollingActive = false; bot.stop(); });

import "dotenv/config";
import bot from "./src/bot/index.js";

bot.launch()
  .then(() => console.info("🤖 Бот запущен!"))
  .catch(err => console.error("Ошибка запуска:", err));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
export const getError = async (context, chat_id, coinSymbol, error) => {
  if (!chat_id) {
    console.error("Ошибка: chat_id не определён", { chat_id, coinSymbol });
    return;
  }
  console.error(`❌ Ошибка при получении данных для ${coinSymbol}: ${error}`);
  try {
    await context.telegram.sendMessage(
      chat_id,
      `❌ Ошибка при получении данных для *${coinSymbol}*`,
      {parse_mode: 'Markdown'}
    );
  } catch {}
};

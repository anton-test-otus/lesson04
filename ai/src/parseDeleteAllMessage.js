/**
 * «Удали все задачи» и похожие команды → delete_many без отбора.
 * @param {string} message
 */
export function isDeleteAllCommand(message) {
  const text = String(message).trim();
  if (!text) {
    return false;
  }

  return (
    /^(?:удали|удалить|убери)(?:\s+все|\s+всех)?\s+задач[а-яё]*[.!?…]*$/i.test(text) ||
    /^(?:удали|удалить)\s+всё[.!?…]*$/i.test(text) ||
    /^очисти(?:ть)?\s+(?:весь\s+)?(?:список\s+)?задач[а-яё]*[.!?…]*$/i.test(text)
  );
}

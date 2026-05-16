const LIST_HEADER_RE =
  /^(?:добавь|добавить|создай|создать)(?:\s+ещё|\s+еще)?\s+(?:несколько\s+)?задач[а-яё]*\s*:?\s*$/i;

const LIST_HEADER_WITH_INLINE_RE =
  /^(?:добавь|добавить|создай|создать)(?:\s+ещё|\s+еще)?\s+(?:несколько\s+)?задач[а-яё]*\s*:\s*(.+)$/i;

/**
 * @param {string} line
 */
function stripListMarker(line) {
  return line
    .replace(/^[\s]*(?:[-–—*•·]|\d+[.)])\s+/, '')
    .trim();
}

/**
 * @param {string} chunk
 * @returns {string[]}
 */
function splitInlineTitles(chunk) {
  return chunk
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * «Добавить задачи:» + пункты с новой строки (с «-» или без).
 * @param {string} message
 * @returns {string[] | null}
 */
export function parseTaskListFromMessage(message) {
  const text = String(message).trim().replace(/\r\n/g, '\n');
  if (!text) {
    return null;
  }

  const lines = text.split('\n');
  const firstLine = lines[0].trim();

  const inlineOnHeader = firstLine.match(LIST_HEADER_WITH_INLINE_RE);
  if (inlineOnHeader?.[1]) {
    const titles = splitInlineTitles(inlineOnHeader[1]);
    return titles.length > 0 ? titles : null;
  }

  if (!LIST_HEADER_RE.test(firstLine)) {
    return null;
  }

  const titles = lines
    .slice(1)
    .map(stripListMarker)
    .filter((t) => t.length > 0);

  return titles.length > 0 ? titles : null;
}

const JSON_ERROR_RE = /json|unexpected token|unterminated|position/i;

export function isJsonParseError(message) {
  return JSON_ERROR_RE.test(message);
}

/**
 * @returns {{ data: unknown, error: Error | null }}
 */
export async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return { data: null, error: null };
  }

  try {
    return { data: JSON.parse(text), error: null };
  } catch (cause) {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 80);
    const hint = snippet ? `: «${snippet}…»` : '';

    return {
      data: null,
      error: new Error(
        response.ok
          ? `Сервер вернул некорректный JSON${hint}`
          : `Ответ сервера не JSON (HTTP ${response.status})${hint}`,
        { cause },
      ),
    };
  }
}

export function extractApiError(data, fallback) {
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return String(data.error);
  }
  return fallback;
}

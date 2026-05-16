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

function looksLikeJson(text) {
  const t = String(text).trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

export function extractApiError(data, fallback) {
  if (!data || typeof data !== 'object') {
    return fallback;
  }
  if (data.status === 'error' && data.errors) {
    if (Array.isArray(data.errors)) {
      return data.errors.filter(Boolean).join('; ') || fallback;
    }
    if (typeof data.errors === 'string') {
      return data.errors;
    }
  }
  if (typeof data.error === 'string' && !looksLikeJson(data.error)) {
    return data.error;
  }
  if (typeof data.message === 'string' && !looksLikeJson(data.message)) {
    return data.message;
  }
  if (typeof data.error === 'string' && looksLikeJson(data.error)) {
    return fallback;
  }
  return fallback;
}

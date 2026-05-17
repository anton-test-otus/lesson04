import { extractApiError, isJsonParseError, readJsonResponse } from './http.js';

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function request(path, options = {}, service = 'API') {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch (cause) {
    throw new Error(`${service}: нет соединения с сервером`, { cause });
  }

  if (response.status === 204) {
    return null;
  }

  const { data, error: parseError } = await readJsonResponse(response);

  if (parseError) {
    throw new Error(`${service}: ${parseError.message}`);
  }

  if (!response.ok) {
    throw new Error(extractApiError(data, `${service}: ошибка запроса (HTTP ${response.status})`));
  }

  return data;
}

function emitStreamReject(body, onStreamEvent) {
  if (body?.status !== 'error' || !onStreamEvent) {
    return;
  }
  const reason = Array.isArray(body.errors) ? body.errors.join('; ') : body.errors;
  onStreamEvent({
    type: 'reject',
    reason: reason || 'Не удалось выполнить команду',
    errors: body.errors,
    source: 'done',
  });
}

function wrapAi(promise) {
  return promise.catch((error) => {
    const raw = error?.message || '';
    if (isJsonParseError(raw)) {
      throw new Error('AI: не удалось обработать ответ сервера. Попробуйте ещё раз.');
    }
    if (/^\s*[\[{]/.test(raw)) {
      throw new Error('AI: не удалось обработать запрос. Переформулируйте команду.');
    }
    throw error;
  });
}

export const api = {
  health: () => request('/api/health', {}, 'API'),
  getTasks: () => request('/api/tasks', {}, 'API'),
  filterTasks: ({ q, priorities, burningOnly }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    priorities?.forEach((p) => params.append('priority', String(p)));
    if (burningOnly) params.set('burning_only', '1');
    const query = params.toString();
    return request(`/api/tasks/filter${query ? `?${query}` : ''}`, {}, 'API');
  },
  createTask: (title) =>
    request(
      '/api/tasks',
      { method: 'POST', body: JSON.stringify({ title }) },
      'API'
    ),
  createTasksBatch: (titles) =>
    request(
      '/api/tasks/batch',
      { method: 'POST', body: JSON.stringify({ titles }) },
      'API'
    ),
  updateTask: (id, data) =>
    request(
      `/api/tasks/${id}/update`,
      { method: 'POST', body: JSON.stringify(data) },
      'API'
    ),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }, 'API'),

  aiHealth: () => wrapAi(request('/ai/health', {}, 'AI')),
  aiProviders: () => wrapAi(request('/ai/providers', {}, 'AI')),
  aiChat: ({ message, provider, system }) =>
    wrapAi(
      request(
        '/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({ message, provider, system }),
        },
        'AI'
      )
    ),
  aiTasks: async ({ message, provider, onGraphStep, onStreamEvent }) => {
    let response;
    try {
      response = await fetch(`${API_URL}/ai/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, provider, stream: true }),
      });
    } catch (cause) {
      throw new Error('AI: нет соединения с сервером', { cause });
    }

    if (!response.ok && !response.body) {
      const { data, error: parseError } = await readJsonResponse(response);
      if (parseError) {
        throw new Error(`AI: ${parseError.message}`);
      }
      throw new Error(extractApiError(data, `AI: ошибка запроса (HTTP ${response.status})`));
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('AI: потоковый ответ недоступен');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          throw new Error('AI: не удалось обработать ответ сервера');
        }
        if (event.type === 'done') {
          const { type: _t, ...body } = event;
          result = body;
          emitStreamReject(body, onStreamEvent);
        } else {
          onStreamEvent?.(event);
          if (event.type === 'step' && event.graph && event.node) {
            onGraphStep?.({ graph: event.graph, node: event.node });
          }
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.type === 'done') {
        const { type: _t, ...body } = event;
        result = body;
        emitStreamReject(body, onStreamEvent);
      } else {
        onStreamEvent?.(event);
        if (event.type === 'step' && event.graph && event.node) {
          onGraphStep?.({ graph: event.graph, node: event.node });
        }
      }
    }

    if (!result) {
      throw new Error('AI: пустой ответ сервера');
    }

    if (!response.ok) {
      if (result.status === 'error') {
        emitStreamReject(result, onStreamEvent);
        return wrapAi(Promise.resolve(result));
      }
      throw new Error(
        extractApiError(result, `AI: ошибка запроса (HTTP ${response.status})`)
      );
    }

    return wrapAi(Promise.resolve(result));
  },
};

const BASE = (process.env.TASKS_API_BASE_URL || 'http://api').replace(/\/$/, '');

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`API: некорректный JSON (${response.status})`);
    }
  }

  if (!response.ok) {
    let message = `Ошибка API задач (HTTP ${response.status})`;
    if (typeof data?.error === 'string') {
      message = data.error;
    } else if (typeof data?.error === 'object' && data.error !== null) {
      message = 'Ошибка API задач';
    }
    throw new Error(message);
  }

  return data;
}

export function listTasks() {
  return request('/api/tasks');
}

export function filterTasks({ q, priorities, burningOnly }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  priorities?.forEach((p) => params.append('priority', String(p)));
  if (burningOnly) params.set('burning_only', '1');
  const query = params.toString();
  return request(`/api/tasks/filter${query ? `?${query}` : ''}`);
}

export function createTask({ title, priority = 2, is_burning = false }) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, priority, is_burning }),
  });
}

export function createTasksBatch(titles) {
  const payload =
    typeof titles === 'string' ? titles : titles.join(', ');
  return request('/api/tasks/batch', {
    method: 'POST',
    body: JSON.stringify({ titles: payload }),
  });
}

export function updateTask(id, { title, priority, is_burning }) {
  return request(`/api/tasks/${id}/update`, {
    method: 'POST',
    body: JSON.stringify({ title, priority, is_burning }),
  });
}

export function deleteTask(id) {
  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

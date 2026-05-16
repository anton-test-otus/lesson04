const API_URL = import.meta.env.VITE_API_URL ?? '';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  health: () => request('/api/health'),
  getTasks: () => request('/api/tasks'),
  filterTasks: ({ q, priorities, burningOnly }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    priorities?.forEach((p) => params.append('priority', String(p)));
    if (burningOnly) params.set('burning_only', '1');
    const query = params.toString();
    return request(`/api/tasks/filter${query ? `?${query}` : ''}`);
  },
  createTask: (title) =>
    request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  createTasksBatch: (titles) =>
    request('/api/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({ titles }),
    }),
  updateTask: (id, data) =>
    request(`/api/tasks/${id}/update`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteTask: (id) =>
    request(`/api/tasks/${id}`, { method: 'DELETE' }),
};

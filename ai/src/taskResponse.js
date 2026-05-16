/**
 * @param {string | string[]} errors
 * @param {{ action?: string | null, data?: unknown }} [partial]
 */
export function aiError(errors, partial = {}) {
  const list = Array.isArray(errors) ? errors : [String(errors)];

  return {
    status: 'error',
    action: partial.action ?? null,
    data: partial.data ?? null,
    errors: list,
  };
}

/**
 * @param {string | null} action
 * @param {unknown} [data]
 */
export function aiSuccess(action, data = null) {
  return {
    status: 'success',
    action: action ?? null,
    data: data ?? null,
    errors: null,
  };
}

/**
 * @param {unknown} data
 * @param {unknown[] | null} [tasksAfter]
 */
export function withTasks(data, tasksAfter) {
  if (!tasksAfter) {
    return data;
  }
  if (data && typeof data === 'object') {
    return { ...data, tasks: tasksAfter };
  }
  return { tasks: tasksAfter };
}

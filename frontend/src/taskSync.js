/**
 * @param {{ value: Array<{ id: number }> }} tasksRef
 * @param {{ id: number }} task
 */
function upsertTask(tasksRef, task) {
  const list = tasksRef.value;
  const index = list.findIndex((t) => t.id === task.id);
  if (index >= 0) {
    list[index] = task;
  } else {
    tasksRef.value = [...list, task];
  }
}

/**
 * Apply AI response data to the in-memory task list.
 * @returns {'display' | 'patch' | 'reload' | 'none'}
 */
export function applyAiDataToTasks(tasksRef, data) {
  if (!data || typeof data !== 'object') {
    return 'none';
  }

  switch (data.kind) {
    case 'tasks':
      tasksRef.value = Array.isArray(data.tasks) ? data.tasks : [];
      return 'display';
    case 'task':
      if (data.task) {
        upsertTask(tasksRef, data.task);
      }
      return 'patch';
    case 'batch':
      for (const task of data.created ?? []) {
        upsertTask(tasksRef, task);
      }
      return 'patch';
    case 'update_many':
      for (const task of data.updated ?? []) {
        upsertTask(tasksRef, task);
      }
      return 'patch';
    case 'deleted':
      if (data.id != null) {
        tasksRef.value = tasksRef.value.filter((t) => t.id !== data.id);
      }
      return 'patch';
    case 'delete_many': {
      const idSet = new Set(data.ids ?? []);
      if (idSet.size > 0) {
        tasksRef.value = tasksRef.value.filter((t) => !idSet.has(t.id));
      }
      return 'patch';
    }
    case 'agent':
      return 'reload';
    default:
      return 'none';
  }
}

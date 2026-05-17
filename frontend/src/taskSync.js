/**
 * @param {{ value: Array<{ id: number }> }} tasksRef
 * @param {{ id: number }} task
 */
function upsertTask(tasksRef, task) {
  const list = [...tasksRef.value];
  const index = list.findIndex((t) => t.id === task.id);
  if (index >= 0) {
    list[index] = { ...task };
  } else {
    list.push(task);
  }
  tasksRef.value = list;
}

/**
 * @param {object} result
 */
function collectFromSequenceStep(result, buckets) {
  if (!result) {
    return;
  }

  switch (result.kind) {
    case 'tasks':
      buckets.displayTasks = result.tasks;
      break;
    case 'task':
      if (result.task) {
        buckets.updated.push(result.task);
      }
      break;
    case 'update_many':
      buckets.updated.push(...(result.updated ?? []));
      break;
    case 'batch':
      buckets.created.push(...(result.created ?? []));
      break;
    case 'deleted':
      if (result.id != null) {
        buckets.deletedIds.push(result.id);
      }
      break;
    case 'delete_many':
      buckets.deletedIds.push(...(result.ids ?? []));
      break;
    default:
      break;
  }
}

/**
 * @param {{ value: Array<{ id: number }> }} tasksRef
 * @param {object} data
 */
function applySequenceResults(tasksRef, data) {
  const buckets = {
    updated: [],
    created: [],
    deletedIds: [],
    displayTasks: null,
  };

  for (const step of data.results ?? []) {
    collectFromSequenceStep(step?.result, buckets);
  }

  let patched = false;

  for (const task of buckets.updated) {
    upsertTask(tasksRef, task);
    patched = true;
  }
  for (const task of buckets.created) {
    upsertTask(tasksRef, task);
    patched = true;
  }

  const idSet = new Set(buckets.deletedIds);
  if (idSet.size > 0) {
    tasksRef.value = tasksRef.value.filter((t) => !idSet.has(t.id));
    patched = true;
  }

  if (patched) {
    return 'patch';
  }

  if (Array.isArray(buckets.displayTasks)) {
    tasksRef.value = buckets.displayTasks;
    return 'display';
  }

  return 'none';
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
      tasksRef.value = Array.isArray(data.tasks) ? [...data.tasks] : [];
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
      return (data.updated?.length ?? 0) > 0 ? 'patch' : 'none';
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
    case 'sequence':
      return applySequenceResults(tasksRef, data);
    case 'agent':
      return 'reload';
    default:
      return 'none';
  }
}

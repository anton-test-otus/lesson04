import * as tasksApi from './tasksApi.js';

async function selectTasks(intent) {
  if (intent.ids?.length) {
    const all = await tasksApi.listTasks();
    const idSet = new Set(intent.ids);
    return all.filter((t) => idSet.has(t.id));
  }

  const hasFilter =
    (intent.q && intent.q.trim()) ||
    intent.priorities?.length ||
    intent.burning_only === true;

  if (hasFilter) {
    return tasksApi.filterTasks({
      q: intent.q?.trim() || undefined,
      priorities: intent.priorities?.length ? intent.priorities : undefined,
      burningOnly: intent.burning_only,
    });
  }

  return tasksApi.listTasks();
}

export async function executeTaskIntent(intent) {
  switch (intent.action) {
    case 'list': {
      const tasks = await tasksApi.listTasks();
      return { kind: 'tasks', tasks };
    }
    case 'filter': {
      const tasks = await tasksApi.filterTasks({
        q: intent.q || undefined,
        priorities: intent.priorities?.length ? intent.priorities : undefined,
        burningOnly: intent.burning_only,
      });
      return { kind: 'tasks', tasks, filter: intent };
    }
    case 'create': {
      const task = await tasksApi.createTask({
        title: intent.title.trim(),
        priority: intent.priority ?? 2,
        is_burning: intent.is_burning ?? false,
      });
      return { kind: 'task', task };
    }
    case 'create_batch': {
      const result = await tasksApi.createTasksBatch(intent.titles);
      return { kind: 'batch', ...result };
    }
    case 'update': {
      const task = await tasksApi.updateTask(intent.id, {
        title: intent.title.trim(),
        priority: intent.priority,
        is_burning: intent.is_burning,
      });
      return { kind: 'task', task };
    }
    case 'update_many': {
      if (intent.set_priority === undefined && intent.set_is_burning === undefined) {
        throw new Error('Укажите set_priority и/или set_is_burning');
      }

      const targets = await selectTasks(intent);

      if (targets.length === 0) {
        return { kind: 'update_many', updated: [], count: 0 };
      }

      const updated = [];

      for (const current of targets) {
        const task = await tasksApi.updateTask(current.id, {
          title: current.title,
          priority: intent.set_priority ?? current.priority,
          is_burning: intent.set_is_burning ?? current.is_burning,
        });
        updated.push(task);
      }

      return { kind: 'update_many', updated, count: updated.length };
    }
    case 'delete': {
      await tasksApi.deleteTask(intent.id);
      return { kind: 'deleted', id: intent.id };
    }
    default:
      throw new Error(`Неизвестное действие: ${intent.action}`);
  }
}

export function buildReply(intent, result) {
  switch (intent.action) {
    case 'list':
      return formatTasksList(result.tasks, 'Все задачи');
    case 'filter':
      return formatTasksList(result.tasks, 'Найденные задачи');
    case 'create':
      return `Создана задача #${result.task.id}: «${result.task.title}» (приоритет ${result.task.priority}${result.task.is_burning ? ', горящая' : ''}).`;
    case 'create_batch':
      return `Создано задач: ${result.count}.`;
    case 'update':
      return `Обновлена задача #${result.task.id}: «${result.task.title}».`;
    case 'update_many': {
      if (result.count === 0) {
        return 'Подходящих задач не найдено — ничего не обновлено.';
      }
      const parts = [];
      if (intent.set_priority !== undefined) {
        parts.push(`приоритет → ${intent.set_priority}`);
      }
      if (intent.set_is_burning !== undefined) {
        parts.push(intent.set_is_burning ? 'горящие' : 'не горящие');
      }
      const lines = result.updated.map(
        (t) => `• #${t.id} «${t.title}» — п.${t.priority}${t.is_burning ? ', 🔥' : ''}`
      );
      return `Обновлено задач: ${result.count} (${parts.join(', ')}):\n${lines.join('\n')}`;
    }
    case 'delete':
      return `Задача #${result.id} удалена.`;
    default:
      return 'Готово.';
  }
}

function formatTasksList(tasks, heading) {
  if (!tasks?.length) {
    return `${heading}: ничего не найдено.`;
  }
  const lines = tasks.map(
    (t) =>
      `• #${t.id} «${t.title}» — приоритет ${t.priority}${t.is_burning ? ', 🔥' : ''}`
  );
  return `${heading} (${tasks.length}):\n${lines.join('\n')}`;
}

export function shouldReturnTasks(intent) {
  return ['list', 'filter', 'create', 'create_batch', 'update', 'update_many'].includes(
    intent.action
  );
}

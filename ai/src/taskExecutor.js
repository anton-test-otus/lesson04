import {
  bumpPriorityDown,
  bumpPriorityUp,
  validateBumpForTargets,
} from './priorityLadder.js';
import * as tasksApi from './tasksApi.js';

function resolvePriority(current, intent) {
  if (intent.bump_priority === 'up') {
    return bumpPriorityUp(current.priority);
  }
  if (intent.bump_priority === 'down') {
    return bumpPriorityDown(current.priority);
  }
  if (intent.set_priority !== undefined) {
    return intent.set_priority;
  }
  return current.priority ?? null;
}

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
        priority: intent.priority ?? null,
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
      if (
        intent.set_priority === undefined &&
        intent.set_is_burning === undefined &&
        !intent.bump_priority
      ) {
        throw new Error('Укажите set_priority, bump_priority и/или set_is_burning');
      }
      if (intent.set_priority !== undefined && intent.bump_priority) {
        throw new Error('Нельзя указывать set_priority и bump_priority одновременно');
      }

      const targets = await selectTasks(intent);

      if (targets.length === 0) {
        return { kind: 'update_many', updated: [], count: 0 };
      }

      if (intent.bump_priority) {
        const rejectReason = validateBumpForTargets(targets, intent.bump_priority);
        if (rejectReason) {
          return { kind: 'reject', reason: rejectReason };
        }
      }

      const updated = [];

      for (const current of targets) {
        const task = await tasksApi.updateTask(current.id, {
          title: current.title,
          priority: resolvePriority(current, intent),
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
    case 'delete_many': {
      const targets = await selectTasks(intent);

      if (targets.length === 0) {
        return { kind: 'delete_many', ids: [], count: 0 };
      }

      const ids = [];

      for (const current of targets) {
        await tasksApi.deleteTask(current.id);
        ids.push(current.id);
      }

      return { kind: 'delete_many', ids, count: ids.length };
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
      return `Создана задача #${result.task.id}: «${result.task.title}» (приоритет ${result.task.priority ?? 'пустой'}${result.task.is_burning ? ', горящая' : ''}).`;
    case 'create_batch':
      return `Создано задач: ${result.count}.`;
    case 'update':
      return `Обновлена задача #${result.task.id}: «${result.task.title}» (приоритет ${result.task.priority ?? 'пустой'}).`;
    case 'update_many': {
      if (result.count === 0) {
        return 'Подходящих задач не найдено — ничего не обновлено.';
      }
      const parts = [];
      if (intent.bump_priority === 'up') {
        parts.push('приоритет ↑');
      } else if (intent.bump_priority === 'down') {
        parts.push('приоритет ↓');
      } else       if (intent.set_priority !== undefined) {
        parts.push(
          intent.set_priority === null
            ? 'статус приоритета снят'
            : `приоритет → ${intent.set_priority}`
        );
      }
      if (intent.set_is_burning !== undefined) {
        parts.push(intent.set_is_burning ? 'зажгли 🔥' : 'потушили');
      }
      const lines = result.updated.map(
        (t) => `• #${t.id} «${t.title}» — п.${t.priority}${t.is_burning ? ', 🔥' : ''}`
      );
      return `Обновлено задач: ${result.count} (${parts.join(', ')}):\n${lines.join('\n')}`;
    }
    case 'delete':
      return `Задача #${result.id} удалена.`;
    case 'delete_many': {
      if (result.count === 0) {
        return 'Подходящих задач не найдено — ничего не удалено.';
      }
      return `Удалено задач: ${result.count} (id: ${result.ids.join(', ')}).`;
    }
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
      `• #${t.id} «${t.title}» — приоритет ${t.priority ?? 'пустой'}${t.is_burning ? ', 🔥' : ''}`
  );
  return `${heading} (${tasks.length}):\n${lines.join('\n')}`;
}


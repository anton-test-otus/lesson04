import {
  bumpPriorityDown,
  bumpPriorityUp,
  validateBumpForTargets,
} from './priorityLadder.js';
import { resolveIntentWithPreviousTasks } from './sequentialActions.js';
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

/**
 * @param {object[]} intents
 * @param {{
 *   onStepStart?: (index: number, intent: object, total: number) => void,
 *   onStepDone?: (index: number, intent: object, result: object, total: number) => void,
 * }} [options]
 */
export async function executeTaskIntents(intents, options = {}) {
  if (!intents?.length) {
    throw new Error('Нет действий для выполнения');
  }

  if (intents.length === 1) {
    const rawIntent = intents[0];
    options.onStepStart?.(0, rawIntent, 1);
    const result = await executeTaskIntent(rawIntent);
    options.onStepDone?.(0, rawIntent, result, 1);
    return result;
  }

  /** @type {Array<{ intent: object, result: object }>} */
  const results = [];
  /** @type {Array<{ id: number }> | null} */
  let previousTasks = null;
  const total = intents.length;

  for (let index = 0; index < intents.length; index++) {
    const rawIntent = intents[index];

    if (rawIntent.action === 'reject') {
      return {
        kind: 'reject',
        reason: rawIntent.reason,
        sequence: { results, failedAt: results.length },
      };
    }

    options.onStepStart?.(index, rawIntent, total);

    const intent = resolveIntentWithPreviousTasks(rawIntent, previousTasks);
    const result = await executeTaskIntent(intent);

    options.onStepDone?.(index, intent, result, total);

    if (result?.kind === 'reject') {
      return {
        kind: 'reject',
        reason: result.reason,
        sequence: { results, failedAt: results.length },
      };
    }

    results.push({ intent, result });

    if (result.kind === 'tasks') {
      previousTasks = result.tasks;
    } else if (result.kind === 'update_many') {
      previousTasks = result.updated;
    }
  }

  return { kind: 'sequence', results };
}

/**
 * @param {Array<{ id?: number }>} tasks
 */
function dedupeTasksById(tasks) {
  const map = new Map();
  for (const task of tasks) {
    if (task?.id != null) {
      map.set(task.id, task);
    }
  }
  return [...map.values()];
}

/**
 * Приводит результат executor к формату, понятному SPA (всегда с updated при мутациях).
 * @param {object | null | undefined} execution
 */
export function executionToClientData(execution) {
  if (!execution || typeof execution !== 'object') {
    return null;
  }

  if (execution.kind === 'reject') {
    return execution;
  }

  if (execution.kind === 'sequence') {
    /** @type {object[]} */
    const updated = [];
    /** @type {object[]} */
    const created = [];
    /** @type {number[]} */
    const deletedIds = [];
    /** @type {object[] | null} */
    let displayTasks = null;

    for (const step of execution.results ?? []) {
      const result = step?.result;
      if (!result) {
        continue;
      }

      switch (result.kind) {
        case 'tasks':
          displayTasks = result.tasks;
          break;
        case 'task':
          if (result.task) {
            updated.push(result.task);
          }
          break;
        case 'update_many':
          updated.push(...(result.updated ?? []));
          break;
        case 'batch':
          created.push(...(result.created ?? []));
          break;
        case 'deleted':
          if (result.id != null) {
            deletedIds.push(result.id);
          }
          break;
        case 'delete_many':
          deletedIds.push(...(result.ids ?? []));
          break;
        default:
          break;
      }
    }

    const uniqueUpdated = dedupeTasksById(updated);
    const uniqueCreated = dedupeTasksById(created);
    const uniqueDeleted = [...new Set(deletedIds)];

    if (uniqueUpdated.length) {
      return {
        kind: 'update_many',
        updated: uniqueUpdated,
        count: uniqueUpdated.length,
      };
    }
    if (uniqueDeleted.length) {
      return {
        kind: 'delete_many',
        ids: uniqueDeleted,
        count: uniqueDeleted.length,
      };
    }
    if (uniqueCreated.length) {
      return {
        kind: 'batch',
        created: uniqueCreated,
        count: uniqueCreated.length,
      };
    }
    if (displayTasks) {
      return { kind: 'tasks', tasks: displayTasks };
    }

    return { kind: 'sequence', results: execution.results };
  }

  if (execution.kind === 'update_many') {
    const updated = dedupeTasksById(execution.updated ?? []);
    return {
      ...execution,
      updated,
      count: execution.count ?? updated.length,
    };
  }

  return execution;
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

/**
 * @param {Array<{ intent: object, result: object }>} results
 */
export function buildReplyFromSequence(results) {
  return results.map(({ intent, result }) => buildReply(intent, result)).join('\n\n');
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


import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as tasksApi from './tasksApi.js';
import { executeTaskIntent } from './taskExecutor.js';

const prioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/**
 * @param {string} name
 * @param {unknown} input
 * @param {() => Promise<Record<string, unknown>>} run
 */
async function runToolHandler(name, input, run) {
  try {
    const payload = await run();
    const kind = typeof payload.kind === 'string' ? payload.kind : 'unknown';
    const logEntry = { tool: name, kind, input, result: payload };

    if (kind === 'reject') {
      console.error('[ai/tool]', JSON.stringify(logEntry));
    } else {
      console.info('[ai/tool]', JSON.stringify(logEntry));
    }

    return JSON.stringify(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ai/tool]', JSON.stringify({ tool: name, input, error: message }));
    throw error;
  }
}

export function buildTaskTools() {
  return [
    tool(
      async (input = {}) =>
        runToolHandler('list_tasks', input, async () => {
          const tasks = await tasksApi.listTasks();
          return { kind: 'tasks', tasks };
        }),
      {
        name: 'list_tasks',
        description: 'Получить все задачи',
        schema: z.object({}),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('filter_tasks', input, async () => {
          const { q, priorities, burning_only } = input;
          const tasks = await tasksApi.filterTasks({
            q: q || undefined,
            priorities: priorities?.length ? priorities : undefined,
            burningOnly: burning_only,
          });
          return { kind: 'tasks', tasks };
        }),
      {
        name: 'filter_tasks',
        description:
          'Отфильтровать задачи: q (поиск по названию, * внутри слова), priorities [1,2,3], burning_only',
        schema: z.object({
          q: z.string().optional().nullable(),
          priorities: z.array(prioritySchema).optional(),
          burning_only: z.boolean().optional(),
        }),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('create_task', input, async () => {
          const { title, priority, is_burning } = input;
          const task = await tasksApi.createTask({
            title,
            priority: priority ?? null,
            is_burning: is_burning ?? false,
          });
          return { kind: 'task', task };
        }),
      {
        name: 'create_task',
        description: 'Создать одну задачу',
        schema: z.object({
          title: z.string(),
          priority: prioritySchema.optional(),
          is_burning: z.boolean().optional(),
        }),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('create_tasks_batch', input, async () => {
          const result = await tasksApi.createTasksBatch(input.titles);
          return { kind: 'batch', ...result };
        }),
      {
        name: 'create_tasks_batch',
        description: 'Создать несколько задач (массив названий)',
        schema: z.object({
          titles: z.array(z.string()).min(1),
        }),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('update_task', input, async () => {
          const { id, title, priority, is_burning } = input;
          const task = await tasksApi.updateTask(id, { title, priority, is_burning });
          return { kind: 'task', task };
        }),
      {
        name: 'update_task',
        description: 'Обновить задачу по id',
        schema: z.object({
          id: z.number().int().positive(),
          title: z.string(),
          priority: z.union([prioritySchema, z.null()]),
          is_burning: z.boolean(),
        }),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('update_tasks_bulk', input, async () => {
          const { q, priorities, burning_only, ids, set_priority, set_is_burning, bump_priority } =
            input;
          return executeTaskIntent({
            action: 'update_many',
            q,
            priorities,
            burning_only,
            ids,
            set_priority,
            set_is_burning,
            bump_priority,
          });
        }),
      {
        name: 'update_tasks_bulk',
        description:
          'Отбор (q, priorities, burning_only, ids); изменить set_priority, bump_priority (up/down), set_is_burning',
        schema: z
          .object({
            q: z.string().optional().nullable(),
            priorities: z.array(prioritySchema).optional(),
            burning_only: z.boolean().optional(),
            ids: z.array(z.number().int().positive()).optional(),
            set_priority: z.union([prioritySchema, z.null()]).optional(),
            set_is_burning: z.boolean().optional(),
            bump_priority: z.enum(['up', 'down']).optional(),
          })
          .refine(
            (d) =>
              d.set_priority !== undefined ||
              d.set_is_burning !== undefined ||
              d.bump_priority !== undefined,
            { message: 'set_priority, bump_priority or set_is_burning required' }
          )
          .refine((d) => !(d.set_priority !== undefined && d.bump_priority !== undefined), {
            message: 'set_priority or bump_priority, not both',
          }),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('delete_tasks_bulk', input, async () => {
          const { q, priorities, burning_only, ids } = input;
          return executeTaskIntent({
            action: 'delete_many',
            q,
            priorities,
            burning_only,
            ids,
          });
        }),
      {
        name: 'delete_tasks_bulk',
        description:
          'Удалить задачи по отбору. Пустой отбор = все задачи. «Удали все задачи» — без параметров.',
        schema: z.object({
          q: z.string().optional().nullable(),
          priorities: z.array(prioritySchema).optional(),
          burning_only: z.boolean().optional(),
          ids: z.array(z.number().int().positive()).optional(),
        }),
      }
    ),
    tool(
      async (input) =>
        runToolHandler('delete_task', input, async () => {
          await tasksApi.deleteTask(input.id);
          return { kind: 'deleted', id: input.id };
        }),
      {
        name: 'delete_task',
        description: 'Удалить одну задачу по id',
        schema: z.object({
          id: z.number().int().positive(),
        }),
      }
    ),
  ];
}

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as tasksApi from './tasksApi.js';
import { executeTaskIntent } from './taskExecutor.js';

const prioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export function buildTaskTools() {
  return [
    tool(
      async () => {
        const tasks = await tasksApi.listTasks();
        return JSON.stringify(tasks);
      },
      {
        name: 'list_tasks',
        description: 'Получить все задачи',
        schema: z.object({}),
      }
    ),
    tool(
      async ({ q, priorities, burning_only }) => {
        const tasks = await tasksApi.filterTasks({
          q: q || undefined,
          priorities: priorities?.length ? priorities : undefined,
          burningOnly: burning_only,
        });
        return JSON.stringify(tasks);
      },
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
      async ({ title, priority, is_burning }) => {
        const task = await tasksApi.createTask({
          title,
          priority: priority ?? 2,
          is_burning: is_burning ?? false,
        });
        return JSON.stringify(task);
      },
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
      async ({ titles }) => {
        const result = await tasksApi.createTasksBatch(titles);
        return JSON.stringify(result);
      },
      {
        name: 'create_tasks_batch',
        description:
          'Создать несколько задач (массив названий; для списка «добавь задачи:» + строки или через запятую)',
        schema: z.object({
          titles: z.array(z.string()).min(1),
        }),
      }
    ),
    tool(
      async ({ id, title, priority, is_burning }) => {
        const task = await tasksApi.updateTask(id, { title, priority, is_burning });
        return JSON.stringify(task);
      },
      {
        name: 'update_task',
        description: 'Обновить задачу по id',
        schema: z.object({
          id: z.number().int().positive(),
          title: z.string(),
          priority: prioritySchema,
          is_burning: z.boolean(),
        }),
      }
    ),
    tool(
      async ({ q, priorities, burning_only, ids, set_priority, set_is_burning, bump_priority }) => {
        const intent = {
          action: 'update_many',
          q,
          priorities,
          burning_only,
          ids,
          set_priority,
          set_is_burning,
          bump_priority,
        };
        const result = await executeTaskIntent(intent);
        return JSON.stringify(result);
      },
      {
        name: 'update_tasks_bulk',
        description:
          'Отбор задач (q, priorities, burning_only, ids); изменить set_priority, bump_priority (up/down), set_is_burning',
        schema: z
          .object({
            q: z.string().optional().nullable(),
            priorities: z.array(prioritySchema).optional(),
            burning_only: z.boolean().optional(),
            ids: z.array(z.number().int().positive()).optional(),
            set_priority: prioritySchema.optional(),
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
      async ({ id }) => {
        await tasksApi.deleteTask(id);
        return JSON.stringify({ deleted: true, id });
      },
      {
        name: 'delete_task',
        description: 'Удалить задачу по id',
        schema: z.object({
          id: z.number().int().positive(),
        }),
      }
    ),
  ];
}

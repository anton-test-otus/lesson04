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
        description: 'Создать несколько задач (массив названий)',
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
      async ({ q, priorities, burning_only, ids, set_priority, set_is_burning }) => {
        const intent = {
          action: 'update_many',
          q,
          priorities,
          burning_only,
          ids,
          set_priority,
          set_is_burning,
        };
        const result = await executeTaskIntent(intent);
        return JSON.stringify(result);
      },
      {
        name: 'update_tasks_bulk',
        description:
          'Выбрать задачи (q, priorities, burning_only, ids) и задать set_priority и/или set_is_burning',
        schema: z
          .object({
            q: z.string().optional().nullable(),
            priorities: z.array(prioritySchema).optional(),
            burning_only: z.boolean().optional(),
            ids: z.array(z.number().int().positive()).optional(),
            set_priority: prioritySchema.optional(),
            set_is_burning: z.boolean().optional(),
          })
          .refine((d) => d.set_priority !== undefined || d.set_is_burning !== undefined, {
            message: 'set_priority or set_is_burning required',
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

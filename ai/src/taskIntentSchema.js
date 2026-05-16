import { z } from 'zod';

const prioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const TaskIntentSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list'),
  }),
  z.object({
    action: z.literal('filter'),
    q: z.string().optional().nullable(),
    priorities: z.array(prioritySchema).optional(),
    burning_only: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('create'),
    title: z.string().min(1),
    priority: prioritySchema.optional(),
    is_burning: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('create_batch'),
    titles: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal('update'),
    id: z.number().int().positive(),
    title: z.string().min(1),
    priority: prioritySchema,
    is_burning: z.boolean(),
  }),
  z.object({
    action: z.literal('update_many'),
    q: z.string().optional().nullable(),
    priorities: z.array(prioritySchema).optional(),
    burning_only: z.boolean().optional(),
    ids: z.array(z.number().int().positive()).optional(),
    set_priority: prioritySchema.optional(),
    set_is_burning: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('delete'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('none'),
    message: z.string().optional(),
  }),
]);

export function formatTasksContext(tasks) {
  if (!tasks?.length) {
    return 'Список задач пуст.';
  }

  return tasks
    .map(
      (t) =>
        `#${t.id} «${t.title}» | приоритет ${t.priority} | горящая: ${t.is_burning ? 'да' : 'нет'}`
    )
    .join('\n');
}

export const TASK_INTENT_SYSTEM = `Ты планировщик команд для приложения задач. По запросу пользователя выбери одно действие.

Правила:
- priority: 1 — высокий, 2 — средний, 3 — низкий
- filter.q: поиск по названию; звёздочка * внутри слова = любые символы (как в API)
- filter: можно комбинировать q, priorities, burning_only (логика И)
- update: одна задача по id (можно менять title, priority, is_burning)
- update_many: выбрать несколько задач и сменить приоритет и/или «горящий» статус (название не менять)
  - отбор: q, priorities, burning_only (как filter), и/или явные ids
  - без отбора (ни q, ни priorities, ни burning_only, ни ids) — все задачи из списка
  - set_priority: новый приоритет; set_is_burning: true/false (хотя бы одно поле)
  - пример: «задачи с приоритетом 3 сделай горящими» → priorities:[3], set_is_burning:true
  - пример: «найди *отчёт* и поставь приоритет 1» → q:"*отчёт*", set_priority:1
- delete: используй id из списка задач ниже
- create_batch: несколько задач через массив titles
- none: обычный разговор без изменения задач (приветствие, вопрос не про задачи)

Верни только структурированное действие, без пояснений.`;

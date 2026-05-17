import { z } from 'zod';

const prioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const lexicalFilterSchema = z
  .object({
    q: z.string().nullable().optional(),
    priorities: z.array(prioritySchema).optional(),
    burning_only: z.boolean().optional(),
    all_tasks: z.boolean().optional(),
    ids: z.array(z.number().int().positive()).optional(),
  })
  .optional();

const lexicalMutationSchema = z
  .object({
    set_priority: z.union([prioritySchema, z.null()]).optional(),
    bump_priority: z.enum(['up', 'down']).optional(),
    set_is_burning: z.boolean().optional(),
  })
  .optional();

export const LexicalActionSchema = z.object({
  operation: z.enum(['find', 'list', 'mutate', 'delete_many', 'create', 'create_batch', 'delete']),
  filter: lexicalFilterSchema,
  mutation: lexicalMutationSchema,
  create: z
    .object({
      title: z.string().optional(),
      titles: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

export const LexicalParseSchema = z.object({
  operation: z.enum([
    'create',
    'create_batch',
    'delete',
    'delete_many',
    'find',
    'list',
    'mutate',
    'sequence',
    'reject',
    'unknown',
  ]),
  actions: z
    .array(LexicalActionSchema)
    .min(2)
    .max(4)
    .optional()
    .describe('Два и более действия по порядку: сначала отбор/показ, затем изменение или удаление'),
  detected_phrases: z
    .array(z.string())
    .describe('Какие группы смысла распознаны, напр. «найти», «низкий приоритет», «поднять приоритет»'),
  filter: lexicalFilterSchema,
  mutation: lexicalMutationSchema,
  create: z
    .object({
      title: z.string().optional(),
      titles: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  reject_reason: z.string().optional(),
  complete: z.boolean(),
});

export const LEXICAL_PARSE_SYSTEM = `Ты разбираешь команду пользователя для приложения задач (шаг 1 из 2).
Не вызывай API и не планируй HTTP — только структура смысла запроса.

Группы ключевых слов (учитывай словоформы):
1) Задачи: создать/добавить; удалить/убрать; отбор/поиск — найди, найти, покажи, отфильтруй, фильтр, поиск, поищи, ищи, искать.
2) Приоритет: применить/добавить/установить; убрать/снять/очистить статус или приоритет; поднять/опустить приоритет.
3) Отбор: по имени (q, * в шаблоне), по приоритету (1 высокий, 2 средний, 3 низкий), по горящим (burning_only).
4) Горящий статус: зажги / потуши / убери горящий.

operation:
- create — одна новая задача (title)
- create_batch — несколько названий (titles)
- find — только показать/найти без изменений
- mutate — только изменение без отдельного шага показа (редко)
- sequence — два шага: сначала find/list, затем mutate или delete_many (см. actions)
- delete_many — удалить по отбору или все
- list — показать все задачи
- reject — запрос не про задачи
- unknown — не удалось разобрать

Правила:
- «найди тест* и поднять приоритет» → operation: sequence, actions: [
    { operation: "find", filter: { q: "тест*" } },
    { operation: "mutate", mutation: { bump_priority: "up" } }
  ]
- Если в фразе явно два действия (найди/отфильтруй/фильтр/поиск/поищи/покажи … и … подними/удали/сними) — всегда sequence с actions, не одно mutate.
- «отфильтруй тест* и подними приоритет» → sequence: find + mutate (как для «найди … и …»)
- «поищи задачи Docker» → find, q: "Docker"
- «найди тест* с низким приоритетом» → find, q: "тест*", priorities: [3]
- Фразы про приоритет не клади в q
- «удали все задачи» → delete_many, filter.all_tasks: true
- complete: true только если уверенно заполнены поля для operation

Шкала приоритета: пустой=null; 1 высший; 2 средний; 3 низкий.`;

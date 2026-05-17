import { z } from 'zod';
import { TaskIntentSchema } from './taskIntentSchema.js';

export const ApiPlanStepSchema = z.object({
  method: z.enum(['GET', 'POST', 'DELETE']),
  path: z.string(),
  description: z.string(),
  query: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  body: z.record(z.unknown()).optional(),
});

export const ApiPlanSchema = z
  .object({
    steps: z.array(ApiPlanStepSchema),
    intent: TaskIntentSchema.optional(),
    intents: z.array(TaskIntentSchema).min(1).max(4).optional(),
    complete: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.intent && !data.intents?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'intent or intents required',
      });
    }
    if (data.intents?.some((i) => i.action === 'reject') && data.intents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reject must be alone',
      });
    }
  });

export const API_PLAN_SYSTEM = `Ты планировщик REST API задач (шаг 2 из 2).
На входе — JSON разбора команды (lexical) и исходная фраза пользователя.

Доступные эндпоинты:
- GET /api/tasks — все задачи (list)
- GET /api/tasks/filter — отбор: query q, priority (1|2|3), burning_only=1
- POST /api/tasks — создать { title, priority?, is_burning? }
- POST /api/tasks/batch — { titles: string[] }
- POST /api/tasks/{id}/update — { title, priority, is_burning }
- DELETE /api/tasks/{id}

Сопоставление operation → steps + intent:
| operation     | steps                                      | intent.action  |
|---------------|--------------------------------------------|----------------|
| list          | GET /api/tasks                             | list           |
| find          | GET /api/tasks/filter                      | filter         |
| create        | POST /api/tasks                            | create         |
| create_batch  | POST /api/tasks/batch                      | create_batch   |
| delete_many   | GET /filter (если есть отбор), DELETE …    | delete_many    |
| mutate        | GET /filter, POST …/update для каждой      | update_many    |
| sequence      | шаги всех actions по порядку               | intents[]      |

Два действия в одной фразе (найди/отфильтруй/фильтр/поиск/поищи … и подними / удали / сними статус):
- верни intents: [ { action: "filter", … }, { action: "update_many" | "delete_many", только изменения } ]
- во втором intent НЕ дублируй q/priorities/burning_only — отбор уже в первом шаге
- steps: GET /filter, затем POST …/update или DELETE для каждой

Для одного mutate без sequence — update_many с критериями отбора в intent.
Не смешивай set_priority и bump_priority.

complete: true если intent/intents соответствуют API и разбору lexical.
Если lexical.operation reject — intents: [{ action: "reject", reason: "..." }], steps: [].`;

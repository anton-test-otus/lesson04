import { z } from 'zod';
import { TaskIntentSchema } from './taskIntentSchema.js';

export const ApiPlanStepSchema = z.object({
  method: z.enum(['GET', 'POST', 'DELETE']),
  path: z.string(),
  description: z.string(),
  query: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  body: z.record(z.unknown()).optional(),
});

export const ApiPlanSchema = z.object({
  steps: z.array(ApiPlanStepSchema).min(1),
  intent: TaskIntentSchema,
  complete: z.boolean(),
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

Для update_many в intent: те же q, priorities, burning_only что в filter; плюс set_priority / bump_priority / set_is_burning.
Не смешивай set_priority и bump_priority.

complete: true если intent соответствует API и разбору lexical.
Если lexical.operation reject — intent: { action: "reject", reason: "..." }, steps: [].`;

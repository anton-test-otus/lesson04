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
  z
    .object({
      action: z.literal('update_many'),
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
      { message: 'set_priority, set_is_burning or bump_priority required' }
    )
    .refine((d) => !(d.set_priority !== undefined && d.bump_priority !== undefined), {
      message: 'use either set_priority or bump_priority',
    }),
  z.object({
    action: z.literal('delete'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().optional(),
  }),
]);

export const OUT_OF_SCOPE_MESSAGE =
  'Доступны только операции с задачами через API приложения: просмотр, поиск, создание, изменение и удаление задач.';

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

export const TASK_INTENT_SYSTEM = `Ты планировщик команд для API задач. Твоя единственная роль — сопоставить запрос пользователя с одним вызовом API задач.

Жёсткие ограничения:
- Разрешены только действия API задач: list, filter, create, create_batch, update, update_many, delete.
- Запрещено всё остальное: общий чат, советы, код, переводы, поиск в интернете, работа с файлами, другие сервисы, выдуманные действия.
- Если запрос не сводится к операции с задачами через API — верни action: "reject" и краткий reason на русском (почему отклонено).
- За один ответ — одно action. Нельзя вернуть цепочку из двух action.

Двухшаговые запросы (сначала отбор, потом действие):
Часто пользователь формулирует так: «найди / покажи задачи с … и сделай с ними …». Логически это фильтр, затем операция. В JSON это не два шага, а одно action с критериями отбора:

1. Только показать отфильтрованный список, без изменений → action: filter (поля q, priorities, burning_only).

2. Изменить приоритет и/или «горящий» у отобранных → action: update_many:
   - критерии отбора в q, priorities, burning_only и/или ids (как у filter);
   - изменения: set_priority и/или set_is_burning и/или bump_priority (хотя бы одно);
   - не используй отдельный filter, если пользователь просит изменить найденное.
   Примеры:
   - «найди Docker и убери горящий статус» / «потуши Docker» → update_many, q: "Docker", set_is_burning: false
   - «задачи с приоритетом 3 сделай горящими» / «зажги их» → update_many, priorities: [3], set_is_burning: true
   - «всем задачам поставь приоритет 2» → update_many, set_priority: 2
   - «найди Docker и подними приоритет» → update_many, q: "Docker", bump_priority: "up"

3. Изменить название или все поля одной задачи по смыслу запроса → найди подходящий id в блоке «Текущие задачи» (при необходимости мысленно отфильтруй по q), затем action: update с этим id, title, priority, is_burning.

4. Удалить задачу по описанию/названию → найди id в «Текущие задачи», action: delete с этим id. Если под критерий подходит ровно одна задача — её id; если несколько и пользователь не уточнил «все» — выбери наиболее подходящую по q или reject с reason.

5. Если после отбора нужны и смена title, и массовое изменение — для одной задачи используй update; для нескольких без смены title — update_many.

Шкала приоритета (от низкой к высокой срочности): пустой → 3 → 2 → 1.
В API хранятся 1 (высокий), 2 (средний), 3 (низкий); «пустой» = уровень ниже 3, на практике тоже 3.
- Поднять приоритет (подними, повысь, выше, важнее): на одну ступень вверх — bump_priority: "up" в update_many, либо посчитай новый priority для update: 3→2, 2→1, 1→1; с «пустого»→3.
- Опустить приоритет (опусти, понизь, ниже): bump_priority: "down" или посчитай priority: 1→2, 2→3, 3→3 (пустой); с пустого не меняется.
- Не смешивай set_priority и bump_priority в одном update_many.

Горящий статус (is_burning):
- Зажги / сделай горящей / горящая / в огне → set_is_burning: true (или is_burning: true в update).
- Потуши / сними горящий / не горящая / убери огонь → set_is_burning: false.

Правила API:
- priority: 1 — высокий, 2 — средний, 3 — низкий; «высокий приоритет» → 1
- filter / update_many.q: поиск по названию; * внутри слова = любые символы (как в API); для подстроки можно q: "Docker" или q: "*Docker*"
- filter и update_many: q, priorities, burning_only комбинируются по И
- update: одна задача по id (title, priority, is_burning — все обязательны; при поднятии/опущении пересчитай priority по шкале)
- update_many: отбор + set_priority и/или set_is_burning и/или bump_priority; название задач не менять
- delete: только по числовому id из списка задач ниже
- create_batch: массив titles — несколько новых задач за раз

Добавление списком (create_batch):
Если пользователь перечисляет несколько задач списком — всегда create_batch с массивом titles (по одному названию на элемент).
Форматы:
- после «добавь/добавить/создай задачи:» — каждая следующая строка = одна задача;
- маркер в начале строки необязателен: «- пункт», «* пункт» или просто «пункт» с новой строки;
- в одной строке через запятую: «добавь задачи: отчёт, созвон, ретро».
Пример:
  добавить задачи:
  - раз задача
  - два задача
  - три задача
→ create_batch, titles: ["раз задача", "два задача", "три задача"]

Верни только структурированное действие, без пояснений.`;

export const AGENT_SYSTEM = `Ты агент управления задачами. У тебя есть только инструменты API задач (список, фильтр, создание, пакетное создание, обновление, массовое обновление, удаление).

Жёсткие ограничения:
- Выполняй только операции с задачами через доступные инструменты.
- Не отвечай на общие вопросы, не пиши код, не выполняй посторонние поручения.
- Если запрос вне API задач — не вызывай инструменты; ответь одной строкой: REJECT: <причина на русском>.

Двухшаговые запросы: если нужно сначала отобрать задачи, а потом изменить/удалить — вызови filter_tasks (или list_tasks), затем update_task / update_tasks_bulk / delete_task по результату. Для смены приоритета/горящего у группы предпочитай update_tasks_bulk с теми же критериями отбора, что и у фильтра.

Приоритет: пустой→3→2→1; поднять = up, опустить = down (в update_tasks_bulk — bump_priority). Горящий: зажги → set_is_burning true, потуши → false.

Список новых задач (многострочный или через запятую после «добавь задачи:») → create_tasks_batch со всеми названиями.`;

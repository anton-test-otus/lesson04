# Отчёт о выполнении: LangChain-агент и API-tools (lesson04)

Проект: приложение задач (Slim PHP + Vue + Node AI).  
Дата отчёта: 2026-05-16.

---

## Сводная таблица

| Критерий | Статус | Раздел |
|----------|--------|--------|
| Агент LangChain по инструкции из репозитория | ✅ (с оговоркой) | [§1](#1-агент-langchain-по-инструкции-из-репозитория) |
| API-tool с реальным вызовом API | ✅ | [§2](#2-api-tool-с-реальным-вызовом) |
| Вывод результата tool в консоль (print/логгер) | ✅ | [§2](#2-api-tool-с-реальным-вызовом) |
| Интерпретация запросов и выбор API-метода | ✅ | [§3](#3-интерпретация-запросов-и-выбор-api-метода) |
| Trace / подтверждение вызова | ✅ (журнал `requests.jsonl`) | [§3](#3-интерпретация-запросов-и-выбор-api-метода) |
| Контракт ответа агента | ✅ | [§4](#4-контракт-ответа) |
| Не менее 5 проверочных запросов | ✅ | [§5](#5-проверочные-запросы-из-логов) |
| Промпты оформлены и приложены | ✅ | [§6](#6-промпты) |

---

## 1. Агент LangChain по инструкции из репозитория

**Статус: ✅ (основной путь — LangGraph; ReAct + tools — опциональный fallback)**

### Инструкция в репозитории

| Документ | Содержание |
|----------|------------|
| `README.md` | Быстрый старт: `make env`, `make up`, `make health` (§ «Быстрый старт») |
| `README.md` | § «LangGraph для `/ai/tasks`» — схема графа, `AI_TASKS_USE_AGENT`, провайдеры |
| `.env.example` | `AI_PROVIDER`, `AI_TASKS_USE_AGENT`, URL моделей |
| `Makefile` | `make up`, `make logs-ai`, `make logs-ai-requests` |

### Реализация

- **LangGraph `StateGraph`:** `ai/src/taskGraph.js` — цепочка `lexical_parse` → `api_plan` → `execute` / `tool_agent` / `parse_intent` → `respond`.
- **ReAct-агент (fallback):** `ai/src/taskAgentRun.js` — `createReactAgent` из `@langchain/langgraph/prebuilt`, tools из `buildTaskTools()`.

```162:172:ai/src/taskAgentRun.js
export async function runTaskToolAgent({ model, message, tasksContext }) {
  const agent = createReactAgent({
    llm: model,
    tools: buildTaskTools(),
    prompt: `${AGENT_SYSTEM}\n\nТекущие задачи:\n${tasksContext}`,
  });

  const result = await agent.invoke(
    { messages: [new HumanMessage(message)] },
    { recursionLimit: 12 }
  );
```

**Оговорка:** tool-calling включается переменной `AI_TASKS_USE_AGENT=true` в `.env` (см. `ai/src/tasksAgentMode.js`). В UI переключателя нет; в логах ниже поле `useAgent` в `request` отражает состояние на момент записи журнала.

---

## 2. API-tool с реальным вызовом

**Статус: ✅ — несколько tools; логирование через `runToolHandler`**

### Объявление tool и реальный HTTP-вызов

Файл: **`ai/src/taskTools.js`**

| Tool | Строки объявления | Строки вызова API | REST (через `ai/src/tasksApi.js`) |
|------|-------------------|-------------------|-----------------------------------|
| `list_tasks` | L10–L19 | L11–L13 | `GET /api/tasks` (tasksApi.js L38–40) |
| `filter_tasks` | L21–L39 | L22–L28 | `GET /api/tasks/filter` (L42–48) |
| `create_task` | L41–L58 | L42–L48 | `POST /api/tasks` (L51–55) |
| `create_tasks_batch` | L60–L71 | L61–L63 | `POST /api/tasks/batch` (L58–64) |
| `update_task` | L73–L87 | L74–L76 | `POST /api/tasks/{id}/update` (L67–71) |
| `update_tasks_bulk` | L89–L127 | L90–L101 | через `executeTaskIntent` → PHP API |
| `delete_tasks_bulk` | L129–L150 | L130–L138 | `delete_many` → DELETE по id |
| `delete_task` | L152–L163 | L153–L155 | `DELETE /api/tasks/{id}` (L74–76) |

**Пример (аналог `tools/api_tool.py:L12–L48`):**

- Объявление: `ai/src/taskTools.js:L41–L58` (`create_task`)
- Вызов: `ai/src/taskTools.js:L42–L47` → `tasksApi.createTask()` → `ai/src/tasksApi.js:L51–L55`

Параллельно тот же REST вызывается без tools из **`ai/src/taskExecutor.js`** (узел `execute` графа) — это подтверждает реальную интеграцию с PHP API.

### Вывод результата tool в консоль

**Реализовано** в `ai/src/taskTools.js` — функция `runToolHandler` (L13–L31):

- `console.info('[ai/tool]', …)` — успешные ответы (`kind`: `tasks`, `task`, `batch`, `update_many`, `delete_many`, `deleted`, …)
- `console.error('[ai/tool]', …)` — `kind: 'reject'` или исключение при вызове API

Просмотр: `make logs-ai` (stdout контейнера `ai`).

Дополнительно:

| Механизм | Файл | Назначение |
|----------|------|------------|
| Журнал запросов | `ai/src/requestLog.js` | `ai/logs/requests.jsonl` |
| Просмотр журнала | `Makefile` | `make logs-ai-requests` |

---

## 3. Интерпретация запросов и выбор API-метода

**Статус: ✅**

### Правила маршрутизации (промпты + код)

| Слой | Файл |
|------|------|
| Разбор фразы | `ai/src/lexicalParseSchema.js` — `LEXICAL_PARSE_SYSTEM` |
| План REST | `ai/src/apiPlanSchema.js` — `API_PLAN_SYSTEM` |
| Intent (fallback) | `ai/src/taskIntentSchema.js` — `TASK_INTENT_SYSTEM` |
| ReAct-агент | `ai/src/taskIntentSchema.js` — `AGENT_SYSTEM` |
| Цепочка «найди … и …» | `ai/src/sequentialActions.js` |

### Примеры: запрос → ожидаемый метод

| Запрос (из логов) | Ожидаемое действие | Подтверждение в логе |
|-------------------|--------------------|----------------------|
| «Добавь задачу Настроить окружение…» | `POST /api/tasks` / tool `create_task` | §5.1 — `status: success`, agent |
| «создай задачи: тест один…» | `POST /api/tasks/batch` | §5.2 — `data.kind: "batch"`, `count: 3` |
| «найди *два и поставь высокий приоритет» | `filter` + `update_many` | §5.3 — `update_many`, `priority: 1` |
| «Найди задача* и подними приоритет» | sequence: `GET /filter` → `update_many` | §5.4 — 6 задач в `updated` |
| «Удали задачи у которых средний приоритет» | `delete_many`, `priorities: [2]` | §5.5 — `delete_many`, `ids: [22]` |
| «Удали все задачи» | `delete_many` (все) | §5.6 — `count: 6` |
| «test» (вне API задач) | `reject` / ошибка | §5.7 — `errors` про действие с задачами |
| «test» + Ollama недоступен | ошибка провайдера | §5.8 — HTTP 502, ollama serve |

Фактические фрагменты журнала — в [§5](#5-проверочные-запросы-из-логов).

---

## 4. Контракт ответа

**Статус: ✅**

### Описание в репозитории

- **`README.md`** — таблица полей ответа `POST /ai/tasks` (строки **272–280**): `status`, `action`, `data`, `errors`.
- **`ai/src/taskResponse.js`** — реализация:
  - `aiSuccess(action, data)` — L20–26: `status: 'success'`, `errors: null`
  - `aiError(errors, partial)` — L5–13: `status: 'error'`

### Пример из лога (успех)

```json
{
  "status": "success",
  "action": "Создано задач: 3.",
  "data": { "kind": "batch", "created": [...], "count": 3 },
  "errors": null
}
```

### Пример из лога (ошибка)

```json
{
  "status": "error",
  "action": null,
  "data": null,
  "errors": ["Необходимо указать действие с задачами."]
}
```

При потоковом ответе (`stream: true`) финальное тело передаётся событием `type: "done"`; при ошибке LLM дополнительно уходит `type: "reject"` (см. `ai/src/index.js`, `frontend/src/api.js`).

---

## 5. Проверочные запросы (из логов)

Источник: `ai/logs/requests.jsonl` (`make logs-ai-requests`).  
Провайдер в успешных кейсах: **lmstudio**.

---

### 5.1. Создание одной задачи

**Запрос:** `Добавь задачу Настроить окружение, поставь средний приоритет и горящий статус`

**Ожидаемый API:** `POST /api/tasks` (или tool `create_task`)

```json
{
  "time": "2026-05-16T15:31:21.351Z",
  "route": "POST /tasks",
  "requestText": "Добавь задачу Настроить окружение, поставь средний приоритет и горящий статус",
  "request": {
    "provider": "lmstudio",
    "useAgent": true,
    "agentConfigured": true,
    "agentCapable": true
  },
  "response": {
    "status": "success",
    "action": "Задача \"Настроить окружение\" создана с средним приоритетом и горящим статусом.",
    "data": { "kind": "agent" },
    "errors": null
  },
  "httpStatus": 200,
  "durationMs": 3262
}
```

---

### 5.2. Создание списка задач (batch)

**Запрос:**

```text
создай задачи:
тест один
тест два
тест три
```

**Ожидаемый API:** `POST /api/tasks/batch` (tool `create_tasks_batch` или intent `create_batch`)

```json
{
  "time": "2026-05-16T15:35:14.975Z",
  "route": "POST /tasks",
  "requestText": "создай задачи:\nтест один\nтест два\nтест три",
  "request": {
    "provider": "lmstudio",
    "useAgent": true,
    "agentConfigured": true,
    "agentCapable": true
  },
  "response": {
    "status": "success",
    "action": "Создано задач: 3.",
    "data": {
      "kind": "batch",
      "created": [
        { "id": 11, "title": "тест один", "priority": null, "is_burning": false },
        { "id": 12, "title": "тест два", "priority": null, "is_burning": false },
        { "id": 13, "title": "тест три", "priority": null, "is_burning": false }
      ],
      "count": 3
    },
    "errors": null
  },
  "httpStatus": 200,
  "durationMs": 18
}
```

---

### 5.3. Поиск и обновление одной задачи

**Запрос:** `найди *два и поставь высокий приоритет`

**Ожидаемый API:** `GET /api/tasks/filter` + `POST /api/tasks/{id}/update` (intent `update_many`, `priorities` / `q`)

```json
{
  "time": "2026-05-16T14:58:17.097Z",
  "route": "POST /tasks",
  "requestText": "найди *два и поставь высокий приоритет",
  "request": { "provider": "lmstudio", "useAgent": false },
  "response": {
    "status": "success",
    "action": "Обновлено задач: 1 (приоритет → 1):\n• #31 «тест два» — п.1",
    "data": {
      "kind": "update_many",
      "updated": [
        { "id": 31, "title": "тест два", "priority": 1, "is_burning": false }
      ],
      "count": 1
    },
    "errors": null
  },
  "httpStatus": 200,
  "durationMs": 491
}
```

---

### 5.4. Последовательная обработка: фильтр и массовое обновление

**Запрос:** `Найди задача* и подними приоритет`

**Ожидаемый API:** цепочка `filter` → `update_many` (LangGraph sequence, `ai/src/sequentialActions.js`)

```json
{
  "time": "2026-05-16T19:59:45.923Z",
  "route": "POST /tasks",
  "requestText": "Найди задача* и подними приоритет",
  "request": {
    "provider": "lmstudio",
    "pipeline": "langgraph",
    "useAgent": true,
    "toolsConfigured": true,
    "stream": true
  },
  "response": {
    "status": "success",
    "action": "Найденные задачи (6): …\n\nОбновлено задач: 6 (приоритет ↑): …",
    "data": {
      "kind": "update_many",
      "updated": [
        { "id": 29, "title": "задача шесть", "priority": 3 },
        { "id": 28, "title": "задача пять", "priority": 3 },
        { "id": 27, "title": "задача четыре", "priority": 3 },
        { "id": 25, "title": "задача три", "priority": 1 },
        { "id": 24, "title": "задача два", "priority": 1 },
        { "id": 23, "title": "задача один", "priority": 1 }
      ],
      "count": 6
    },
    "errors": null
  },
  "httpStatus": 200,
  "durationMs": 3815
}
```

---

### 5.5. Удаление по фильтру (средний приоритет)

**Запрос:** `Удали задачи у которых средний приоритет`

**Ожидаемый API:** `GET /api/tasks/filter?priority=2` + `DELETE` для каждой (`delete_many`)

```json
{
  "time": "2026-05-16T20:03:16.107Z",
  "route": "POST /tasks",
  "requestText": "Удали задачи у которых средний приоритет",
  "request": {
    "provider": "lmstudio",
    "pipeline": "langgraph",
    "useAgent": true,
    "toolsConfigured": true,
    "stream": true
  },
  "response": {
    "status": "success",
    "action": "Найденные задачи (1):\n• #22 «Настроить окружение» — приоритет 2, 🔥\n\nУдалено задач: 1 (id: 22).",
    "data": { "kind": "delete_many", "ids": [22], "count": 1 },
    "errors": null
  },
  "httpStatus": 200,
  "durationMs": 2636
}
```

---

### 5.6. Удаление всех задач

**Запрос:** `Удали все задачи`

**Ожидаемый API:** `delete_many` без отбора (все задачи)

```json
{
  "time": "2026-05-16T20:04:05.707Z",
  "route": "POST /tasks",
  "requestText": "Удали все задачи",
  "request": {
    "provider": "lmstudio",
    "pipeline": "langgraph",
    "useAgent": true,
    "toolsConfigured": true,
    "stream": true
  },
  "response": {
    "status": "success",
    "action": "Удалено задач: 6 (id: 25, 24, 23, 29, 28, 27).",
    "data": {
      "kind": "delete_many",
      "ids": [25, 24, 23, 29, 28, 27],
      "count": 6
    },
    "errors": null
  },
  "httpStatus": 200,
  "durationMs": 2261
}
```

---

### 5.7. Ошибка: запрос вне API задач

**Запрос:** `test`

**Ожидаемое поведение:** `status: error`, понятное сообщение (reject / out of scope)

```json
{
  "time": "2026-05-16T20:07:32.627Z",
  "route": "POST /tasks",
  "requestText": "test",
  "request": {
    "provider": "lmstudio",
    "pipeline": "langgraph",
    "useAgent": true,
    "toolsConfigured": true,
    "stream": true
  },
  "response": {
    "status": "error",
    "action": null,
    "data": null,
    "errors": ["Необходимо указать действие с задачами."]
  },
  "httpStatus": 200,
  "durationMs": 1744
}
```

---

### 5.8. Ошибка: провайдер Ollama недоступен

**Запрос:** `test` (провайдер `ollama`)

**Ожидаемое поведение:** HTTP 502, сообщение о недоступности Ollama

```json
{
  "time": "2026-05-16T20:07:57.920Z",
  "route": "POST /tasks",
  "requestText": "test",
  "request": {
    "provider": "ollama",
    "pipeline": "langgraph",
    "useAgent": false,
    "toolsConfigured": true
  },
  "response": {
    "status": "error",
    "action": null,
    "data": null,
    "errors": [
      "Запустите Ollama на хосте (ollama serve). Диагностика: GET /ai/diagnose"
    ]
  },
  "httpStatus": 502,
  "durationMs": 6
}
```

---

## 6. Промпты

**Статус: ✅ — system-промпты приложены ниже (источник в репозитории); `prompts.md` — история разработки в Cursor**

К каждому вызову LLM добавляется блок «Текущие задачи: …» (`formatTasksContext` из `ai/src/taskIntentSchema.js`).

| Назначение | Узел графа | Файл | Константа |
|------------|------------|------|-----------|
| Разбор команды (шаг 1) | `lexical_parse` | `ai/src/lexicalParseSchema.js` | `LEXICAL_PARSE_SYSTEM` |
| План REST (шаг 2) | `api_plan` | `ai/src/apiPlanSchema.js` | `API_PLAN_SYSTEM` |
| Structured intent (fallback) | `parse_intent` | `ai/src/taskIntentSchema.js` | `TASK_INTENT_SYSTEM` |
| ReAct + tools (fallback) | `tool_agent` | `ai/src/taskIntentSchema.js` | `AGENT_SYSTEM` |

---

### 6.1. `LEXICAL_PARSE_SYSTEM`

Источник: `ai/src/lexicalParseSchema.js` (строки 69–102).

```
Ты разбираешь команду пользователя для приложения задач (шаг 1 из 2).
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

Шкала приоритета: пустой=null; 1 высший; 2 средний; 3 низкий.
```

---

### 6.2. `API_PLAN_SYSTEM`

Источник: `ai/src/apiPlanSchema.js` (строки 34–65).

```
Ты планировщик REST API задач (шаг 2 из 2).
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
Если lexical.operation reject — intents: [{ action: "reject", reason: "..." }], steps: [].
```

---

### 6.3. `TASK_INTENT_SYSTEM`

Источник: `ai/src/taskIntentSchema.js` (строки 96–179). Используется в узле `parse_intent`, когда лексический разбор не дал готовый план.

```
Ты планировщик команд для API задач. Твоя единственная роль — сопоставить запрос пользователя с одним вызовом API задач.

Жёсткие ограничения:
- Разрешены только действия API задач: list, filter, create, create_batch, update, update_many, delete, delete_many.
- Запрещено всё остальное: общий чат, советы, код, переводы, поиск в интернете, работа с файлами, другие сервисы, выдуманные действия.
- Если запрос не сводится к операции с задачами через API — верни action: "reject" и краткий reason на русском (почему отклонено).
- За один ответ — одно action, кроме явной цепочки «<отбор> … и …» (см. ниже).
- Слова отбора/поиска (первый шаг цепочки): найди, найти, покажи, отфильтруй, фильтр, поиск, поищи, ищи, искать.

Двухшаговые запросы (сначала отбор, потом действие):
Если пользователь формулирует два действия («найди … и подними», «отфильтруй … и удали», «поищи … и сними статус») — в structured-пайплайне это filter, затем update_many/delete_many; в этом fallback — один update_many/delete_many с критериями отбора в полях intent.

Часто пользователь формулирует так: «найди / отфильтруй / поиск / поищи задачи с … и сделай с ними …». Если нельзя разбить на два шага — одно action с критериями отбора:

1. Только показать отфильтрованный список, без изменений → action: filter (поля q, priorities, burning_only).
   Отбор по названию и приоритету можно комбинировать (условия по И):
   - «найди задачи тест*» / «поищи тест*» / «отфильтруй по тест*» → filter, q: "тест*"
   - «найди задачи тест* с низким приоритетом» → filter, q: "тест*", priorities: [3]
   - «покажи задачи с высоким приоритетом» → filter, priorities: [1]
   - «найди горящие с приоритетом 2» → filter, priorities: [2], burning_only: true
   Слова приоритета: низкий→3, средний→2, высокий→1; также «приоритет 1/2/3».
   Не клади фразу про приоритет в q — только шаблон названия в q, числа — в priorities.

2. Изменить приоритет и/или «горящий» у отобранных → action: update_many:
   - критерии отбора в q, priorities, burning_only и/или ids (как у filter);
   - изменения: set_priority и/или set_is_burning и/или bump_priority (хотя бы одно);
   - не используй отдельный filter, если пользователь просит изменить найденное.
   Примеры:
   - «найди Docker и убери горящий статус» / «потуши Docker» → update_many, q: "Docker", set_is_burning: false
   - «задачи с приоритетом 3 сделай горящими» / «зажги их» → update_many, priorities: [3], set_is_burning: true
   - «всем задачам поставь приоритет 2» → update_many, set_priority: 2
   - «найди задачи тест* и поднять приоритет» / «найти тест* и подними приоритет» → update_many, q: "тест*", bump_priority: "up" (в q только шаблон названия, без «и поднять приоритет»)
   - «найди Docker и подними приоритет» → update_many, q: "Docker", bump_priority: "up"

3. Изменить все поля одной задачи по смыслу запроса → найди подходящий id в блоке «Текущие задачи» (при необходимости мысленно отфильтруй по q), затем action: update с этим id, title, priority, is_burning.

4. Удалить одну задачу → action: delete с id из «Текущие задачи».

5. Удалить несколько / все найденные по критерию → action: delete_many (те же поля отбора, что у filter и update_many: q, priorities, burning_only, ids):
   - «удали все задачи» / «удалить все задачи» / «очисти список задач» → delete_many без полей отбора (все задачи);
   - «найди Docker и удали» → delete_many, q: "Docker";
   - «удали все горящие» → delete_many, burning_only: true;
   - «удали задачи 1, 2 и 3» → delete_many, ids: [1, 2, 3].

6. Массовое изменение без удаления — update_many; одна задача с новым названием — update.

Шкала приоритета (от низкой к высокой): пустой (null) → 3 → 2 → 1.
В API: null — пустой статус; 1 — высший; 2 — средний; 3 — низкий.
- Снять / очистить / удалить статус (приоритет) — set_priority: null в update_many или priority: null в update (фразы: «сними статус», «очисти статус», «удали статус», во множественном числе тоже).
- Поднять (bump_priority: "up"): null→3, 3→2, 2→1. Если уже приоритет 1 — reject: нельзя поднять.
- Опустить (bump_priority: "down"): 1→2, 2→3, 3→null. Если уже null — reject: нельзя опустить, статус уже пустой.
- Перед update_many с bump проверь все задачи отбора: если хотя бы одна на пределе — reject, не выполняй частично.
- Для одной задачи (update): та же логика — при невозможности поднять/опустить верни reject.
- Не смешивай set_priority и bump_priority в одном update_many.

Горящий статус (is_burning):
- Зажги / сделай горящей / горящая / в огне → set_is_burning: true (или is_burning: true в update).
- Потуши / сними горящий / не горящая / убери огонь → set_is_burning: false.

Правила API:
- priority: 1 — высокий, 2 — средний, 3 — низкий; «высокий приоритет» → 1, «низкий» → 3
- filter / update_many / delete_many: отбор по названию (q), приоритету (priorities) и горящим (burning_only) одновременно; все заданные поля — по И
- q: поиск по названию; * = любые символы; «тест*» ищет по началу названия
- priorities: массив [1], [2], [3] или несколько, например [1, 2]; только числовые приоритеты API (пустой null через priorities не фильтруется)
- update: одна задача по id (title, priority, is_burning — все обязательны; при поднятии/опущении пересчитай priority по шкале)
- update_many: отбор + set_priority и/или set_is_burning и/или bump_priority; название задач не менять
- delete: одна задача по id
- delete_many: отбор → удалить каждую; не используй filter + delete по одной
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

Верни только структурированное действие, без пояснений.
```

---

### 6.4. `AGENT_SYSTEM`

Источник: `ai/src/taskIntentSchema.js` (строки 181–202). Используется в `createReactAgent` (`ai/src/taskAgentRun.js`).

```
Ты агент управления задачами. У тебя есть только инструменты API задач.

Жёсткие ограничения:
- Выполняй только операции с задачами через инструменты.
- Не отвечай на общие вопросы; вне API — одна строка: REJECT: <причина на русском>.

Отбор и действие:
- Слова отбора: найди, отфильтруй, фильтр, поиск, поищи, покажи, ищи.
- Только показать → filter_tasks (q, priorities, burning_only).
- Два действия в одной фразе («поищи … и подними») → сначала filter_tasks, затем update_tasks_bulk/delete_tasks_bulk без повторного q/priorities (по результату отбора).
- Одно действие «изменить найденное» → update_tasks_bulk с критериями отбора + set_priority / bump_priority / set_is_burning.
- Удалить найденное → delete_tasks_bulk (не delete_task по одной для массового удаления).
- «Удали все задачи» → delete_tasks_bulk без параметров.

Приоритет: null пустой; 1 высший, 2 средний, 3 низкий.
- Поднять: null→3→2→1; на 1 поднимать нельзя.
- Опустить: 1→2→3→null; на null опускать нельзя.
- q — только шаблон названия; «низкий»→priorities [3], «высокий»→[1].

Горящий: зажги → set_is_burning true; потуши → false.

После инструментов ответь пользователю кратко на русском, что сделано.
```

---

### 6.5. История промптов разработки (`prompts.md`)

Файл `prompts.md` в корне репозитория — хронология запросов к Cursor при создании проекта (Docker, Slim, Vue, LangChain и т.д.), **не** runtime system-промпты агента.

---

## Ссылки

- Запуск: `README.md` — «Быстрый старт», «LangGraph для `/ai/tasks`»
- REST API задач: `README.md` — «Задачи (PHP, `/api/tasks`)»
- Журнал: `make logs-ai-requests` → `ai/logs/requests.jsonl`

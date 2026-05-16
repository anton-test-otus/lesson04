# Lesson04 — Tasks

Приложение для управления задачами: **Slim 4 (PHP)**, **Vue 3**, **MySQL**, **nginx**, **LangChain.js** (Ollama / LM Studio / OpenAI).

Единая точка входа: **[http://localhost](http://localhost)** (порт 80, reverse proxy).

## Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [REST API](#rest-api)
  - [Задачи (PHP, `/api/tasks`)](#задачи-php-apitasks)
  - [AI (Node, `/ai`)](#ai-node-ai)
- [Переменные окружения (`.env`)](#переменные-окружения-env)
  - [Правила](#правила)
  - [AI-сервис](#ai-сервис)
  - [Режимы LangChain для `/ai/tasks`](#режимы-langchain-для-aitasks)
  - [Примеры `.env`](#примеры-env)
  - [Настройка моделей](#настройка-моделей)
  - [Команды задач (`POST /ai/tasks`)](#команды-задач-post-aitasks)
- [LM Studio и Docker](#lm-studio-и-docker)
  - [Два разных URL](#два-разных-url)
  - [Serve on Local Network](#serve-on-local-network-доступ-из-docker)
- [Переменные в `docker-compose.yml](#переменные-в-docker-composeyml)`
- [Схема БД](#схема-бд)
- [Промпты разработки](#промпты-разработки)
- [Makefile](#makefile)
- [Устранение неполадок](#устранение-неполадок)

---

## Возможности

- CRUD задач с приоритетом (1 — высокий, 2 — средний, 3 — низкий) и флагом «Горящая»
- Пакетное добавление задач (через запятую)
- Фильтрация: поиск по названию (`*` внутри слова), несколько приоритетов, только горящие (логика **И**)
- Редактирование задачи в модальном окне
- AI-чат (LangChain.js): Ollama, LM Studio, OpenAI
- Статусы в шапке: **API: ok** и **AI: ok** (с проверкой доступности провайдера)

---

## Архитектура

```
Браузер → nginx:80
            ├── /           → frontend (Vite + Vue)
            ├── /api/*  → api (Slim + PHP)
            └── /ai/*   → ai (Node + LangChain.js)
                                    ↓
                              Ollama / LM Studio / OpenAI на хосте
            db:3306 ← api (MySQL)
```


| Сервис     | Порт (внутри) | Описание              |
| ---------- | ------------- | --------------------- |
| `nginx`    | 80            | Reverse proxy         |
| `frontend` | 5173          | Vue 3 + Vite          |
| `api`      | 80            | REST API (Slim)       |
| `ai`       | 3000          | AI API (LangChain.js) |
| `db`       | 3306          | MySQL 8               |


---

## Структура проекта

```
lesson04/
├── backend/          # Slim 4, PHP-DI, PDO
├── frontend/         # Vue 3, Vite
├── ai/               # Express + LangChain.js
├── docker/
│   ├── nginx/
│   └── db/
├── docker-compose.yml
├── Makefile          # сборка, статус, логи
├── prompts.md        # промпты при разработке (Cursor)
├── .env.example
└── .env              # не в git
```

---

## Быстрый старт

```bash
make env          # .env из .env.example (если ещё нет)
# настройте AI_PROVIDER и URL провайдера в .env

make up           # сборка и запуск в фоне
make health       # проверка API и AI
```

Откройте **[http://localhost](http://localhost)**.

Список команд: `make` или `make help`.

---

## REST API

### Задачи (PHP, `/api/tasks`)


| Метод           | Путь                     | Описание                                           |
| --------------- | ------------------------ | -------------------------------------------------- |
| `GET`           | `/api/health`            | Проверка API                                       |
| `GET`           | `/api/tasks`             | Список задач                                       |
| `GET`           | `/api/tasks/filter`      | Фильтрация (query-параметры)                       |
| `POST`          | `/api/tasks`             | Создать задачу                                     |
| `POST`          | `/api/tasks/batch`       | Пакетное создание (`titles`: строка через запятую) |
| `POST`          | `/api/tasks/{id}/update` | Обновить задачу                                    |
| `PUT` / `PATCH` | `/api/tasks/{id}`        | Обновить задачу (альтернатива)                     |
| `DELETE`        | `/api/tasks/{id}`        | Удалить задачу                                     |


**Фильтр** (`GET /api/tasks/filter`) — все переданные параметры объединяются через **И**:


| Параметр       | Описание                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------ |
| `q`            | Поиск по названию; `*` внутри слова — любые символы; слева/справа совпадение внутри строки |
| `priority`     | Один или несколько: `priority=1&priority=2` или `priorities=1,2`                           |
| `burning_only` | `1` / `true` — только горящие                                                              |


Примеры:

```bash
curl "http://localhost/api/tasks/filter?q=Наст*ить&priority=1&burning_only=1"
```

**Тело задачи:** `title`, `priority` (1–3), `is_burning` (boolean).

### AI (Node, `/ai`)


| Метод  | Путь            | Описание                                                                       |
| ------ | --------------- | ------------------------------------------------------------------------------ |
| `GET`  | `/ai/health`    | Сервис `ai` + доступность провайдера                                           |
| `GET`  | `/ai/ping`      | Быстрая проверка (без LM Studio)                                               |
| `GET`  | `/ai/diagnose`  | Проверка URL провайдера из `.env`, таблица `probes`                            |
| `GET`  | `/ai/providers` | Список провайдеров и настроек                                                  |
| `POST` | `/ai/chat`      | Свободный чат: `{ "message": "...", "provider": "lmstudio", "system": "..." }` |
| `POST` | `/ai/tasks`     | Команды задач на естественном языке (LangChain → PHP API)                      |


---

## Переменные окружения (`.env`)

Файл `.env` в корне подключается к сервису `**ai`** (`env_file` в `docker-compose.yml`).  
Остальные сервисы настраиваются в `docker-compose.yml`.

### Правила

1. `cp .env.example .env` — не коммитьте `.env`.
2. После изменения `.env`:
  ```bash
   docker compose up -d --build ai
   docker compose restart nginx
  ```
3. `AI_PROVIDER`: `ollama` | `lmstudio` | `openai` (алиасы: `lm-studio`, `lm_studio`).
4. Для **OpenAI** нужен `OPENAI_API_KEY`.
5. `*_MODEL` — id модели у провайдера; сервис `ai` попытается подобрать похожее имя из `/models`.

### AI-сервис


| Переменная           | По умолчанию                          | Описание                                                               |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `AI_PROVIDER`        | `ollama`                              | Провайдер по умолчанию                                                 |
| `AI_TEMPERATURE`     | `0.7`                                 | Температура (0–2)                                                      |
| `OLLAMA_BASE_URL`    | `http://host.docker.internal:11434`   | URL Ollama                                                             |
| `OLLAMA_MODEL`       | `llama3.2`                            | Модель Ollama                                                          |
| `LMSTUDIO_BASE_URL`  | `http://host.docker.internal:1234/v1` | OpenAI-совместимый API LM Studio                                       |
| `LMSTUDIO_MODEL`     | `local-model`                         | ID модели                                                              |
| `LMSTUDIO_API_KEY`   | `lm-studio`                           | Ключ (LM Studio часто принимает любую строку)                          |
| `OPENAI_API_KEY`     | —                                     | Ключ OpenAI                                                            |
| `OPENAI_MODEL`       | `gpt-4o-mini`                         | Модель OpenAI                                                          |
| `TASKS_API_BASE_URL` | `http://api`                          | URL PHP API из контейнера `ai` (в compose задано)                      |
| `AI_TASKS_USE_AGENT` | `false`                               | `true` — tool-calling agent; `false` — structured pipeline (см. ниже) |
| `AI_REQUEST_LOG_DIR`   | `/app/logs` (в compose)               | Каталог журнала запросов к AI (`requests.jsonl`)                     |
| `AI_REQUEST_LOG_FILE`  | `requests.jsonl`                      | Имя файла журнала                                                    |

### Режимы LangChain для `/ai/tasks`

Оба режима используют LangChain и тот же PHP API задач. Переключатель — `AI_TASKS_USE_AGENT` в `.env` или поле `"useAgent": true` в теле `POST /ai/tasks`. В журнале `ai/logs/requests.jsonl` это поле `request.useAgent`.

#### Structured pipeline (`AI_TASKS_USE_AGENT=false`, по умолчанию)

```
Фраза → LLM (structured output / JSON) → Zod-схема намерения → executeTaskIntent() → /api/tasks/...
```

- Один (редко два) вызов LLM на запрос — быстрее и предсказуемее.
- Допустимые действия заданы схемой: `list`, `filter`, `create`, `update_many`, `reject`, …
- Текст ответа формирует `buildReply()` (шаблоны на русском).
- Работает с **Ollama**, **LM Studio**, **OpenAI**.

#### Tool-calling agent (`AI_TASKS_USE_AGENT=true`)

```
Фраза → parseIntent (отсев reject) → AgentExecutor → tools (list_tasks, filter_tasks, …) → цикл до 6 шагов
```

- Модель сама выбирает инструменты и может выполнить цепочку (например: фильтр → обновление по id).
- Ответ в `action` — свободный текст агента; в `data` обычно актуальный список `tasks`.
- Только **LM Studio** и **OpenAI** (нужен tool calling у модели); для Ollama флаг игнорируется, остаётся structured pipeline.
- Обычно медленнее и менее детерминированно, зато удобнее для сложных формулировок.

| | Structured | Agent |
|---|------------|--------|
| Вызовов LLM | обычно 1 | несколько |
| Кто дергает API | код `taskExecutor` | tools в `taskTools.js` |
| Провайдеры | ollama, lmstudio, openai | lmstudio, openai |

### Примеры `.env`

**LM Studio:**

```env
AI_PROVIDER=lmstudio
AI_TASKS_USE_AGENT=true
LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1
LMSTUDIO_MODEL=qwen2.5-7b-instruct
LMSTUDIO_API_KEY=lm-studio
```

**Ollama:**

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2
```

**OpenAI:**

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Настройка моделей


| Провайдер | Переменная       | Откуда взять `id` модели                                                                                         |
| --------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| LM Studio | `LMSTUDIO_MODEL` | `curl http://127.0.0.1:1234/v1/models` → поле `data[].id` (после `lms load` и `lms server start --bind 0.0.0.0`) |
| Ollama    | `OLLAMA_MODEL`   | `curl http://127.0.0.1:11434/api/tags` → `models[].name`                                                         |
| OpenAI    | `OPENAI_MODEL`   | id из [документации OpenAI](https://platform.openai.com/docs/models)                                             |


Проверка из контейнера `ai` и списка настроек:

```bash
curl -s http://localhost/ai/health | jq '.provider.model, .provider.modelMatched'
curl -s http://localhost/ai/providers | jq
```

- `model` — модель, которую использует сервис (из `.env` или первая доступная при несовпадении).
- `modelMatched: false` — в `.env` указано имя, которого нет у провайдера; поправьте `*_MODEL`.
- В чате можно передать `"provider": "lmstudio"` / `"ollama"` / `"openai"` в теле `POST /ai/chat` (иначе берётся `AI_PROVIDER`).

### Команды задач на естественном языке (`POST /ai/tasks`)

LangChain разбирает запрос и вызывает REST API задач (`/api/tasks`, `/api/tasks/filter`, …). Режим — [structured или agent](#режимы-langchain-для-aitasks).

```bash
curl -X POST http://localhost/ai/tasks \
  -H "Content-Type: application/json" \
  -d '{"message":"создай горящую задачу срочно позвонить клиенту с приоритетом 1","provider":"lmstudio"}'
```

Ответ в едином формате:


| Поле     | Значение                                                              |
| -------- | --------------------------------------------------------------------- |
| `status` | `success` или `error`                                                 |
| `action` | Описание выполненного действия (текст на русском)                     |
| `data`   | Результат вызова API задач (`tasks`, `task`, `updated`, …) или `null` |
| `errors` | Массив сообщений об ошибках при `status: error`, иначе `null`         |


При успешных операциях, меняющих список, в `data.tasks` — актуальный список задач для UI.

Примеры фраз в UI:


| Запрос                                   | Действие API                                       |
| ---------------------------------------- | -------------------------------------------------- |
| «покажи все задачи»                      | `GET /api/tasks`                                   |
| «найди настрой* с приоритетом 1»         | `GET /api/tasks/filter`                            |
| «создай задачу купить молоко»            | `POST /api/tasks`                                  |
| «добавь задачи: отчёт, созвон»           | `POST /api/tasks/batch`                            |
| «измени задачу 2 — название …»           | `POST /api/tasks/{id}/update`                      |
| «задачи с приоритетом 3 сделай горящими» | `update_many` → filter + несколько `POST …/update` |
| «всем задачам поставь приоритет 2»       | `update_many` (все задачи)                         |
| «удали задачу 5»                         | `DELETE /api/tasks/{id}`                           |


---

## LM Studio и Docker

### Два разных URL


| URL                               | Что проверяет                                          |
| --------------------------------- | ------------------------------------------------------ |
| `http://localhost/ai/health`      | Сервис `ai` **и** доступ к LM Studio **из контейнера** |
| `http://127.0.0.1:1234/v1/models` | LM Studio **на хосте** (из терминала хоста)            |


Успех на хосте **не гарантирует** доступ из Docker, пока сервер слушает не только `127.0.0.1`.

### Serve on Local Network (доступ из Docker)

Из контейнера `localhost:1234` — это **сам контейнер**, не ваш ПК. Нужно, чтобы LM Studio принимал соединения с адреса шлюза Docker (например `172.19.0.1`), а не только с `127.0.0.1`.

**С GUI:** Local Server → включить **Serve on Local Network**.

**Linux, только CLI** (аналог «Serve on Local Network» — привязка к `0.0.0.0`):

```bash
lms ls
lms load <model_key>          # id модели, см. lms load --help
lms server start --bind 0.0.0.0 --port 1234
# опционально: export LMS_SERVER_HOST=0.0.0.0 && lms server start --port 1234
```

Проверка на **хосте**:

```bash
ss -tlnp | grep 1234          # ожидается 0.0.0.0:1234, не только 127.0.0.1:1234
curl -s http://127.0.0.1:1234/v1/models | head
```

Проверка из **контейнера `ai`**:

```bash
docker compose exec ai node -e "fetch('http://host.docker.internal:1234/v1/models',{signal:AbortSignal.timeout(8000)}).then(r=>console.log(r.status)).catch(e=>console.error(e.cause||e))"
```

В `.env`: `LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1` (в `docker-compose.yml` уже есть `extra_hosts: host.docker.internal:host-gateway`).

`LMSTUDIO_MODEL` должен совпадать с `id` из `/v1/models`.

---

## Переменные в `docker-compose.yml`

### PHP API (`api`)


| Переменная  | По умолчанию |
| ----------- | ------------ |
| `APP_DEBUG` | `true`       |
| `DB_HOST`   | `db`         |
| `DB_PORT`   | `3306`       |
| `DB_NAME`   | `app`        |
| `DB_USER`   | `app`        |
| `DB_PASS`   | `secret`     |


### Frontend (`frontend`)


| Переменная     | По умолчанию                                |
| -------------- | ------------------------------------------- |
| `VITE_API_URL` | `""` — запросы на тот же origin через nginx |


### MySQL (`db`)


| Переменная            | Значение |
| --------------------- | -------- |
| `MYSQL_ROOT_PASSWORD` | `root`   |
| `MYSQL_DATABASE`      | `app`    |
| `MYSQL_USER`          | `app`    |
| `MYSQL_PASSWORD`      | `secret` |


Порт **3306** проброшен на хост.

---

## Схема БД

При первом запуске MySQL выполняет `docker/db/init.sql` (таблица `tasks` с `priority`, `is_burning`).

Если volume уже был создан со старой схемой без этих полей — пересоздайте БД:

```bash
make reset-db
```

---

## Промпты разработки

Хронология запросов к AI-ассистенту (Cursor) при создании проекта — от Docker/Slim/Vue до LangChain и управления задачами текстом:

**[prompts.md](prompts.md)**

Там же краткие комментарии к отдельным шагам (CORS, Slim 4, LM Studio и т.д.).

Системные промпты **рантайма** (разбор команд `POST /ai/tasks`) задаются в коде:


| Файл                         | Назначение                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `ai/src/taskIntentSchema.js` | `TASK_INTENT_SYSTEM`, `AGENT_SYSTEM` — только API задач; иначе `reject` / ошибка |


---

## Makefile


| Команда                        | Действие                                                 |
| ------------------------------ | -------------------------------------------------------- |
| `make` / `make help`           | Список целей                                             |
| `make env`                     | Создать `.env` из `.env.example`                         |
| `make up`                      | Сборка образов и запуск (`docker compose up --build -d`) |
| `make build`                   | То же, что `up`                                          |
| `make stop`                    | Остановить контейнеры (без удаления)                     |
| `make down`                    | Остановить и удалить контейнеры                          |
| `make reload` / `make restart` | Перезапуск без пересборки                                |
| `make ps` / `make status`      | Статус сервисов                                          |
| `make logs`                    | Логи всех сервисов (follow)                              |
| `make logs-ai`                 | Логи `ai` (stdout контейнера)                            |
| `make logs-ai-requests`        | Журнал запросов к AI (`ai/logs/requests.jsonl`)          |
| `make logs-api`                | Логи `api`                                               |
| `make logs-frontend`           | Логи `frontend`                                          |
| `make logs-nginx`              | Логи `nginx`                                             |
| `make logs-db`                 | Логи `db`                                                |
| `make rebuild`                 | Сборка без кэша и запуск                                 |
| `make reset-db`                | `down -v` + `up` (новая БД из `init.sql`)                |
| `make health`                  | `curl` к `/api/health` и `/ai/health`                    |


### Журнал запросов к AI

Каждый вызов `POST /ai/tasks` и `POST /ai/chat` дописывает строку JSON в `ai/logs/requests.jsonl` (том `./ai/logs` в контейнере). Поля: `time`, `requestText`, `request` (метаданные), `response`, `httpStatus`, `durationMs`.

```bash
tail -f ai/logs/requests.jsonl
# или
make logs-ai-requests
```

После правки `.env` или кода AI:

```bash
make reload
# или пересборка только ai:
docker compose up -d --build ai
```

Проверка задач и чата:

```bash
curl http://localhost/api/tasks
curl -X POST http://localhost/ai/tasks \
  -H "Content-Type: application/json" \
  -d '{"message":"покажи все задачи","provider":"lmstudio"}'
```

---

## Устранение неполадок

### LM Studio: `ECONNREFUSED` из контейнера `ai`

1. На хосте: `lms server start --bind 0.0.0.0 --port 1234` (или **Serve on Local Network** в GUI).
2. `ss -tlnp | grep 1234` → `0.0.0.0:1234`.
3. В `.env` не используйте `localhost` — только `host.docker.internal`.
4. Firewall: `sudo ufw allow from 172.16.0.0/12 to any port 1234 proto tcp`

### Диагностика

```bash
curl -s http://localhost/ai/diagnose | jq
```

### Прочее


| Симптом                   | Решение                                               |
| ------------------------- | ----------------------------------------------------- |
| `Connection error` в чате | `/ai/diagnose` → `probes`; проверьте `--bind 0.0.0.0` |
| `502` на `/ai/*`          | `curl http://localhost:3000/ping`, `make logs-ai`     |
| Статус **AI** не `ok`     | `curl http://localhost/ai/health`                     |



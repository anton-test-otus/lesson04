# Lesson04 — Tasks

Приложение для управления задачами: **Slim 4 (PHP)**, **Vue 3**, **MySQL**, **nginx**, **LangChain.js** (Ollama / LM Studio / OpenAI).

Единая точка входа: **http://localhost** (порт 80, reverse proxy).

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

| Сервис    | Порт (внутри) | Описание                          |
|-----------|---------------|-----------------------------------|
| `nginx`   | 80            | Reverse proxy                     |
| `frontend`| 5173          | Vue 3 + Vite                      |
| `api`     | 80            | REST API (Slim)                   |
| `ai`      | 3000          | AI API (LangChain.js)             |
| `db`      | 3306          | MySQL 8                           |

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
├── .env.example
└── .env              # не в git
```

---

## Быстрый старт

```bash
cp .env.example .env
# Настройте AI_PROVIDER и URL провайдера (см. ниже)

docker compose up --build
```

Откройте **http://localhost**.

Проверка:

```bash
curl http://localhost/api/health
curl http://localhost/ai/health
```

---

## REST API

### Задачи (PHP, `/api/tasks`)

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/health` | Проверка API |
| `GET` | `/api/tasks` | Список задач |
| `GET` | `/api/tasks/filter` | Фильтрация (query-параметры) |
| `POST` | `/api/tasks` | Создать задачу |
| `POST` | `/api/tasks/batch` | Пакетное создание (`titles`: строка через запятую) |
| `POST` | `/api/tasks/{id}/update` | Обновить задачу |
| `PUT` / `PATCH` | `/api/tasks/{id}` | Обновить задачу (альтернатива) |
| `DELETE` | `/api/tasks/{id}` | Удалить задачу |

**Фильтр** (`GET /api/tasks/filter`) — все переданные параметры объединяются через **И**:

| Параметр | Описание |
|----------|----------|
| `q` | Поиск по названию; `*` внутри слова — любые символы; слева/справа совпадение внутри строки |
| `priority` | Один или несколько: `priority=1&priority=2` или `priorities=1,2` |
| `burning_only` | `1` / `true` — только горящие |

Примеры:

```bash
curl "http://localhost/api/tasks/filter?q=Наст*ить&priority=1&burning_only=1"
```

**Тело задачи:** `title`, `priority` (1–3), `is_burning` (boolean).

### AI (Node, `/ai`)

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/ai/health` | Сервис `ai` + доступность провайдера |
| `GET` | `/ai/ping` | Быстрая проверка (без LM Studio) |
| `GET` | `/ai/diagnose` | Проверка URL провайдера из `.env`, таблица `probes` |
| `GET` | `/ai/providers` | Список провайдеров и настроек |
| `POST` | `/ai/chat` | Чат: `{ "message": "...", "provider": "lmstudio", "system": "..." }` |

---

## Переменные окружения (`.env`)

Файл `.env` в корне подключается к сервису **`ai`** (`env_file` в `docker-compose.yml`).  
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

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `AI_PROVIDER` | `ollama` | Провайдер по умолчанию |
| `AI_TEMPERATURE` | `0.7` | Температура (0–2) |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | URL Ollama |
| `OLLAMA_MODEL` | `llama3.2` | Модель Ollama |
| `LMSTUDIO_BASE_URL` | `http://host.docker.internal:1234/v1` | OpenAI-совместимый API LM Studio |
| `LMSTUDIO_MODEL` | `local-model` | ID модели |
| `LMSTUDIO_API_KEY` | `lm-studio` | Ключ (LM Studio часто принимает любую строку) |
| `OPENAI_API_KEY` | — | Ключ OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini` | Модель OpenAI |

### Примеры `.env`

**LM Studio:**

```env
AI_PROVIDER=lmstudio
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

| Провайдер | Переменная | Откуда взять `id` модели |
|-----------|------------|---------------------------|
| LM Studio | `LMSTUDIO_MODEL` | `curl http://127.0.0.1:1234/v1/models` → поле `data[].id` (после `lms load` и `lms server start --bind 0.0.0.0`) |
| Ollama | `OLLAMA_MODEL` | `curl http://127.0.0.1:11434/api/tags` → `models[].name` |
| OpenAI | `OPENAI_MODEL` | id из [документации OpenAI](https://platform.openai.com/docs/models) |

Проверка из контейнера `ai` и списка настроек:

```bash
curl -s http://localhost/ai/health | jq '.provider.model, .provider.modelMatched'
curl -s http://localhost/ai/providers | jq
```

- `model` — модель, которую использует сервис (из `.env` или первая доступная при несовпадении).
- `modelMatched: false` — в `.env` указано имя, которого нет у провайдера; поправьте `*_MODEL`.
- В чате можно передать `"provider": "lmstudio"` / `"ollama"` / `"openai"` в теле `POST /ai/chat` (иначе берётся `AI_PROVIDER`).

---

## LM Studio и Docker

### Два разных URL

| URL | Что проверяет |
|-----|----------------|
| `http://localhost/ai/health` | Сервис `ai` **и** доступ к LM Studio **из контейнера** |
| `http://127.0.0.1:1234/v1/models` | LM Studio **на хосте** (из терминала хоста) |

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

| Переменная | По умолчанию |
|------------|--------------|
| `APP_DEBUG` | `true` |
| `DB_HOST` | `db` |
| `DB_PORT` | `3306` |
| `DB_NAME` | `app` |
| `DB_USER` | `app` |
| `DB_PASS` | `secret` |

### Frontend (`frontend`)

| Переменная | По умолчанию |
|------------|--------------|
| `VITE_API_URL` | `""` — запросы на тот же origin через nginx |

### MySQL (`db`)

| Переменная | Значение |
|------------|----------|
| `MYSQL_ROOT_PASSWORD` | `root` |
| `MYSQL_DATABASE` | `app` |
| `MYSQL_USER` | `app` |
| `MYSQL_PASSWORD` | `secret` |

Порт **3306** проброшен на хост.

---

## Миграция БД (существующий volume)

Если БД создана до полей `priority` / `is_burning`:

```bash
docker compose exec -T db mysql -uapp -psecret app < docker/db/migrate-priority-burning.sql
```

Или пересоздать volume:

```bash
docker compose down -v
docker compose up --build
```

---

## Полезные команды

```bash
# Запуск / пересборка
docker compose up --build -d

# Только AI после правки .env
docker compose up -d --build ai

# Логи
docker compose logs -f ai

# Проверка API
curl http://localhost/api/health
curl http://localhost/api/tasks

# Проверка AI
curl http://localhost/ai/health
curl -X POST http://localhost/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Привет","provider":"lmstudio"}'
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

| Симптом | Решение |
|---------|---------|
| `Connection error` в чате | `/ai/diagnose` → `probes`; проверьте `--bind 0.0.0.0` |
| `502` на `/ai/*` | `curl http://localhost:3000/ping`, `docker compose logs ai` |
| Статус **AI** не `ok` | `curl http://localhost/ai/health` |

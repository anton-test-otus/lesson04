# Lesson04 — Tasks (Slim + Vue + Docker)

Приложение для задач: PHP API, Vue-фронтенд, MySQL, nginx, AI-сервис на LangChain.js.

## Быстрый старт

```bash
cp .env.example .env
# отредактируйте .env под свой провайдер AI
docker compose up --build
```

Откройте http://localhost

---

## Переменные окружения (`.env`)

Файл `.env` в корне проекта подхватывается сервисом **`ai`** (`env_file` в `docker-compose.yml`).  
Остальные сервисы используют значения из `docker-compose.yml` (см. таблицу ниже).

**Правила:**

1. Скопируйте шаблон: `cp .env.example .env` — не коммитьте `.env` в git.
2. После изменения `.env` перезапустите AI-сервис:
   ```bash
   docker compose up -d --build ai
   ```
3. Для локальных моделей (Ollama, LM Studio) URL всегда с **`host.docker.internal`** — из контейнера `localhost` указывает на сам контейнер, а не на ваш ПК.
4. `AI_PROVIDER` — одно значение из списка: `ollama`, `lmstudio`, `openai`. Допустимы алиасы `lm-studio`, `lm_studio`.
5. Для **OpenAI** обязателен непустой `OPENAI_API_KEY`.
6. Имя модели (`*_MODEL`) должно совпадать с тем, что реально запущено у провайдера (в LM Studio — как в списке моделей, в Ollama — как после `ollama pull`).

### AI-сервис (файл `.env`)

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `AI_PROVIDER` | нет | `ollama` | Активный провайдер: `ollama` \| `lmstudio` \| `openai` |
| `AI_TEMPERATURE` | нет | `0.7` | Температура генерации (0–2) |
| `OLLAMA_BASE_URL` | для Ollama | `http://host.docker.internal:11434` | Базовый URL Ollama API |
| `OLLAMA_MODEL` | для Ollama | `llama3.2` | Имя модели в Ollama |
| `LMSTUDIO_BASE_URL` | для LM Studio | `http://host.docker.internal:1234/v1` | OpenAI-совместимый endpoint LM Studio |
| `LMSTUDIO_MODEL` | для LM Studio | `local-model` | ID модели (как в LM Studio / `GET /v1/models`) |
| `LMSTUDIO_API_KEY` | нет | `lm-studio` | API-ключ; LM Studio часто принимает любую строку |
| `OPENAI_API_KEY` | для OpenAI | — | Ключ с platform.openai.com |
| `OPENAI_MODEL` | для OpenAI | `gpt-4o-mini` | Модель OpenAI |

### Примеры конфигурации

**LM Studio** (локальный сервер на порту 1234):

```env
AI_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://host.docker.internal:1234/v1
LMSTUDIO_MODEL=qwen2.5-7b-instruct
LMSTUDIO_API_KEY=lm-studio
```

Перед запуском включите **Local Server** в LM Studio. Проверка с хоста: `curl http://localhost:1234/v1/models`.

**Ollama:**

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2
```

На хосте: `ollama serve` и `ollama pull llama3.2`.

**OpenAI:**

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Важно: health и LM Studio

| URL | Назначение |
|-----|------------|
| `http://localhost/api/ai/health` | Проверка **Node AI-сервиса** в Docker |
| `http://localhost:1234/v1/models` | Проверка **LM Studio на хосте** (не через nginx) |

Статус **AI: ok** в интерфейсе означает, что контейнер `ai` отвечает. Связь с LM Studio/Ollama проверяется при отправке сообщения в чат.

---

## Переменные в `docker-compose.yml` (без `.env`)

Эти значения заданы в compose и обычно **не требуют** `.env`, если вы не меняете compose.

### PHP API (`api`)

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `APP_DEBUG` | `true` | Подробные ошибки в JSON (`false` в продакшене) |
| `DB_HOST` | `db` | Хост MySQL внутри Docker-сети |
| `DB_PORT` | `3306` | Порт MySQL |
| `DB_NAME` | `app` | Имя БД |
| `DB_USER` | `app` | Пользователь БД |
| `DB_PASS` | `secret` | Пароль БД |

### Frontend (`frontend`)

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `VITE_API_URL` | `""` (пусто) | Базовый URL API. Пусто = тот же origin (`http://localhost`), запросы через nginx |

### MySQL (`db`)

| Переменная | По умолчанию |
|------------|--------------|
| `MYSQL_ROOT_PASSWORD` | `root` |
| `MYSQL_DATABASE` | `app` |
| `MYSQL_USER` | `app` |
| `MYSQL_PASSWORD` | `secret` |

---

## Полезные команды

```bash
# пересборка после смены nginx / compose
docker compose up --build -d

# только AI после правки .env
docker compose up -d --build ai
docker compose restart nginx

# проверка
curl http://localhost/api/health
curl http://localhost/api/ai/health
```

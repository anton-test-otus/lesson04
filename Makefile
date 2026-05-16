.PHONY: help up build stop down restart ps status logs logs-api logs-ai logs-frontend logs-nginx logs-db \
	reload rebuild env health reset-db

COMPOSE := docker compose

help:
	@echo "Lesson04 — Docker Compose"
	@echo ""
	@echo "  make up          Сборка и запуск в фоне"
	@echo "  make build       Пересобрать образы и запустить"
	@echo "  make stop        Остановить контейнеры (без удаления)"
	@echo "  make down        Остановить и удалить контейнеры и сеть"
	@echo "  make reload      Перезапуск (контейнеры должны быть запущены)"
	@echo "  make restart     То же, что reload"
	@echo "  make ps          Статус сервисов (status)"
	@echo "  make logs        Логи всех сервисов (-f)"
	@echo "  make logs-ai     Логи сервиса ai"
	@echo "  make logs-api    Логи сервиса api"
	@echo "  make logs-frontend / logs-nginx / logs-db"
	@echo "  make rebuild     Сборка без кэша и запуск"
	@echo "  make env         Скопировать .env.example → .env (если нет)"
	@echo "  make health      Проверка /api/health и /ai/health"
	@echo "  make reset-db    down -v и up (новая БД из init.sql)"

env:
	@test -f .env || cp .env.example .env
	@echo ".env готов"

up: env
	$(COMPOSE) up --build -d

build: up

stop:
	$(COMPOSE) stop

down:
	$(COMPOSE) down

restart reload:
	$(COMPOSE) restart

ps status:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

logs-ai:
	$(COMPOSE) logs -f ai

logs-api:
	$(COMPOSE) logs -f api

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-nginx:
	$(COMPOSE) logs -f nginx

logs-db:
	$(COMPOSE) logs -f db

rebuild: env
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

reset-db: env
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d

health:
	@curl -sf http://localhost/api/health | head -c 200; echo ""
	@curl -sf http://localhost/ai/health | head -c 400; echo ""

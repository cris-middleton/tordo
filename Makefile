.PHONY: help setup install lint lint-fix format test test-backend test-etl test-cov \
        dev-up dev-up-d dev-down dev-logs dev-build dev-restart dev-shell db-shell dev-clean \
        migrate migrate-create migrate-status downgrade \
        front-install front-dev front-build front-lint front-test \
        hooks lock

# Compose resuelve `.env` desde el directorio del archivo (infra/), no desde la
# raíz del repo. Sin --env-file, el .env que documenta el README se ignora por
# completo para la interpolación de ${VAR} y siempre ganan los defaults.
ENV_FILE := $(wildcard .env)
COMPOSE := docker compose -f infra/docker-compose.yml $(if $(ENV_FILE),--env-file .env,)

help: ## Muestra esta ayuda
	@echo 'Uso: make [target]'
	@echo ''
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Entorno local ────────────────────────────────────────────────────────────

setup: install hooks ## Setup completo de un clone/worktree nuevo (deps + hooks)
	@echo "✓ Listo. Recuerda crear tu .env (cp .env.example .env)"

install: ## Instala todas las dependencias Python (api + etl + dev) desde uv.lock
	uv sync --frozen

lock: ## Regenera uv.lock tras editar pyproject.toml
	uv lock

hooks: ## Instala los hooks de pre-commit (una vez por clone; los worktrees los comparten)
	uv run pre-commit install

# ── Worktrees ────────────────────────────────────────────────────────────────
# Toda feature se desarrolla en un worktree, nunca ramificando en el checkout
# principal. Estos targets hacen el setup completo para que no haya excusa.
#
# La raíz se deriva del .git COMÚN, no de una ruta relativa: así `make worktree`
# funciona igual desde el checkout principal que desde otro worktree. Con una
# ruta relativa, invocarlo desde un worktree creaba tordo-worktrees/tordo-worktrees/.
WORKTREE_ROOT := $(shell dirname $$(git rev-parse --path-format=absolute --git-common-dir))/../tordo-worktrees

worktree: ## Crea un worktree listo para trabajar — make worktree NOMBRE=mi-feature
	@test -n "$(NOMBRE)" || (echo "ERROR: falta NOMBRE. Uso: make worktree NOMBRE=mi-feature" && exit 1)
	git worktree add $(WORKTREE_ROOT)/$(NOMBRE) -b feat/$(NOMBRE)
	@cp .env $(WORKTREE_ROOT)/$(NOMBRE)/.env 2>/dev/null \
		&& echo "  .env copiado (los worktrees no heredan archivos gitignoreados)" \
		|| echo "  OJO: no hay .env que copiar — crea uno antes de levantar el stack"
	cd $(WORKTREE_ROOT)/$(NOMBRE) && uv sync --frozen
	@echo ""
	@echo "✓ listo:  cd $(WORKTREE_ROOT)/$(NOMBRE)"
	@echo "  Los hooks se comparten con este clone, no hay que reinstalarlos."

worktree-list: ## Lista los worktrees activos
	git worktree list

worktree-clean: ## Elimina un worktree ya mergeado — make worktree-clean NOMBRE=mi-feature
	@test -n "$(NOMBRE)" || (echo "ERROR: falta NOMBRE." && exit 1)
	git worktree remove $(WORKTREE_ROOT)/$(NOMBRE)
	@echo "✓ worktree eliminado. La rama feat/$(NOMBRE) sigue existiendo; bórrala si ya mergeaste."

# ── Calidad ──────────────────────────────────────────────────────────────────

lint: ## Lint + chequeo de formato (lo mismo que corre CI)
	uv run ruff check backend/app backend/tests etl
	uv run ruff format --check backend/app backend/tests etl

lint-fix: ## Autocorrige lo que ruff pueda
	uv run ruff check backend/app backend/tests etl --fix

format: ## Formatea el código
	uv run ruff format backend/app backend/tests etl

# ── Tests ────────────────────────────────────────────────────────────────────

test: test-backend test-etl ## Corre todas las suites

test-backend: ## Tests del backend
	cd backend && uv run --project .. pytest

test-etl: ## Tests del ETL
	cd etl && uv run --project .. pytest

test-cov: ## Tests del backend con cobertura
	cd backend && uv run --project .. pytest --cov=app --cov-report=term-missing

# ── Docker (stack completo) ──────────────────────────────────────────────────

dev-up: ## Levanta el entorno de desarrollo
	$(COMPOSE) up --build

dev-up-d: ## Levanta el entorno de desarrollo en segundo plano
	$(COMPOSE) up -d --build

dev-down: ## Detiene el entorno de desarrollo
	$(COMPOSE) down

dev-logs: ## Sigue los logs
	$(COMPOSE) logs -f

dev-build: ## Reconstruye las imágenes
	$(COMPOSE) build

dev-restart: ## Reinicia los servicios
	$(COMPOSE) restart

dev-shell: ## Shell dentro del contenedor del backend
	$(COMPOSE) exec backend bash

db-shell: ## psql contra la base de desarrollo
	$(COMPOSE) exec db psql -U postgres -d licitaciones

dev-clean: ## Detiene y borra contenedores, redes y volúmenes
	$(COMPOSE) down -v

# ── Migraciones ──────────────────────────────────────────────────────────────
# NUNCA usar `alembic revision` directo: rompe las cadenas de down_revision.

migrate: ## Aplica las migraciones pendientes
	$(COMPOSE) exec backend alembic upgrade head

migrate-create: ## Crea una migración — make migrate-create MSG="descripción"
	@test -n "$(MSG)" || (echo "ERROR: falta MSG. Uso: make migrate-create MSG=\"descripción\"" && exit 1)
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(MSG)"

migrate-status: ## Revisión actual de la base
	$(COMPOSE) exec backend alembic current

downgrade: ## Revierte la última migración
	$(COMPOSE) exec backend alembic downgrade -1

# ── Frontend ─────────────────────────────────────────────────────────────────

front-install: ## Instala dependencias del frontend
	cd frontend && npm install

front-dev: ## Servidor de desarrollo del frontend (puerto 3000)
	cd frontend && npm run dev

front-build: ## Build de producción del frontend
	cd frontend && npm run build

front-lint: ## Lint del frontend
	cd frontend && npm run lint

front-test: ## Tests del frontend
	cd frontend && npm test

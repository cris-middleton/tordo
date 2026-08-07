.PHONY: help setup install lint lint-fix format test test-backend test-etl test-cov \
        dev-up dev-up-d dev-down dev-logs dev-build dev-restart dev-shell db-shell dev-clean \
        migrate migrate-create migrate-status downgrade merge \
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
	@# node_modules está gitignoreado, así que el worktree nace sin él y
	@# `tsc --noEmit` no puede correr. Un cambio de frontend sin typecheck es
	@# justo el que se cuela.
	cd $(WORKTREE_ROOT)/$(NOMBRE)/frontend && npm ci --silent
	@echo ""
	@echo "✓ listo:  cd $(WORKTREE_ROOT)/$(NOMBRE)"
	@echo "  Los hooks se comparten con este clone, no hay que reinstalarlos."

worktree-list: ## Lista los worktrees activos
	git worktree list

worktree-clean: ## Elimina un worktree ya mergeado — make worktree-clean NOMBRE=mi-feature
	@test -n "$(NOMBRE)" || (echo "ERROR: falta NOMBRE." && exit 1)
	@# Los contenedores dejaban __pycache__/ de root en el árbol montado y
	@# `git worktree remove` moría con Permission denied. Ya se corrigió en los
	@# Dockerfile (PYTHONDONTWRITEBYTECODE), pero un worktree anterior a esa
	@# corrección sigue teniéndolos, así que el error hay que explicarlo.
	@git worktree remove $(WORKTREE_ROOT)/$(NOMBRE) || { \
		echo ""; \
		echo "No se pudo eliminar. Si el error es 'Permission denied', son archivos"; \
		echo "de root que dejaron los contenedores. Míralos y bórralos con:"; \
		echo "  find $(WORKTREE_ROOT)/$(NOMBRE) -user root"; \
		echo "  sudo find $(WORKTREE_ROOT)/$(NOMBRE) -user root -delete"; \
		echo "  make worktree-clean NOMBRE=$(NOMBRE)"; \
		exit 1; \
	}
	@echo "✓ worktree eliminado. La rama feat/$(NOMBRE) sigue existiendo; bórrala si ya mergeaste."

# ── Calidad ──────────────────────────────────────────────────────────────────

merge: ## Mergea un PR sólo con todos los checks en verde — make merge PR=33
	@test -n "$(PR)" || (echo "ERROR: falta PR. Uso: make merge PR=33" && exit 1)
	./scripts/merge-pr.sh $(PR)

ci: ## Corre en local lo mismo que Actions, para no esperar al runner
	./scripts/ci-local.sh

lint: ## Lint + chequeo de formato (lo mismo que corre CI)
	uv run ruff check backend/app backend/tests etl
	uv run ruff format --check backend/app backend/tests etl

lint-fix: ## Autocorrige lo que ruff pueda
	uv run ruff check backend/app backend/tests etl --fix

format: ## Formatea el código
	uv run ruff format backend/app backend/tests etl

# ── Tests ────────────────────────────────────────────────────────────────────

test: test-backend test-etl front-test ## Corre todas las suites

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

# Alembic corre en el host, no dentro del contenedor. Dentro fallaba desde
# cualquier worktree: `docker compose exec` resuelve el cwd contra el montaje del
# contenedor, que sólo cubre el checkout principal, y aborta con "current working
# directory is outside of container mount namespace root". La regla de trabajar
# en worktrees y la de crear migraciones con `make` se contradecían.
#
# Corriéndolo en el host sólo hace falta DATABASE_URL apuntando a la base; no
# hace falta tener el stack levantado.
ALEMBIC = cd backend && uv run --project .. alembic

migrate: ## Aplica las migraciones pendientes
	$(ALEMBIC) upgrade head

migrate-create: ## Crea una migración — make migrate-create MSG="descripción"
	@test -n "$(MSG)" || (echo "ERROR: falta MSG. Uso: make migrate-create MSG=\"descripción\"" && exit 1)
	@echo "OJO: revisa el esqueleto antes de commitearlo. Queda deriva conocida"
	@echo "     entre modelos y migraciones, así que autogenerate incluirá"
	@echo "     operaciones que no quieres. Ver docs/ARQUITECTURA_REVISION §5.0."
	$(ALEMBIC) revision --autogenerate -m "$(MSG)"

migrate-status: ## Revisión actual de la base
	$(ALEMBIC) current

downgrade: ## Revierte la última migración
	$(ALEMBIC) downgrade -1

# ── Frontend ─────────────────────────────────────────────────────────────────

front-install: ## Instala dependencias del frontend
	cd frontend && npm install

front-dev: ## Servidor de desarrollo del frontend (puerto 3000)
	cd frontend && npm run dev

front-build: ## Build de producción del frontend
	cd frontend && npm run build

front-lint: ## Lint del frontend
	cd frontend && npm run lint

front-test: ## Tests del frontend (una pasada, no watch)
	cd frontend && npm test -- --run

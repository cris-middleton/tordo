#!/usr/bin/env bash
#
# Corre localmente lo mismo que .github/workflows/ci.yml.
#
# Por qué existe
# --------------
# GitHub Actions no está habilitado en esta cuenta (requiere tarjeta), así que
# los PR se mergean sin que CI los verifique. Sin este script, "pasar CI" es una
# lista de comandos en la cabeza de alguien, y lo que se olvida es siempre lo
# mismo: el ciclo de migraciones y el build del frontend.
#
# Levanta su propio Postgres en un contenedor efímero y lo destruye al terminar,
# así que no toca la base de desarrollo.
#
# Cubre los seis trabajos del workflow: lint, migraciones, tests backend, tests
# ETL, frontend y build de imágenes.
#
# Uso:  make ci
#
# Diferencia conocida con GitHub Actions: allí `alembic check` es informativo
# (`continue-on-error`) por la deriva modelos↔migraciones pendiente de F4. Aquí
# también se informa sin bloquear, por la misma razón.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

CONTENEDOR="tordo-ci-local"
PUERTO="${CI_LOCAL_PG_PORT:-55432}"
export DATABASE_URL="postgresql://postgres:postgres@localhost:${PUERTO}/tordo_test"
export SECRET_KEY="ci-secret"

rojo=$'\e[31m'; verde=$'\e[32m'; azul=$'\e[36m'; gris=$'\e[90m'; fin=$'\e[0m'
FALLOS=()

paso() { printf "\n%s── %s %s\n" "$azul" "$1" "$fin"; }
ok()   { printf "%s   ✓ %s%s\n" "$verde" "$1" "$fin"; }
malo() { printf "%s   ✗ %s%s\n" "$rojo" "$1" "$fin"; FALLOS+=("$1"); }

# `|| malo` en vez de `set -e`: interesa el informe completo, no el primer fallo.
correr() {
  local nombre="$1"; shift
  if "$@" >/tmp/ci-local.log 2>&1; then
    ok "$nombre"
  else
    malo "$nombre"
    sed 's/^/     /' /tmp/ci-local.log | tail -25
  fi
}

limpiar() { docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true; }
trap limpiar EXIT

# `docker rm -f` devuelve antes de que el nombre quede libre, y el `docker run`
# siguiente fallaba con "name already in use". Una carrera que aparecía sólo al
# encadenar dos corridas.
esperar_nombre_libre() {
  for _ in $(seq 1 30); do
    docker container inspect "$CONTENEDOR" >/dev/null 2>&1 || return 0
    sleep 1
  done
  printf "%sEl contenedor %s no terminó de eliminarse%s\n" "$rojo" "$CONTENEDOR" "$fin"
  exit 1
}

# ── Postgres efímero ─────────────────────────────────────────────────────────
paso "Levantando Postgres de test (puerto $PUERTO)"
limpiar
esperar_nombre_libre
# Sin `|| exit` el fallo de docker se perdía y el mensaje era "Postgres no
# arrancó", que no dice nada de la causa real.
docker run -d --name "$CONTENEDOR" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tordo_test \
  -p "${PUERTO}:5432" postgres:15-alpine >/dev/null || {
    printf "%sNo se pudo crear el contenedor de Postgres (ver el error de docker arriba)%s\n" \
      "$rojo" "$fin"
    exit 1
  }

for _ in $(seq 1 40); do
  docker exec "$CONTENEDOR" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTENEDOR" pg_isready -U postgres >/dev/null 2>&1 \
  || { printf "%sPostgres no arrancó%s\n" "$rojo" "$fin"; exit 1; }
ok "Postgres listo"

# ── 🔍 Lint ──────────────────────────────────────────────────────────────────
paso "🔍 Lint"
correr "uv.lock sincronizado" uv lock --check
correr "ruff check"           uv run ruff check backend/app backend/tests etl
correr "ruff format --check"  uv run ruff format --check backend/app backend/tests etl

# ── 🗃️ Migraciones ───────────────────────────────────────────────────────────
paso "🗃️ Migraciones"
cabezas=$(cd backend && uv run --project .. alembic heads 2>/dev/null | grep -c '(head)' || true)
if [ "$cabezas" -eq 1 ]; then
  ok "Una sola cabeza de Alembic"
else
  malo "Se esperaba 1 cabeza de Alembic, hay $cabezas — cadena de down_revision rota"
fi

# El ciclo completo, no sólo la ida: `upgrade -> downgrade` pasa aunque el
# downgrade deje basura (ENUM huérfanos, secuencias); el segundo upgrade la
# destapa. Ya ocurrió con la migración 001.
correr "Ciclo upgrade → downgrade → upgrade" bash -c \
  'cd backend && uv run --project .. alembic upgrade head \
   && uv run --project .. alembic downgrade base \
   && uv run --project .. alembic upgrade head'

# BLOQUEANTE desde la migración da5fb1e45066: los modelos y las migraciones ya
# no divergen, así que un fallo aquí significa que alguien cambió un modelo sin
# su migración.
correr "Sin deriva entre modelos y migraciones" bash -c \
  'cd backend && uv run --project .. alembic check'

# ── 🧪 Tests ─────────────────────────────────────────────────────────────────
paso "🧪 Tests backend"
correr "pytest backend" bash -c 'cd backend && uv run --project .. pytest -q'

paso "🧪 Tests ETL"
correr "pytest etl" bash -c 'cd etl && uv run --project .. pytest -q'

# ── 🎨 Frontend ──────────────────────────────────────────────────────────────
paso "🎨 Frontend"
if [ -d frontend/node_modules ]; then
  correr "npm run lint"  bash -c 'cd frontend && npm run lint'
  correr "npm test"      bash -c 'cd frontend && npm test -- --run'
  correr "npm run build" bash -c 'cd frontend && npm run build'
else
  malo "frontend/node_modules no existe — corre 'cd frontend && npm ci'"
fi

# ── 🐳 Imágenes ──────────────────────────────────────────────────────────────
# El contexto es la raíz del repo: pyproject.toml y uv.lock viven ahí.
# Se puede saltar con SIN_DOCKER=1 cuando el PR no toca los Dockerfile.
paso "🐳 Build de imágenes"
if [ "${SIN_DOCKER:-0}" = "1" ]; then
  printf "%s   · saltado (SIN_DOCKER=1)%s\n" "$gris" "$fin"
else
  correr "Build backend" docker build -f backend/Dockerfile -t tordo-backend:ci-local .
  correr "Build ETL"     docker build -f etl/Dockerfile     -t tordo-etl:ci-local .
fi

# ── Informe ──────────────────────────────────────────────────────────────────
printf "\n%s────────────────────────────────────────%s\n" "$azul" "$fin"
if [ ${#FALLOS[@]} -eq 0 ]; then
  printf "%s✓ Todo pasa. Equivale a CI en verde.%s\n" "$verde" "$fin"
  exit 0
fi
printf "%s✗ %d fallo(s):%s\n" "$rojo" "${#FALLOS[@]}" "$fin"
printf '   - %s\n' "${FALLOS[@]}"
exit 1

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
# Los tests distinguen CI de local: en local se saltan si falta la base o los
# datos de analytics; en CI eso es un error. Sin esta variable, `make ci` era más
# permisivo que el CI que dice reproducir — que es como el golden master llevaba
# tiempo sin correr en ninguna parte.
export CI="true"

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

# 90s y no 40: con varios contenedores compitiendo por CPU, Postgres tarda más
# en aceptar conexiones y el portón fallaba de forma intermitente. Un CI que a
# veces no arranca se termina ignorando.
#
# `-h 127.0.0.1` fuerza TCP, y eso es lo que quita el fallo intermitente: sin
# esa opción `pg_isready` va por socket unix, y durante la inicialización la
# imagen levanta un servidor TEMPORAL (`listen_addresses=''`) que SÍ atiende
# ahí. El bucle salía en esa ventana, el temporal se apagaba, y el check
# siguiente reportaba "no arrancó" con un log terminado en "ready for start up".
for _ in $(seq 1 90); do
  docker exec "$CONTENEDOR" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
if ! docker exec "$CONTENEDOR" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
  printf "%sPostgres no aceptó conexiones en 90s.%s\n" "$rojo" "$fin"
  # El estado va ANTES que el log: el log siempre termina en "ready for start
  # up" y no distingue "sigue arrancando, lento" de "lo mataron". Eso último
  # sale aquí, en OOMKilled y el código de salida.
  printf "     estado: %s\n" \
    "$(docker inspect -f 'status={{.State.Status}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' \
       "$CONTENEDOR" 2>&1)"
  docker logs "$CONTENEDOR" 2>&1 | tail -15 | sed 's/^/     /'
  exit 1
fi
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
# El golden master de BI necesita el esquema `analytics` materializado. El fixture
# vive en el repo (backend/tests/golden/fixture_analytics) justamente para que
# esto se pueda hacer en cualquier parte.
correr "Materializar analytics (fixture del golden)" bash -c \
  'cd etl && uv run --project .. python -m analytics.materialize \
     --data-dir ../backend/tests/golden/fixture_analytics'

correr "pytest backend" bash -c 'cd backend && uv run --project .. pytest -q'

paso "🧪 Tests ETL"
correr "pytest etl" bash -c 'cd etl && uv run --project .. pytest -q'

# ── 🎨 Frontend ──────────────────────────────────────────────────────────────
paso "🎨 Frontend"
# El PR #67 llegó rojo porque un `package-lock.json` regenerado en macOS arm64
# omitía @emnapi/core y @emnapi/runtime — opcionales de un paquete que npm sólo
# resuelve en linux x64 — y `npm ci` fallaba en el runner con "Missing ... from
# lock file". Nada de este script corría `npm ci`: sólo miraba si
# `frontend/node_modules` ya existía y de ahí en más confiaba en lo que
# hubiera instalado, así que esa clase de fallo era invisible aquí.
#
# Correr `npm ci` (con o sin `--dry-run`) EN ESTE HOST no lo detecta: en
# macOS esos paquetes están correctamente ausentes, así que la resolución
# local nunca ve el hueco — es la misma razón por la que el bug pasó
# desapercibido. Lo único que reproduce el fallo es resolver en la MISMA
# plataforma que el runner (`actions/setup-node`, node 20, ubuntu-latest =
# linux x64), así que esto corre dentro de un contenedor `--platform
# linux/amd64`.
#
# Sólo se montan los dos manifiestos, de sólo lectura: `node_modules` se
# instala dentro de la capa efímera del contenedor (se descarta con --rm),
# nunca en el árbol del host, así que esto no puede dejar archivos de root
# sobre `frontend/node_modules`. La caché de descargas de npm vive en un
# volumen aparte (`tordo-ci-npm-cache`, Docker lo crea solo la primera vez)
# para que las corridas siguientes no vuelvan a bajar ~700 paquetes de cero:
# medido en ~30s en frío y ~25s en caliente, así que corre siempre.
#
# Qué NO cubre: nada de lint/test/build corre dentro del contenedor — eso lo
# siguen haciendo los pasos de abajo, contra lo que tenga instalado el host.
# Esto sólo prueba que package.json y package-lock.json están sincronizados
# para la plataforma en la que corre CI.
correr "npm ci en linux/amd64 (contenedor)" bash -c '
  docker run --rm --platform linux/amd64 \
    -v "$PWD/frontend/package.json:/app/package.json:ro" \
    -v "$PWD/frontend/package-lock.json:/app/package-lock.json:ro" \
    -v tordo-ci-npm-cache:/root/.npm \
    -w /app node:20 npm ci
'
if [ -d frontend/node_modules ]; then
  correr "npm run lint"  bash -c 'cd frontend && npm run lint'
  correr "npm test"      bash -c 'cd frontend && npm test -- --run'
  # Con un centinela en PROXY_SECRETO, que luego se busca en el bundle.
  correr "npm run build" bash -c 'cd frontend && PROXY_SECRETO=centinela-proxy-secreto-no-debe-llegar-al-navegador REVALIDAR_SECRETO=centinela-revalidar-secreto-no-debe-llegar DONAR_TRANSFERENCIA=centinela-datos-de-transferencia-no-van-en-el-html npm run build'
  correr "secreto fuera del bundle" bash -c 'cd frontend && PROXY_SECRETO=centinela-proxy-secreto-no-debe-llegar-al-navegador REVALIDAR_SECRETO=centinela-revalidar-secreto-no-debe-llegar DONAR_TRANSFERENCIA=centinela-datos-de-transferencia-no-van-en-el-html npm run check:secreto'
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
  # Construir no basta: la imagen del ETL construía bien y ningún cron arrancaba
  # (`No module named 'app'`). Se importa lo que corren los dos cron.
  correr "Cron importable en la imagen" docker run --rm tordo-etl:ci-local \
    python -c "import etl.cron, etl.retencion, etl.analytics.materialize"
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

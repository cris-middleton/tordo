#!/usr/bin/env bash
#
# Tests de extremo a extremo con Playwright.
#
# Levanta la pila completa contra su propia base efímera —Postgres, migraciones,
# semilla y backend— y deja que Playwright arranque el frontend. Nada de esto
# toca la base de desarrollo ni el stack de `make dev-up-d`: los puertos son
# distintos a propósito, para poder correrlo con el entorno de trabajo levantado.
#
# Uso:  make e2e            (todo)
#       make e2e ARGS="--ui"  (modo interactivo de Playwright)

set -euo pipefail
# Control de trabajos: cada proceso en segundo plano recibe su PROPIO grupo, y
# así `kill -- -PID` alcanza también a sus hijos. Sin esto el trap mataba la
# subshell y dejaba vivos `next start` y `uvicorn`, que a la corrida siguiente
# ocupaban el puerto — y el error que salía era "connection refused", que no
# apunta a nada.
set -m

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

# Un contenedor y unos puertos POR WORKTREE, como `make ci`: con un nombre y
# unos puertos fijos, dos worktrees corriendo `make e2e` a la vez se borraban el
# Postgres el uno al otro, y el segundo backend no podía escuchar en el puerto.
# Los puertos los elige el sistema salvo que se fijen con E2E_PUERTO_*.
NOMBRE_WORKTREE="$(basename "$RAIZ")"
CONTENEDOR="tordo-e2e-pg-${NOMBRE_WORKTREE//[^A-Za-z0-9_.-]/-}"
puerto_libre() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
PUERTO_PG="${E2E_PUERTO_PG:-$(puerto_libre)}"
PUERTO_API="${E2E_PUERTO_API:-$(puerto_libre)}"
PUERTO_FRONT="${E2E_PUERTO_FRONT:-$(puerto_libre)}"
# Debe coincidir con la versión de @playwright/test del package.json: si se
# separan, el cliente y el navegador hablan protocolos distintos.
IMAGEN_PLAYWRIGHT="mcr.microsoft.com/playwright:v1.62.1-noble"
# De dónde sale el navegador: `nativo` | `contenedor` | `auto`.
#
# `auto` prueba a lanzarlo en el host y cae al contenedor si no puede. Hace falta
# porque `playwright install --with-deps` pide sudo, y en una máquina de trabajo
# no siempre se tiene. En CI, en cambio, el runner instala las librerías sin
# problema y bajar la imagen —2 GB desde mcr.microsoft.com— tardaba cuatro
# minutos y a veces terminaba en `connection reset by peer`. Ahí va `nativo`.
#
# Lo que cambia entre los dos caminos es SÓLO de dónde sale el binario: misma
# versión de Playwright, mismo Chromium, mismos tests, misma pila.
NAVEGADOR="${E2E_NAVEGADOR:-auto}"

export DATABASE_URL="postgresql://postgres:postgres@localhost:${PUERTO_PG}/tordo_test"
export API_URL="http://localhost:${PUERTO_API}"
# El límite por IP no es lo que se prueba aquí, y toda la batería sale de la
# misma IP: con el de producción (60/min) los tests fallarían por velocidad.
# Lo que sí se ejercita es el camino de la cabecera secreta: el proxy de Next
# la manda y el backend la valida, como en producción.
export LIMITE_POR_MINUTO=100000
# Las páginas públicas y el BI leen el esquema `analytics`: sin esto todo /bi y
# /publico responden 503 y los E2E de las páginas públicas no tienen qué recorrer.
export FEATURE_ANALYTICS=true
export PROXY_SECRETO="e2e-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
# El de `/api/revalidar`, igual: aleatorio en cada corrida. Lo lee el servidor de
# Next y también `e2e/revalidacion.spec.ts`, que comprueba el contrato y que
# revalidar marca la caché.
export REVALIDAR_SECRETO="e2e-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

azul=$'\e[36m'; rojo=$'\e[31m'; fin=$'\e[0m'
paso() { printf "\n%s── %s %s\n" "$azul" "$1" "$fin"; }

PID_API=""
limpiar() {
  [ -n "$PID_API" ] && kill -- -"$PID_API" 2>/dev/null || true
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
}
trap limpiar EXIT

# `pg_isready -h 127.0.0.1` fuerza TCP DENTRO del contenedor. Las otras dos
# formas evidentes dan falsos positivos, y las dos se midieron:
#
#  - `pg_isready` por socket unix (sin -h): durante la inicializacion la imagen
#    levanta un servidor TEMPORAL con `listen_addresses=''` para aplicar los
#    scripts de arranque, y ese SI atiende por socket. El bucle salia ahi, justo
#    antes de que el temporal se apagara, y el check siguiente caia en la
#    ventana: "no arranco" con un log que terminaba en "ready for start up".
#  - Abrir el puerto publicado desde el host: el proxy de Docker acepta la
#    conexion **al segundo 1**, cuando postgres todavia no existe.
#
# El servidor temporal no escucha en red, asi que por TCP no hay ambiguedad.
esperar_postgres() {
  local intentos="$1"
  for _ in $(seq 1 "$intentos"); do
    docker exec "$CONTENEDOR" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

paso "Postgres efímero (puerto $PUERTO_PG)"
limpiar
# `docker rm -f` devuelve antes de que el nombre quede libre, y el `docker run`
# siguiente falla con "name already in use". Misma carrera que en ci-local.sh.
for _ in $(seq 1 30); do
  docker container inspect "$CONTENEDOR" >/dev/null 2>&1 || break
  sleep 1
done
docker run -d --name "$CONTENEDOR" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tordo_test \
  -p "${PUERTO_PG}:5432" postgres:15-alpine >/dev/null
esperar_postgres 90 || {
  printf "%sPostgres no arrancó%s\n" "$rojo" "$fin"
  docker inspect -f 'status={{.State.Status}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$CONTENEDOR"
  printf "     error de pg_isready: "
  docker exec "$CONTENEDOR" pg_isready -U postgres 2>&1 | tail -2 | sed 's/^/     /'
  docker logs "$CONTENEDOR" 2>&1 | tail -8 | sed 's/^/     /'
  exit 1
}

paso "Migraciones y semilla"
(cd backend && uv run --project .. alembic upgrade head >/dev/null)
(cd backend && uv run --project .. python scripts/sembrar_e2e.py)
# El fixture del golden master (versionado, con productos sintéticos): da a las
# páginas públicas compradores, rubros y productos que recorrer.
(cd etl && uv run --project .. python -m analytics.materialize \
   --data-dir ../backend/tests/golden/fixture_analytics >/dev/null)

paso "Backend en el puerto $PUERTO_API"
# `--host 0.0.0.0` y no el 127.0.0.1 por defecto de uvicorn: quien llama al
# backend es el servidor de Next, que corre DENTRO del contenedor de Playwright
# y lo alcanza por `host.docker.internal`. Con el bind por defecto la conexion
# se rechaza, el login devuelve 200 sin cookie y el test falla en el
# `waitForURL` sin decir nada del motivo.
LOG_API="$(mktemp)"
(cd backend && uv run --project .. uvicorn app.main:app \
   --host 0.0.0.0 --port "$PUERTO_API" --log-level warning --no-proxy-headers >"$LOG_API" 2>&1) &
PID_API=$!
for _ in $(seq 1 60); do
  curl -sf "http://localhost:${PUERTO_API}/health/" >/dev/null 2>&1 && break
  # Si el proceso murió, no tiene sentido esperar los 60 segundos.
  kill -0 "$PID_API" 2>/dev/null || {
    printf "%sEl backend murió al arrancar. Su salida:%s\n" "$rojo" "$fin"
    sed 's/^/     /' "$LOG_API" | tail -20
    exit 1
  }
  sleep 1
done
curl -sf "http://localhost:${PUERTO_API}/health/" >/dev/null || {
  printf "%sEl backend no respondió en 60s. Su salida:%s\n" "$rojo" "$fin"
  sed 's/^/     /' "$LOG_API" | tail -20
  exit 1
}

paso "Build del frontend"
# Se limpia `.next` antes de construir: los estaticos se copian DENTRO de
# `.next/standalone` justo despues, y la compilacion siguiente arrancaba sobre
# ese arbol ya manipulado. Turbopack fallaba entonces evaluando postcss, con un
# error que no menciona ninguna de las dos cosas.
find frontend/.next -mindepth 1 -delete 2>/dev/null || true
(cd frontend && npm run build >/dev/null)
# El standalone no se lleva los estaticos consigo: hay que copiarlos al lado,
# igual que hace el Dockerfile.
cp -R frontend/public frontend/.next/standalone/ 2>/dev/null || true
mkdir -p frontend/.next/standalone/.next
cp -R frontend/.next/static frontend/.next/standalone/.next/ 2>/dev/null || true

# ¿Se puede lanzar el navegador aquí mismo? Un `--version` no sirve: lo que
# falta en una máquina sin `--with-deps` son librerías del sistema, y eso sólo
# se ve al arrancar el proceso de verdad.
navegador_nativo_funciona() {
  (cd frontend && node -e "
    require('@playwright/test').chromium.launch()
      .then((b) => b.close())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  ") >/dev/null 2>&1
}

if [ "$NAVEGADOR" = auto ]; then
  if navegador_nativo_funciona; then NAVEGADOR=nativo; else NAVEGADOR=contenedor; fi
fi

paso "Playwright ($NAVEGADOR)"
# En contenedor y no con el navegador del host: `playwright install --with-deps`
# necesita sudo, y ademas fija la MISMA version de navegador en local y en CI.
#
# El SERVIDOR DE NEXT arranca dentro de este mismo contenedor (`webServer` de
# playwright.config.ts). Es lo que hace que el navegador lo vea en
# `http://localhost`, el unico origen sin TLS que trata como de confianza — y
# las cookies de sesion son `Secure`, asi que en cualquier otro las descarta.
#
# El BACKEND si vive en el host, y por eso `--add-host`: con Docker Desktop la
# red del host es la de su VM, no la de WSL (medido: 000 con `--network host`,
# 200 con `host.docker.internal`). `host-gateway` funciona igual en Docker
# nativo, asi que el camino es uno solo.
if [ "$NAVEGADOR" = nativo ]; then
  # El servidor de Next lo arranca `webServer` de playwright.config.ts, igual
  # que en el contenedor. El navegador lo ve en `http://localhost`, que es el
  # único origen sin TLS que trata como de confianza — y las cookies de sesión
  # son `Secure`.
  (cd frontend && API_URL="http://localhost:${PUERTO_API}" \
     E2E_PUERTO_FRONT="$PUERTO_FRONT" npx playwright test ${ARGS:-})
else
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    --user "$(id -u):$(id -g)" \
    -v "${RAIZ}/frontend:/trabajo" -w /trabajo \
    -e HOME=/tmp -e CI="${CI:-}" -e E2E_PUERTO_FRONT="$PUERTO_FRONT" \
    -e API_URL="http://host.docker.internal:${PUERTO_API}" \
    -e PROXY_SECRETO="$PROXY_SECRETO" \
    -e REVALIDAR_SECRETO="$REVALIDAR_SECRETO" \
    "$IMAGEN_PLAYWRIGHT" \
    npx playwright test ${ARGS:-}
fi

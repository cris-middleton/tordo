#!/usr/bin/env bash
#
# ¿Cabe la API en un contenedor de 512 MB?
#
# Por qué existe
# --------------
# La revisión de arquitectura anotó el riesgo así: «con `gunicorn -w 4`, cuatro
# copias de 60 MB + 71 MB. Un contenedor Railway de 512 MB–1 GB muere». Era una
# estimación, no una medición — y de una estimación no se puede decidir el plan
# de Railway que hay que pagar.
#
# Esto lo mide de verdad: levanta la imagen REAL con un límite de memoria REAL,
# le pega a los endpoints que cargan lo pesado, y reporta el pico. Si el kernel
# mata el contenedor, se ve como tal y no como un 502 misterioso.
#
# Uso:
#   make medir-memoria                     # 1, 2 y 4 workers
#   WORKERS=2 ./scripts/medir-memoria.sh   # un solo escenario
#   LIMITE=256m WORKERS=1 ./scripts/medir-memoria.sh
#   ANALYTICS_DIR=~/…/tordo/etl/data/analytics make medir-memoria
#
# **Sin `ANALYTICS_DIR` la medición se queda corta**: las tablas de analytics van
# vacías, y el índice en memoria de las páginas públicas (`services/publico`,
# miles de slugs) no se construye. Con él, se materializan esos parquets en el
# Postgres de la medición (efímero) y se mide con el BI encendido.
#
# Hasta el paso 8 del pivote público había también escenarios «con TF-IDF»: la
# API cargaba el modelo del ETL (~165 MB por proceso). Ya no lo carga, así que no
# hay nada que montar ni que comparar.

set -euo pipefail
set -m

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

RED="tordo-medicion"
PG="tordo-medicion-pg"
API="tordo-medicion-api"
IMAGEN="tordo-backend:medicion"
PUERTO="${MEDICION_PUERTO:-8310}"
LIMITE="${LIMITE:-512m}"

azul=$'\e[36m'; rojo=$'\e[31m'; verde=$'\e[32m'; gris=$'\e[90m'; fin=$'\e[0m'
paso() { printf "\n%s── %s %s\n" "$azul" "$1" "$fin"; }

limpiar() {
  docker rm -f "$API" "$PG" >/dev/null 2>&1 || true
  docker network rm "$RED" >/dev/null 2>&1 || true
}
trap limpiar EXIT

# ── Preparación ──────────────────────────────────────────────────────────────

paso "Imagen de la API"
docker build -q -f backend/Dockerfile -t "$IMAGEN" . >/dev/null
printf "   %s\n" "$IMAGEN"

paso "Postgres"
limpiar
docker network create "$RED" >/dev/null
docker run -d --name "$PG" --network "$RED" -p "${MEDICION_PG_PUERTO:-8311}:5432" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tordo_test \
  postgres:15-alpine >/dev/null
# `-h 127.0.0.1` fuerza TCP: por socket unix, `pg_isready` acierta durante la
# inicialización, cuando la imagen levanta un servidor temporal que se apaga
# justo después.
for _ in $(seq 1 90); do
  docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done

if [ -n "${ANALYTICS_DIR:-}" ]; then
  paso "Analytics de $ANALYTICS_DIR"
  URL_PG="postgresql://postgres:postgres@localhost:${MEDICION_PG_PUERTO:-8311}/tordo_test"
  (cd backend && DATABASE_URL="$URL_PG" uv run --project .. alembic upgrade head >/dev/null)
  (cd etl && DATABASE_URL="$URL_PG" uv run --project .. python -m analytics.materialize \
    --data-dir "$ANALYTICS_DIR" 2>&1 | tail -1 | sed 's/^/   /')
fi

# ── Un escenario ─────────────────────────────────────────────────────────────

# Endpoints que representan el peor caso de memoria: el listado ordenado por
# relevancia (antes cargaba el TF-IDF; ahora es `ts_rank_cd` en Postgres) y los de
# BI, que tocan las tablas de analytics. Los de la pantalla /mercado NO están
# aquí sino en `medir()` (la variable `MERCADO`), porque necesitan un rubro con
# datos, que sólo se conoce con la API ya arriba.
#
# Son anónimos desde el pivote público. Antes exigían sesión, y una ruta que
# responde 401 sin hacer nada mide el proceso en reposo creyendo que mide la
# carga — que es lo que pasó la primera vez. Por eso abajo se comprueba que el
# catálogo responda 200 antes de medir.
CAMINOS=(
  "/api/v1/tenders/?limit=20"
  "/api/v1/tenders/?limit=20&search=servicio&sort_by=relevance"
  "/api/v1/bi/rubros"
  # Las páginas públicas (paso 10): el sitemap construye el índice en memoria de
  # compradores, rubros y productos; la búsqueda lo recorre.
  "/api/v1/publico/sitemap"
  "/api/v1/publico/productos?q=guante&limite=20"
  "/api/v1/compra-agil/destacadas"
)

medir() {
  local workers="$1"
  docker rm -f "$API" >/dev/null 2>&1 || true

  # Sin límite por IP: son 120 peticiones desde la misma IP en segundos, y un
  # 429 no carga nada — mediría el proceso en reposo.
  docker run -d --name "$API" --network "$RED" \
    --memory="$LIMITE" --memory-swap="$LIMITE" \
    -p "${PUERTO}:8000" \
    -e DATABASE_URL="postgresql://postgres:postgres@${PG}:5432/tordo_test" \
    -e LIMITE_POR_MINUTO=1000000 \
    -e FEATURE_ANALYTICS=true \
    "$IMAGEN" \
    sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${workers}" \
    >/dev/null

  local arriba=no
  for _ in $(seq 1 120); do
    curl -sf "http://localhost:${PUERTO}/health/" >/dev/null 2>&1 && { arriba=si; break; }
    docker inspect -f '{{.State.Running}}' "$API" 2>/dev/null | grep -q true || break
    sleep 1
  done
  if [ "$arriba" != si ]; then
    printf "%s   w=%s → NO ARRANCÓ (%s)%s\n" "$rojo" "$workers" \
      "$(docker inspect -f 'oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$API" 2>&1)" "$fin"
    docker logs "$API" 2>&1 | tail -6 | sed 's/^/       /'
    return 1
  fi

  # Los datos de prueba los pone el mismo sembrador que usa el E2E.
  docker exec "$API" python scripts/sembrar_e2e.py >/dev/null 2>&1 || true
  if ! curl -sf -o /dev/null "http://localhost:${PUERTO}${CAMINOS[0]}"; then
    printf "%s   w=%s → el catálogo no responde: la medición no valdría nada%s\n" \
      "$rojo" "$workers" "$fin"
    return 1
  fi

  # Reposo: lo que ocupa recién arrancado, antes de servir nada pesado.
  local reposo
  reposo="$(docker stats --no-stream --format '{{.MemUsage}}' "$API" | awk '{print $1}')"

  # La primera visita de /mercado (spec del rediseño §8.2). Hasta el 2026-10-14
  # esta medición no pedía ninguno de estos endpoints salvo /bi/rubros, y los
  # pedía en serie: la API de producción moría por OOM con lo que el navegador
  # pide A LA VEZ al abrir la pantalla, y aquí salía «171 MB de pico».
  local rubro
  rubro="$(curl -sf "http://localhost:${PUERTO}/api/v1/bi/rubros?limit=1" \
    | python3 -I -c 'import json, sys, urllib.parse
d = json.load(sys.stdin)
print(urllib.parse.quote((d.get("rubros") or [""])[0]))' 2>/dev/null || true)"
  local MERCADO=(
    "/api/v1/bi/rubros?limit=354"
    "/api/v1/bi/oportunidades?min_score=4&limit=50"
    "/api/v1/bi/tendencia?limit=15"
    "/api/v1/bi/sector?limit=6"
  )
  if [ -n "$rubro" ]; then
    MERCADO+=(
      "/api/v1/bi/panorama?rubro=${rubro}"
      "/api/v1/bi/resumen?rubro=${rubro}"
      "/api/v1/bi/oportunidades?rubro=${rubro}&min_score=4&limit=50"
      "/api/v1/bi/tendencia?rubro=${rubro}&limit=15"
    )
  fi
  for ruta in "${MERCADO[@]}"; do
    curl -sf -o /dev/null --max-time 30 "http://localhost:${PUERTO}${ruta}" &
  done
  wait

  # Varias vueltas para que CADA worker sirva algo: con una sola pasada se
  # mide un solo proceso.
  for _ in $(seq 1 40); do
    for ruta in "${CAMINOS[@]}" "${MERCADO[@]}"; do
      curl -sf -o /dev/null --max-time 20 "http://localhost:${PUERTO}${ruta}" || true
    done
  done

  local pico
  pico="$(docker stats --no-stream --format '{{.MemUsage}}' "$API" | awk '{print $1}')"

  local estado="ok"
  docker inspect -f '{{.State.OOMKilled}}' "$API" | grep -q true && estado="OOM"
  docker inspect -f '{{.State.Running}}' "$API" | grep -q true || estado="MURIÓ"

  if [ "$estado" != ok ]; then
    printf "%s   %s%s\n" "$gris" \
      "$(docker inspect -f 'oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$API" 2>&1)" "$fin"
  fi

  printf "   w=%-2s reposo=%-9s pico=%-9s %s\n" \
    "$workers" "$reposo" "$pico" \
    "$([ "$estado" = ok ] && printf "%s✓%s" "$verde" "$fin" || printf "%s%s%s" "$rojo" "$estado" "$fin")"
  [ "$estado" = ok ]
}

# ── Escenarios ───────────────────────────────────────────────────────────────

paso "Límite del contenedor: $LIMITE"

if [ -n "${WORKERS:-}" ]; then
  medir "$WORKERS"
else
  fallos=0
  medir 1 || fallos=$((fallos + 1))
  medir 2 || fallos=$((fallos + 1))
  medir 4 || fallos=$((fallos + 1))
  printf "\n%sReposo = recién arrancado. Pico = tras la ráfaga de /mercado y 40 vueltas a todos los endpoints.%s\n" \
    "$gris" "$fin"
  [ "$fallos" -eq 0 ] || printf "%s%d escenario(s) no caben en %s.%s\n" "$rojo" "$fallos" "$LIMITE" "$fin"
fi

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
#   make medir-memoria                 # 1 y 4 workers, con y sin TF-IDF
#   WORKERS=4 TFIDF=true ./scripts/medir-memoria.sh   # un solo escenario
#
# El modelo TF-IDF se monta desde `etl/data/analytics`. Sin esos artefactos el
# escenario con TF-IDF mide lo mismo que el de sin, así que el script avisa.

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
# Dónde están los artefactos del modelo. Los worktrees no heredan `etl/data/`,
# así que por defecto se toman del checkout principal.
ARTEFACTOS="${ARTEFACTOS:-$RAIZ/etl/data/analytics}"

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
docker run -d --name "$PG" --network "$RED" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tordo_test \
  postgres:15-alpine >/dev/null
# `-h 127.0.0.1` fuerza TCP: por socket unix, `pg_isready` acierta durante la
# inicialización, cuando la imagen levanta un servidor temporal que se apaga
# justo después.
for _ in $(seq 1 90); do
  docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done

if [ ! -f "$ARTEFACTOS/tfidf_model.joblib" ]; then
  printf "%s   Sin artefactos TF-IDF en %s — los escenarios con TF-IDF no medirán el modelo.%s\n" \
    "$rojo" "$ARTEFACTOS" "$fin"
fi

# ── Un escenario ─────────────────────────────────────────────────────────────

# Endpoints que representan el peor caso de memoria: el listado carga el modelo
# TF-IDF al ordenar por relevancia, y los de BI tocan las tablas de analytics.
#
# TODOS exigen sesión. Sin token devuelven 401 sin hacer nada, y entonces esto
# mide el proceso en reposo creyendo que mide la carga — que es exactamente lo
# que pasó la primera vez: los números con y sin TF-IDF salían idénticos.
CAMINOS=(
  "/api/tenders/?limit=20"
  "/api/tenders/?limit=20&search=servicio&sort_by=relevance"
  "/api/billing/plans"
  "/api/auth/me"
)

medir() {
  local workers="$1" tfidf="$2"
  docker rm -f "$API" >/dev/null 2>&1 || true

  local montaje=()
  [ -d "$ARTEFACTOS" ] && montaje=(-v "$ARTEFACTOS:/app/etl/data/analytics:ro")

  docker run -d --name "$API" --network "$RED" \
    --memory="$LIMITE" --memory-swap="$LIMITE" \
    -p "${PUERTO}:8000" \
    -e DATABASE_URL="postgresql://postgres:postgres@${PG}:5432/tordo_test" \
    -e SECRET_KEY=medicion \
    -e REDIS_URL="redis://localhost:6399/0" \
    -e FEATURE_TFIDF="$tfidf" \
    -e ANALYTICS_DATA_PATH="/app/etl/data/analytics" \
    "${montaje[@]}" \
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
    printf "%s   w=%s tfidf=%s → NO ARRANCÓ (%s)%s\n" "$rojo" "$workers" "$tfidf" \
      "$(docker inspect -f 'oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$API" 2>&1)" "$fin"
    docker logs "$API" 2>&1 | tail -6 | sed 's/^/       /'
    return 1
  fi

  # Sesión: los datos de prueba y el usuario los pone el mismo sembrador que usa
  # el E2E, así que no hay un segundo juego de credenciales que mantener.
  docker exec "$API" python scripts/sembrar_e2e.py >/dev/null 2>&1 || true
  local token
  token="$(curl -s -X POST "http://localhost:${PUERTO}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"e2e","password":"contrasena-de-prueba-e2e"}' \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
  if [ -z "$token" ]; then
    printf "%s   w=%s tfidf=%s → sin sesión: la medición no valdría nada%s\n" \
      "$rojo" "$workers" "$tfidf" "$fin"
    return 1
  fi

  # Reposo: lo que ocupa recién arrancado, antes de servir nada pesado.
  local reposo
  reposo="$(docker stats --no-stream --format '{{.MemUsage}}' "$API" | awk '{print $1}')"

  # Varias vueltas para forzar la carga perezosa del modelo en CADA worker: es
  # el punto del ejercicio, y con una sola pasada se mide un solo proceso.
  for _ in $(seq 1 40); do
    for ruta in "${CAMINOS[@]}"; do
      curl -sf -o /dev/null --max-time 20 -H "Authorization: Bearer $token" \
        "http://localhost:${PUERTO}${ruta}" || true
    done
  done

  local pico
  pico="$(docker stats --no-stream --format '{{.MemUsage}}' "$API" | awk '{print $1}')"

  local estado="ok"
  docker inspect -f '{{.State.OOMKilled}}' "$API" | grep -q true && estado="OOM"
  docker inspect -f '{{.State.Running}}' "$API" | grep -q true || estado="MURIÓ"

  # Cuántos procesos llegaron a cargar el modelo. Es el dato que da sentido a la
  # comparación: si sale 0 con tfidf=true, el escenario no midió lo que dice.
  local cargas
  cargas="$(docker logs "$API" 2>&1 | grep -c 'TF-IDF model loaded' || true)"

  printf "   w=%-2s tfidf=%-5s reposo=%-9s pico=%-9s cargas=%-2s %s\n" \
    "$workers" "$tfidf" "$reposo" "$pico" "$cargas" \
    "$([ "$estado" = ok ] && printf "%s✓%s" "$verde" "$fin" || printf "%s%s%s" "$rojo" "$estado" "$fin")"

  if [ "$tfidf" = true ] && [ "$cargas" -eq 0 ]; then
    printf "%s      el modelo NO se cargó — este número no mide lo que dice%s\n" "$rojo" "$fin"
  fi
  [ "$estado" = ok ]
}

# ── Escenarios ───────────────────────────────────────────────────────────────

paso "Límite del contenedor: $LIMITE"

if [ -n "${WORKERS:-}" ]; then
  medir "$WORKERS" "${TFIDF:-false}"
else
  fallos=0
  medir 1 false || fallos=$((fallos + 1))
  medir 1 true  || fallos=$((fallos + 1))
  medir 4 false || fallos=$((fallos + 1))
  medir 4 true  || fallos=$((fallos + 1))
  printf "\n%sReposo = recién arrancado. Pico = tras 40 vueltas a %d endpoints autenticados.%s\n" \
    "$gris" "${#CAMINOS[@]}" "$fin"
  [ "$fallos" -eq 0 ] || printf "%s%d escenario(s) no caben en %s.%s\n" "$rojo" "$fallos" "$LIMITE" "$fin"
fi

#!/usr/bin/env bash
# Prueba de humo de producción, de SÓLO LECTURA. Se corre después de desplegar.
#
#   scripts/verificar-produccion.sh https://tordo.cl https://api.tordo.cl
#
# Una línea ✓/✗ por comprobación y, al final, cuántas fallaron (es también el
# código de salida). No recibe ni necesita ningún secreto: lo que se comprueba es
# justamente lo que ve un visitante o un integrador anónimo. Las peticiones a la
# API cuentan contra el límite por IP (LIMITE_POR_MINUTO, 60 por minuto): una
# corrida cabe, pero no la repitas en bucle.
#
# Lo que NO puede comprobar desde fuera está en docs/DESPLIEGUE.md: que los cron
# corrieron (Healthchecks), los avisos de arranque de la API (log de Railway) y el
# tamaño de Postgres.
set -uo pipefail

if [ $# -ne 2 ]; then
  echo "Uso: $0 <url-del-sitio> <url-de-la-api>" >&2
  echo "     $0 https://tordo.cl https://api.tordo.cl" >&2
  exit 2
fi
for herramienta in curl python3; do
  command -v "$herramienta" >/dev/null 2>&1 || { echo "Falta $herramienta." >&2; exit 2; }
done

SITIO=${1%/}
API=${2%/}
FALLOS=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
mal() { printf '  \033[31m✗\033[0m %s\n' "$*"; FALLOS=$((FALLOS + 1)); }
seccion() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# pedir URL [curl args…] → deja el cuerpo en $TMP/cuerpo y las cabeceras en
# $TMP/cabeceras; imprime el código HTTP (000 si no hubo respuesta).
pedir() {
  local url=$1
  shift
  curl -sS -o "$TMP/cuerpo" -D "$TMP/cabeceras" -w '%{http_code}' --max-time 30 "$@" "$url" \
    2>"$TMP/error" || true
}

cabecera() { grep -i "^$1:" "$TMP/cabeceras" | tail -1 | cut -d: -f2- | tr -d ' \r'; }

xml_valido() {
  python3 -I -c 'import sys, xml.etree.ElementTree as ET; ET.parse(sys.argv[1])' "$TMP/cuerpo" \
    2>/dev/null
}

# ── API ──────────────────────────────────────────────────────────────────────
seccion "API ($API)"

codigo=$(pedir "$API/health/")
[ "$codigo" = 200 ] && ok "/health/ responde 200" || mal "/health/ responde $codigo"

codigo=$(pedir "$API/api/v1/publico/sitemap")
if [ "$codigo" = 200 ] && python3 -I - "$TMP/cuerpo" >"$TMP/muestras" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
listas = [d.get(k) or [] for k in ("compradores", "rubros", "productos")]
if not all(listas):
    sys.exit(1)
print(*(l[0] for l in listas))
PY
then
  read -r COMPRADOR RUBRO PRODUCTO <"$TMP/muestras"
  ok "/api/v1/publico/sitemap trae compradores, rubros y productos"
else
  mal "/api/v1/publico/sitemap ($codigo): vacío o sin alguna de las tres listas — ¿corrió la semanal? ¿FEATURE_ANALYTICS=true?"
  COMPRADOR="" RUBRO="" PRODUCTO=""
fi

codigo=$(pedir "$API/api/v1/compra-agil/destacadas")
if [ "$codigo" = 200 ]; then
  edad=$(python3 -I - "$TMP/cuerpo" <<'PY'
import json, sys
from datetime import datetime, timezone
d = json.load(open(sys.argv[1])).get("actualizado_en")
if not d:
    print("nunca")
else:
    t = datetime.fromisoformat(d.replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    print(round((datetime.now(timezone.utc) - t).total_seconds() / 3600, 1))
PY
)
  # El hueco más largo del horario de `frecuente` es de 24 h (sábado → domingo).
  if [ "$edad" != nunca ] && python3 -I -c "import sys; sys.exit(0 if float('$edad') <= 26 else 1)"; then
    ok "Compra Ágil actualizada hace ${edad} h"
  elif [ "$edad" = nunca ]; then
    mal "Compra Ágil: sin actualizado_en — cron-frecuente no ha corrido nunca"
  else
    mal "Compra Ágil: actualizada hace ${edad} h (más de 26 h) — ¿corre cron-frecuente?"
  fi
else
  mal "/api/v1/compra-agil/destacadas responde $codigo"
fi

# La tira de cifras de la portada: dos conteos enteros (spec del rediseño §6.6).
codigo=$(pedir "$API/api/v1/publico/portada")
if [ "$codigo" = 200 ] && python3 -I - "$TMP/cuerpo" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
claves = ("licitaciones_abiertas", "compra_agil_abiertas")
sys.exit(0 if all(isinstance(d.get(k), int) and d[k] >= 0 for k in claves) else 1)
PY
then
  ok "/api/v1/publico/portada trae los dos conteos de abiertas"
else
  mal "/api/v1/publico/portada ($codigo): sin los dos conteos"
fi

codigo=$(pedir "$API/api/v1/tenders/?limit=1")
if [ "$codigo" = 200 ] && [ -n "$(cabecera x-ratelimit-limit)" ] && [ -n "$(cabecera x-ratelimit-remaining)" ]; then
  ok "cabeceras X-RateLimit-* presentes (límite $(cabecera x-ratelimit-limit)/min)"
else
  mal "/api/v1/tenders/ ($codigo) sin cabeceras X-RateLimit-*"
fi

# CORS abierto (`CORS_ORIGINS=*`): la API es pública; un integrador la llama
# desde el navegador de su propia aplicación.
codigo=$(pedir "$API/health/" -H 'Origin: https://integrador.example')
if [ "$(cabecera access-control-allow-origin)" = "*" ]; then
  ok "CORS: un origen cualquiera recibe Access-Control-Allow-Origin: *"
else
  mal "CORS: un origen ajeno recibe «$(cabecera access-control-allow-origin)» — pon CORS_ORIGINS=* en la API"
fi

codigo=$(pedir "$API/api/v1/publico/compradores/codigo-que-no-existe-0000")
[ "$codigo" = 404 ] && ok "un comprador inventado da 404 en la API" || mal "un comprador inventado da $codigo en la API (se esperaba 404)"

# MCP: con el dominio fuera de MCP_HOSTS_PERMITIDOS responde 421 a todo.
codigo=$(pedir "$API/mcp/" -X POST \
  -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verificar-produccion","version":"0"}}}')
case $codigo in
  200) ok "MCP: initialize responde 200" ;;
  421) mal "MCP: 421 — el dominio de la API no está en MCP_HOSTS_PERMITIDOS" ;;
  *) mal "MCP: initialize responde $codigo" ;;
esac

# ── Ninguna redirección baja a http:// (rediseño 0d) ─────────────────────────
seccion "Redirecciones de la API: relativas, nunca a http://"

# Sólo se pide el redirect (rápido, antes del handler): `pedir` no los sigue.
for ruta in /health /api/v1/tenders /api/v1/bi/rubros/; do
  codigo=$(pedir "$API$ruta")
  destino=$(cabecera location)
  case $destino in
    http://*) mal "$ruta → $destino: baja a http" ;;
    /*) ok "$ruta → $codigo $destino" ;;
    *) mal "$ruta responde $codigo con Location «${destino}» (se esperaba una ruta relativa)" ;;
  esac
done

codigo=$(pedir "$API/mcp" -X POST \
  -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verificar-produccion","version":"0"}}}')
case $codigo in
  200) ok "MCP sin barra: initialize responde 200 sin redirigir" ;;
  421) mal "MCP sin barra: 421 — el dominio de la API no está en MCP_HOSTS_PERMITIDOS" ;;
  *) mal "MCP sin barra responde $codigo (se esperaba 200, sin 307)" ;;
esac

# ── /mercado no tumba la API (rediseño 0b) ───────────────────────────────────
# Antes del 0b esto la MATABA por memoria: sólo correrlo con el arreglo desplegado.
seccion "/mercado: la primera visita responde y la API sigue viva"

# El código HTTP de /bi/rubros se imprime siempre: un 502 aquí ES el síntoma del
# OOM que esta sección existe para detectar, y «no devolvió ningún rubro» lo escondía.
codigo=$(pedir "$API/api/v1/bi/rubros?limit=1")
rubro=""
if [ "$codigo" = 200 ]; then
  # Un cuerpo que no es JSON deja `rubro` vacío (sin traza) y cae al mensaje de abajo.
  rubro=$(python3 -I -c '
import json, sys, urllib.parse
d = json.load(open(sys.argv[1]))
print(urllib.parse.quote((d.get("rubros") or [""])[0]))' "$TMP/cuerpo" 2>/dev/null)
fi
if [ "$codigo" != 200 ]; then
  mal "/api/v1/bi/rubros responde $codigo (se esperaba 200): 502/503 aquí suele ser OOM — mira «Killed» en el log de la API"
elif [ -z "$rubro" ]; then
  mal "/api/v1/bi/rubros responde 200 pero sin ningún rubro (o sin JSON): ¿corrió la semanal? ¿FEATURE_ANALYTICS=true?"
else
  for ruta in "bi/tendencia?rubro=$rubro&limit=15" "bi/oportunidades?min_score=4&limit=50"; do
    inicio=$(date +%s)
    codigo=$(pedir "$API/api/v1/$ruta")
    segundos=$(( $(date +%s) - inicio ))
    if [ "$codigo" = 200 ] && [ "$segundos" -lt 5 ]; then
      ok "/api/v1/${ruta%%\?*} responde 200 en ${segundos}s"
    else
      mal "/api/v1/${ruta%%\?*} responde $codigo en ${segundos}s (se esperaba 200 en < 5 s)"
    fi
  done
fi
# Se comprueba siempre, también si /bi/rubros falló: es lo que distingue «la
# consulta falló» de «la API se cayó».
codigo=$(pedir "$API/health/")
[ "$codigo" = 200 ] && ok "la API sigue viva tras /mercado" || mal "/health/ responde $codigo tras /mercado: ¿OOM? mira «Killed» en el log"

# ── Los ejemplos de la portada encuentran algo (rediseño 6) ──────────────────
# Copia LITERAL de EJEMPLOS_BUSQUEDA (frontend/lib/buscar.ts), en su orden:
# frontend/__tests__/portada-ayudantes.test.ts falla si se separan. Seis GET,
# uno por ejemplo y con un segundo entre cada uno: nunca un bucle contra
# producción. Un ejemplo sin productos indexables deja a quien lo pulsa ante una
# búsqueda vacía: se cambia (verificado antes contra producción) en los dos sitios.
seccion "Ejemplos de la portada: cada uno encuentra un producto indexable"

ejemplo() {
  local termino=$1 q codigo
  q=$(python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$termino")
  codigo=$(pedir "$API/api/v1/publico/productos?q=$q")
  # `2>/dev/null`: un 200 con un cuerpo que no es JSON saldría con una traza de
  # Python; aquí sólo importa el código de salida, y el ✗ de abajo lo dice en una línea.
  if [ "$codigo" = 200 ] && python3 -I - "$TMP/cuerpo" 2>/dev/null <<'PY'
import json, sys
productos = json.load(open(sys.argv[1]))
sys.exit(0 if isinstance(productos, list) and any(p.get("indexable") for p in productos) else 1)
PY
  then
    ok "«${termino}» encuentra productos indexables"
  else
    mal "«${termino}» ($codigo): ningún producto indexable — cambia el ejemplo en frontend/lib/buscar.ts y aquí"
  fi
  sleep 1
}

ejemplo 'guantes de nitrilo'
ejemplo 'papel higiénico'
ejemplo 'jabón líquido'
ejemplo 'tóner'
ejemplo 'resma de papel carta'
ejemplo 'agua purificada en bidones'

# ── El límite cuenta por la IP real ──────────────────────────────────────────
seccion "Límite por IP: un X-Forwarded-For inventado no abre otro cubo"

restante() { pedir "$API/api/v1/tenders/?limit=1" "$@" >/dev/null; cabecera x-ratelimit-remaining; }
r0=$(restante)
r1=$(restante -H 'X-Forwarded-For: 203.0.113.7')
r2=$(restante -H 'X-Forwarded-For: 198.51.100.23')
echo "    restantes: sin cabecera $r0 · con XFF inventado $r1 · con otro XFF $r2"
if [ -n "$r0" ] && [ -n "$r1" ] && [ -n "$r2" ] && [ "$r1" -lt "$r0" ] && [ "$r2" -lt "$r1" ]; then
  ok "las tres cuentan en el mismo cubo: el borde no deja pasar un XFF inventado"
else
  mal "un XFF inventado cambió de cubo: pon CONFIAR_X_FORWARDED_FOR=false en la API y revisa el paso 10 de DESPLIEGUE.md"
fi

# ── Sitio ────────────────────────────────────────────────────────────────────
seccion "Sitio ($SITIO)"

pagina() {
  local ruta=$1 nombre=$2
  if [ -z "$ruta" ]; then
    mal "$nombre: sin muestra (el sitemap de la API vino vacío)"
    return
  fi
  local codigo
  codigo=$(pedir "$SITIO$ruta")
  if [ "$codigo" = 200 ] && grep -q 'rel="canonical"' "$TMP/cuerpo"; then
    ok "$nombre ($ruta): 200 con canonical"
  else
    mal "$nombre ($ruta): $codigo$(grep -q 'rel="canonical"' "$TMP/cuerpo" || echo ', sin canonical')"
  fi
}
pagina "${COMPRADOR:+/compradores/$COMPRADOR}" "comprador"
pagina "${RUBRO:+/rubros/$RUBRO}" "rubro"
pagina "${PRODUCTO:+/productos/$PRODUCTO}" "producto"

codigo=$(pedir "$SITIO/compradores/codigo-que-no-existe-0000")
[ "$codigo" = 404 ] && ok "un comprador inventado da 404 en el sitio" || mal "un comprador inventado da $codigo en el sitio (se esperaba 404)"

codigo=$(pedir "$SITIO/robots.txt")
if [ "$codigo" = 200 ] && grep -qi '^sitemap:' "$TMP/cuerpo"; then
  ok "robots.txt responde 200 y declara el sitemap"
else
  mal "robots.txt: $codigo, o sin línea Sitemap:"
fi

codigo=$(pedir "$SITIO/sitemap.xml")
if [ "$codigo" = 200 ] && xml_valido && grep -q '<loc>' "$TMP/cuerpo"; then
  ok "sitemap.xml es XML válido con $(grep -o '<loc>' "$TMP/cuerpo" | wc -l | tr -d ' ') URL"
else
  mal "sitemap.xml: $codigo, XML inválido o sin <loc>"
fi

for feed in /rss/licitaciones /rss/compra-agil; do
  codigo=$(pedir "$SITIO$feed")
  if [ "$codigo" = 200 ] && xml_valido && grep -q '<rss' "$TMP/cuerpo"; then
    ok "$feed es RSS válido"
  else
    mal "$feed: $codigo, o no es RSS válido"
  fi
done

# Sin secreto tiene que ser 401. Un 503 significa que Vercel no tiene
# REVALIDAR_SECRETO, y los cron no podrán revalidar nada.
codigo=$(pedir "$SITIO/api/revalidar" -X POST -H 'Content-Type: application/json' \
  --data '{"etiquetas":["analytics"]}')
case $codigo in
  401) ok "/api/revalidar sin secreto responde 401" ;;
  503) mal "/api/revalidar responde 503: falta REVALIDAR_SECRETO en Vercel" ;;
  *) mal "/api/revalidar sin secreto responde $codigo (se esperaba 401)" ;;
esac

codigo=$(pedir "$SITIO/apoyar")
[ "$codigo" = 200 ] && ok "/apoyar responde 200" || mal "/apoyar responde $codigo"

# Los datos de transferencia: 200 si DONAR_TRANSFERENCIA está, 404 si no (el
# botón tampoco aparece). Los dos son correctos; lo que no puede pasar es que se
# guarden en una caché.
codigo=$(pedir "$SITIO/api/apoyar/transferencia")
case $codigo in
  200 | 404)
    if grep -qi '^cache-control:.*no-store' "$TMP/cabeceras"; then
      ok "/api/apoyar/transferencia: $codigo ($([ "$codigo" = 200 ] && echo con datos || echo sin DONAR_TRANSFERENCIA)), sin caché"
    else
      mal "/api/apoyar/transferencia responde $codigo SIN Cache-Control: no-store"
    fi
    ;;
  *) mal "/api/apoyar/transferencia responde $codigo" ;;
esac

# /abierto publica la URL canónica del MCP, con barra final (spec del rediseño §6.5).
codigo=$(pedir "$SITIO/abierto")
if [ "$codigo" = 200 ] && grep -qF "$API/mcp/" "$TMP/cuerpo"; then
  ok "/abierto responde 200 y publica $API/mcp/"
else
  mal "/abierto responde $codigo o no publica $API/mcp/"
fi

codigo=$(pedir "$SITIO/guias")
[ "$codigo" = 200 ] && ok "/guias responde 200" || mal "/guias responde $codigo"
pagina "/guias/compra-agil-como-funciona" "una guía"

# La portada es un buscador: un <form> GET a /buscar, sin JavaScript (rediseño 6).
codigo=$(pedir "$SITIO/")
if [ "$codigo" = 200 ] && grep -q 'action="/buscar"' "$TMP/cuerpo"; then
  ok "la portada responde 200 con su buscador (action=\"/buscar\")"
else
  mal "la portada responde $codigo o no trae el buscador a /buscar"
fi

# /buscar responde aunque un bloque falle (se oculta con una línea) y no se indexa (rediseño 5).
codigo=$(pedir "$SITIO/buscar?q=resma")
if [ "$codigo" = 200 ] && grep -q 'noindex' "$TMP/cuerpo"; then
  ok "/buscar?q=resma responde 200 con noindex"
else
  mal "/buscar?q=resma responde $codigo$(grep -q 'noindex' "$TMP/cuerpo" || echo ', sin noindex')"
fi

# Las URL del panel anterior (/dashboard/*) redirigen con 308 a las nuevas: los
# enlaces y marcadores viejos siguen llevando a su sitio. `pedir` no sigue
# redirecciones, así que se ve el 308 en sí.
codigo=$(pedir "$SITIO/dashboard/tenders")
destino=$(cabecera location)
# `location` puede venir relativa (/licitaciones) o absoluta (https://…/licitaciones).
if [ "$codigo" = 308 ] && [[ "$destino" == */licitaciones ]]; then
  ok "/dashboard/tenders → 308 → $destino"
else
  mal "/dashboard/tenders responde $codigo${destino:+ → $destino} (se esperaba 308 → /licitaciones)"
fi

# ── Resumen ──────────────────────────────────────────────────────────────────
echo
if [ "$FALLOS" -eq 0 ]; then
  printf '\033[32m✓ Todo en orden.\033[0m\n'
else
  printf '\033[31m✗ %d comprobación(es) fallaron.\033[0m Ver docs/DESPLIEGUE.md, «Si algo falla».\n' "$FALLOS"
fi
exit "$FALLOS"

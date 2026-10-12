#!/usr/bin/env bash
# Genera los secretos compartidos del despliegue y dice dónde va cada uno.
#
#   scripts/generar-secretos.sh
#
# Sólo los IMPRIME. No los escribe en ningún archivo, a propósito: un secreto en
# disco termina en un commit, en un backup o en el historial de otra persona. Se
# copian de la terminal al panel de cada servicio y se cierra la terminal.
#
# Cada uno tiene que ser IDÉNTICO en todos los servicios donde va: un carácter
# distinto y el sitio entero comparte el cubo del límite por IP (PROXY_SECRETO) o
# las páginas dejan de revalidarse (REVALIDAR_SECRETO). Ver docs/DESPLIEGUE.md.
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "Falta openssl." >&2
  exit 1
fi

proxy=$(openssl rand -hex 32)
revalidar=$(openssl rand -hex 32)

cat <<EOF

PROXY_SECRETO=$proxy
  → Railway, servicio API
  → Vercel, Settings → Environment Variables (Production), SIN prefijo NEXT_PUBLIC_

REVALIDAR_SECRETO=$revalidar
  → Vercel, Settings → Environment Variables (Production), SIN prefijo NEXT_PUBLIC_
  → Railway, servicio cron-frecuente
  → Railway, servicio cron-semanal

Cada uno, el MISMO valor en todos sus destinos. No los guardes en un archivo:
si los pierdes, vuelve a correr este script y reemplázalos en todos los sitios.

EOF

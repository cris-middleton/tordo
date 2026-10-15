#!/usr/bin/env bash
#
# Comprueba que cada commit (sin contar merges) de BASE..HEAD lleve la línea
# «Signed-off-by: <autor> <correo>» de su propio autor (Developer Certificate of Origin 1.1).
#
# Lo corre el job «✍️ DCO» del CI en los PR que vienen de un fork (CONTRIBUTING.md).
# Uso: scripts/dco.sh <base> <head>

set -euo pipefail

base="${1:?falta el commit base. Uso: scripts/dco.sh <base> <head>}"
head="${2:?falta el commit head. Uso: scripts/dco.sh <base> <head>}"

fallos=0
for commit in $(git rev-list --no-merges "${base}..${head}"); do
  autor="$(git log -1 --format='%an <%ae>' "$commit")"
  if ! git log -1 --format='%(trailers:key=Signed-off-by,valueonly)' "$commit" | grep -qxF "$autor"; then
    echo "✗ $(git log -1 --format='%h %s' "$commit") — falta «Signed-off-by: ${autor}»"
    fallos=$((fallos + 1))
  fi
done

if [ "$fallos" -gt 0 ]; then
  echo "Firma cada commit con «git commit -s» (ver CONTRIBUTING.md, sección DCO)."
  exit 1
fi
echo "✓ DCO: todos los commits llevan la firma de su autor"

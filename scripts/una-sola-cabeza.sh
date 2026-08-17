#!/usr/bin/env bash
# Falla si Alembic tiene más de una cabeza.
#
# **Por qué existe, con fecha.** El 2026-08-17 `main` quedó con dos cabezas
# (`f19cbdcd6aa9` y `f470d336f9b1`, ambas colgando de `593d371cb8fe`), creadas
# en dos worktrees que partían del mismo commit. Con dos cabezas
# `alembic upgrade head` falla y **la aplicación no arranca contra una base
# nueva**.
#
# Cada PR vio una sola cabeza en su propia rama: el choque sólo existe con las
# dos en `main`, así que el único control que lo habría atrapado es el de CI
# sobre `main`. Y GitHub Actions estaba caído por facturación justo entre un
# merge y el otro, así que nadie se enteró hasta que `make e2e` murió en el paso
# de migraciones.
#
# Este hook no sustituye al de CI —no puede: la colisión aparece al mezclar—
# pero sí corta el caso frecuente: llevas rato en un worktree, main avanzó con
# otra migración, y tu `down_revision` apunta a un padre que ya tiene hijo.
# Compara contra `origin/main` cuando está disponible, así que avisa **antes**
# de abrir el PR.
#
# No necesita base de datos: `alembic heads` lee los ficheros de versiones.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

rojo=$'\e[31m'; gris=$'\e[90m'; fin=$'\e[0m'

contar_cabezas() {
  (cd backend && uv run --project .. alembic heads 2>/dev/null | grep -c '(head)' || true)
}

cabezas=$(contar_cabezas)

if [ "${cabezas:-0}" -gt 1 ]; then
  printf "%s\nBLOQUEADO: Alembic tiene %s cabezas.%s\n\n" "$rojo" "$cabezas" "$fin"
  (cd backend && uv run --project .. alembic heads 2>/dev/null | sed 's/^/  /')
  printf "\n%sCon más de una cabeza \`alembic upgrade head\` falla y la aplicación no\narranca contra una base nueva.\n\n" "$gris"
  printf "Suele pasar al crear una migración en un worktree mientras otra entraba a\nmain. El arreglo es re-encadenar: apunta el \`down_revision\` de la tuya a la\notra cabeza, en vez de al padre común.%s\n\n" "$fin"
  exit 1
fi

# Aviso temprano: tu migración cuelga de un padre que en `origin/main` ya tiene
# otro hijo. Todavía no hay dos cabezas AQUÍ, pero las habrá al mezclar.
if git rev-parse --verify --quiet origin/main >/dev/null; then
  nuevas=$(git diff --name-only --diff-filter=A origin/main...HEAD -- backend/alembic/versions/ 2>/dev/null || true)
  for archivo in $nuevas; do
    [ -f "$archivo" ] || continue
    padre=$(grep -oE "down_revision[^=]*= *'[^']+'" "$archivo" | grep -oE "'[^']+'" | tr -d "'" || true)
    [ -n "$padre" ] || continue
    # ¿Alguna migración YA en origin/main cuelga del mismo padre?
    if git grep -l "down_revision.*'${padre}'" origin/main -- backend/alembic/versions/ >/dev/null 2>&1; then
      printf "%s\nBLOQUEADO: tu migración chocará al mezclar.%s\n\n" "$rojo" "$fin"
      printf "  %s\n  cuelga de %s, que en origin/main ya tiene otro hijo:\n\n" "$archivo" "$padre"
      git grep -l "down_revision.*'${padre}'" origin/main -- backend/alembic/versions/ | sed 's/^/    /'
      printf "\n%sApunta tu \`down_revision\` a esa migración y no al padre común.%s\n\n" "$gris" "$fin"
      exit 1
    fi
  done
fi

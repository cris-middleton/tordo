#!/usr/bin/env bash
#
# Mergea un PR sólo si TODOS los checks de Actions están en verde.
#
# Por qué existe
# --------------
# `main` no tiene protección de rama: GitHub la reserva a repos públicos o a
# cuentas Pro, y este repo es privado en cuenta gratuita. Así que nada impide
# `gh pr merge` con los checks en rojo o a medias — de hecho ya pasó varias veces
# antes de que alguien lo notara.
#
# Esto no es protección de verdad: es local y se puede saltar. Lo que hace es que
# el camino correcto sea también el más corto, que es lo mismo que hace
# `make worktree` con los worktrees.
#
# **La protección real cuesta ~4 USD/mes (GitHub Pro).** Mientras no esté, esto es
# lo que hay.
#
# Uso:  make merge PR=33

set -euo pipefail

PR="${1:?falta el número de PR. Uso: make merge PR=33}"

rojo=$'\e[31m'; verde=$'\e[32m'; azul=$'\e[36m'; gris=$'\e[90m'; fin=$'\e[0m'

printf "%s── PR #%s%s\n" "$azul" "$PR" "$fin"
gh pr view "$PR" --json title,headRefName -q '"   \(.title)\n   rama: \(.headRefName)"'

# ── Esperar a que terminen ───────────────────────────────────────────────────
printf "\n%s── Esperando los checks%s\n" "$azul" "$fin"
for _ in $(seq 1 60); do
  estados=$(gh pr checks "$PR" --json state -q '[.[].state]|join(",")' 2>/dev/null || echo "")
  case "$estados" in
    "")                        printf "%s   sin checks todavía…%s\n" "$gris" "$fin";;
    *PENDING*|*IN_PROGRESS*|*QUEUED*) printf "%s   en curso…%s\n" "$gris" "$fin";;
    *)                         break;;
  esac
  sleep 20
done

estados=$(gh pr checks "$PR" --json state -q '[.[].state]|join(",")' 2>/dev/null || echo "")
if [ -z "$estados" ]; then
  printf "%s✗ El PR no tiene checks.%s\n" "$rojo" "$fin"
  printf "   Un PR abierto durante una caída de Actions se queda sin ellos para\n"
  printf "   siempre: GitHub no dispara retroactivamente. Ciérralo y reábrelo.\n"
  exit 1
fi

# ── Informe ──────────────────────────────────────────────────────────────────
printf "\n"
gh pr checks "$PR" --json name,state -q '.[] | "\(.state)\t\(.name)"' \
  | while IFS=$'\t' read -r estado nombre; do
      if [ "$estado" = "SUCCESS" ]; then
        printf "%s   ✓ %s%s\n" "$verde" "$nombre" "$fin"
      else
        printf "%s   ✗ %s (%s)%s\n" "$rojo" "$nombre" "$estado" "$fin"
      fi
    done

fallidos=$(gh pr checks "$PR" --json state -q '[.[] | select(.state != "SUCCESS")] | length')
if [ "$fallidos" -ne 0 ]; then
  printf "\n%s✗ %s check(s) no están en verde. No se mergea.%s\n" "$rojo" "$fallidos" "$fin"
  exit 1
fi

# ── Qué entra ────────────────────────────────────────────────────────────────
# Los archivos que el squash va a cambiar en `main`, con sus líneas. Un PR que
# toca algo que su descripción no menciona se ve aquí y no después: el
# 2026-10-12 un squash hecho con `reset --soft origin/main` mientras
# `origin/main` avanzaba revirtió un PR entero (#143) con CI en verde, porque se
# revirtieron también sus tests.
printf "\n%s── Archivos que cambia%s\n" "$azul" "$fin"
gh pr diff "$PR" --name-only | sed 's/^/   /'
borrados=$(gh pr view "$PR" --json files -q '[.files[] | select(.additions == 0 and .deletions > 0)] | length')
if [ "$borrados" -gt 0 ]; then
  printf "%s   ⚠ %s archivo(s) sólo pierden líneas: comprueba que sea a propósito.%s\n" "$rojo" "$borrados" "$fin"
fi

printf "\n%s── Mergeando%s\n" "$azul" "$fin"
rama=$(gh pr view "$PR" --json headRefName -q .headRefName)

# Sin `--delete-branch`: esa opción hace que gh intente cambiar de rama en local,
# y desde un worktree falla con "already used by worktree at …" — después de haber
# mergeado, así que el comando salía en error y dejaba la rama remota viva. Como
# aquí SIEMPRE se trabaja en worktrees, pasaba siempre.
gh pr merge "$PR" --squash
git push origin --delete "$rama" >/dev/null 2>&1 \
  && printf "%s   rama remota %s eliminada%s\n" "$gris" "$rama" "$fin"
printf "%s✓ Mergeado.%s\n" "$verde" "$fin"

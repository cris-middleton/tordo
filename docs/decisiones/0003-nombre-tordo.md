# 0003 — El producto se llama TORDO

**Estado**: Aceptada · **Fecha**: 2026-08-05

## Contexto
El repo tenía tres verdades a la vez: el README anunciaba un pivot a "YUCA (SPEC v3.1)",
`docs/SPEC.md` es "TORDO v1.1", y la v3.1 referida no existía en `docs/`.

## Decisión
**TORDO.** El pivot a YUCA queda descartado.

## Consecuencias
- README corregido en F0.
- El nombre se sigue leyendo de `APP_NAME` / `BRAND_NAME`: no se hardcodea. Cambiar de marca
  más adelante sigue siendo barato.
- Cualquier referencia a YUCA en documentos es obsoleta.

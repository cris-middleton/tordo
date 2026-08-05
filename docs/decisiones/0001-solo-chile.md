# 0001 — Sólo Chile, sin abstracción multi-país

**Estado**: Aceptada · **Fecha**: 2026-08-05

## Contexto
LicitaLab, la referencia más cercana, opera en Chile, Perú y Colombia. La revisión de
arquitectura planteaba añadir `fuente` / `pais` a las entidades de ingesta y separar un
núcleo `Convocatoria` de las extensiones por fuente, argumentando que hacerlo ahora es casi
gratis y después es muy caro.

## Decisión
**No.** El producto es sólo Chile. No se añade abstracción de país ni de fuente.

## Consecuencias
- Se elimina de F4 el trabajo de `fuente`/`pais` (~1 semana).
- El modelo puede seguir asumiendo RUT, región/comuna chilenas, `codigoProductoONU` y
  estado hábil de ChileCompra sin envolverlos.
- **Sigue en pie `tipo_convocatoria`** (licitación, compra ágil, convenio marco, trato
  directo, cotización): eso es diversidad del mercado chileno, no de país.
- Si en el futuro se abre otro país, será una migración cara y consciente. El costo queda
  aceptado explícitamente.

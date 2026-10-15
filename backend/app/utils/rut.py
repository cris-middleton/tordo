"""La normalización del RUT: una sola regla para el ETL y la API.

La usan dos lados que tienen que unir por esta clave y no pueden divergir:

- el ETL, que escribe el RUT de la unidad de compra en `analytics.compra_agil_unidad`
  y `analytics.comprador_rut`, y agrupa por él (`etl/analytics/compra_agil_mensual.py`,
  `rut_normalizado`);
- la API, que une la Compra Ágil (`licitaciones.rut_organismo`) con esas tablas
  (`repositories/compra_agil.py`).

La regla: mayúsculas, fuera todo lo que no sea dígito o K (puntos, guion,
espacios), fuera los ceros a la izquierda; si no queda nada, no hay RUT (`None`).
Sin lo último, un RUT de puros ceros se uniría con otro igual de vacío.

**Los ceros a la izquierda importan**: la Compra Ágil puede traer `061.608.700-2`
donde la orden dice `61.608.700-2`. Quitarlos sólo en un lado dejaba a la unidad
sin historia —o, en el ETL, contada como dos unidades en el percentil—, sin que
nada fallara.

Los dos patrones van como constantes para que la expresión de Polars del ETL y
la de SQL de la API se construyan con LOS MISMOS; `normalizar_rut` es la versión
de referencia contra la que un test las compara. El ETL la importa por
`etl/shared_imports.py`. **No se copia.**
"""

from __future__ import annotations

import re

#: Lo que sobra de un RUT escrito: puntos, guion, espacios. Se aplica DESPUÉS de
#: pasar a mayúsculas, para que la K minúscula sobreviva.
FUERA_DE_RUT = r"[^0-9K]"
#: Los ceros a la izquierda del RUT ya limpio.
CEROS_INICIALES = r"^0+"

_FUERA_DE_RUT = re.compile(FUERA_DE_RUT)
_CEROS_INICIALES = re.compile(CEROS_INICIALES)


def normalizar_rut(valor: str | None) -> str | None:
    """«061.608.700-2» → «616087002»; «k» → «K»; «0» o «-» → `None` (no queda nada)."""
    if valor is None:
        return None
    limpio = _CEROS_INICIALES.sub("", _FUERA_DE_RUT.sub("", valor.upper()))
    return limpio or None

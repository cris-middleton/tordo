"""Las cotas de `/buscar` en el frontend son las del backend.

`frontend/lib/buscar.ts` recorta el término antes de llamar: como mucho
`MAXIMO_TERMINOS_BUSCAR` palabras (Compra Ágil responde 422 con más) y
`MAXIMO_CARACTERES_BUSCAR` caracteres (los `search`/`q` de la API tienen
`max_length`). Son copias de `app/api/limites.py`: si el backend las baja y el
frontend no, `/buscar` empezaría a recibir 422 que la página leería como caídas.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.api import limites

BUSCAR = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "buscar.ts"


def _constante(nombre: str) -> int:
    encontrada = re.search(rf"export const {nombre} = (\d+);", BUSCAR.read_text())
    assert encontrada, f"no se encontró {nombre} en frontend/lib/buscar.ts"
    return int(encontrada.group(1))


def test_el_maximo_de_palabras_es_el_del_backend():
    assert _constante("MAXIMO_TERMINOS_BUSCAR") == limites.MAX_TERMINOS


def test_el_maximo_de_caracteres_es_el_del_backend():
    assert _constante("MAXIMO_CARACTERES_BUSCAR") == limites.TEXTO

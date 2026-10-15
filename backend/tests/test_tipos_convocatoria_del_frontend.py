"""Los mecanismos de compra del frontend son los del backend.

`frontend/lib/constantesChile.ts::TIPOS_CONVOCATORIA` espeja `TipoConvocatoria`
(`app/models/convocatoria.py`) y de él salen el desplegable del catálogo y
`TIPOS_SIN_COMPRA_AGIL`, que es lo que cuenta la portada. Si el backend añade un
mecanismo y la lista del frontend no, «Todo menos Compra Ágil» lo dejaría fuera
del enlace de la cifra sin que nada fallara: el número y el listado dejarían de
coincidir.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.models.convocatoria import TipoConvocatoria

CONSTANTES = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "constantesChile.ts"

_BLOQUE = re.compile(r"export const TIPOS_CONVOCATORIA = \[(.*?)\] as const;", re.DOTALL)
_VALOR = re.compile(r"value:\s*'([^']+)'")


def test_tipos_convocatoria_del_frontend_son_los_del_backend():
    bloque = _BLOQUE.search(CONSTANTES.read_text())
    assert bloque, "no se encontró TIPOS_CONVOCATORIA en constantesChile.ts"
    valores = _VALOR.findall(bloque.group(1))

    # Guarda: una expresión que no encuentra nada compararía el vacío con el vacío.
    assert len(valores) >= 4, f"se esperaban ≥4 mecanismos en el frontend, hay {len(valores)}"
    assert sorted(valores) == sorted(t.value for t in TipoConvocatoria)

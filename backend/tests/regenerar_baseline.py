"""Regenera `convenciones_baseline.json` a partir de los modelos.

Se corre cuando arreglas deuda de convenciones —comentarios que faltaban, una PK
que cambia de tipo— y `test_convenciones_modelo.py` avisa de que la línea base
está desfasada.

    cd backend && uv run --project .. python tests/regenerar_baseline.py

**No lo corras para hacer callar un fallo de deuda nueva.** Para eso está el tope
de `test_la_linea_base_solo_puede_encoger`: si el archivo crece, salta.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.test_convenciones_modelo import (  # noqa: E402
    BASELINE,
    _columnas_sin_comentario,
    _pk_entera,
    _tablas_sin_comentario,
)


def main() -> None:
    anterior = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    nueva = {
        "tablas_sin_comentario": sorted(_tablas_sin_comentario()),
        "columnas_sin_comentario": sorted(_columnas_sin_comentario()),
        "pk_entera": sorted(_pk_entera()),
    }
    BASELINE.write_text(json.dumps(nueva, indent=2, ensure_ascii=False) + "\n")

    for clave, valores in nueva.items():
        antes = len(anterior.get(clave, []))
        ahora = len(valores)
        flecha = "→" if antes == ahora else ("↓" if ahora < antes else "↑ OJO")
        print(f"{clave}: {antes} {flecha} {ahora}")


if __name__ == "__main__":
    main()

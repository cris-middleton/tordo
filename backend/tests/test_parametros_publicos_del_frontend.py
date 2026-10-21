"""El largo máximo de un slug en el frontend es el de `app/utils/slug.py`.

`frontend/lib/parametrosPublicos.ts` rechaza, antes de llamar al backend, el
slug de una ficha pública que pase de `LARGO_MAXIMO_SLUG`. Es una copia de
`LARGO_MAXIMO`: si el backend lo sube y el frontend no, las fichas con los
slugs más largos darían 404 sin que nada fallara.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.utils.slug import LARGO_MAXIMO

PARAMETROS = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "parametrosPublicos.ts"


def test_el_largo_maximo_del_slug_es_el_del_backend():
    encontrada = re.search(r"export const LARGO_MAXIMO_SLUG = (\d+);", PARAMETROS.read_text())
    assert encontrada, "no se encontró LARGO_MAXIMO_SLUG en frontend/lib/parametrosPublicos.ts"
    assert int(encontrada.group(1)) == LARGO_MAXIMO

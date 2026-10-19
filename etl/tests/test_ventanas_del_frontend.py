"""Los meses que dicen los textos del sitio son los que lee el análisis.

`frontend/lib/periodo.ts` copia las tres ventanas para escribir «los últimos 12
meses» o «36 meses» sin el número a mano. Si el ETL cambia una ventana y el
frontend no, el sitio diría un periodo que ya no es el de sus cifras.
"""

from __future__ import annotations

import re
from pathlib import Path

from etl.analytics.compra_agil_comprador import VENTANA_COMPRA_AGIL_MESES
from etl.analytics.data_loader import VENTANA_ANALYTICS_MESES
from etl.analytics.product_price_bands import VENTANA_BANDAS_PRECIO_MESES

PERIODO = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "periodo.ts"


def _constante(nombre: str) -> int:
    encontrada = re.search(rf"export const {nombre} = (\d+);", PERIODO.read_text())
    assert encontrada, f"no se encontró {nombre} en frontend/lib/periodo.ts"
    return int(encontrada.group(1))


def test_la_ventana_del_analisis_es_la_del_etl():
    assert _constante("MESES_ANALISIS") == VENTANA_ANALYTICS_MESES


def test_la_ventana_de_los_precios_es_la_del_etl():
    assert _constante("MESES_PRECIOS") == VENTANA_BANDAS_PRECIO_MESES


def test_la_ventana_de_compra_agil_es_la_del_etl():
    assert _constante("MESES_COMPRA_AGIL") == VENTANA_COMPRA_AGIL_MESES

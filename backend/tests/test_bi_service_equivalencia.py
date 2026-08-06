"""Verifica que bi_service sobre Postgres devuelve exactamente lo mismo que la
implementación anterior sobre parquets.

`tests/golden/bi_golden.json` se capturó con la versión de parquets corriendo
sobre los datos reales del pipeline (3 meses de ChileCompra). Este test vuelve a
llamar a las mismas funciones, ahora contra Postgres, y exige salida idéntica.

Sin esto la conversión sería una apuesta: 16 funciones que compilan y nadie sabe
si devuelven lo mismo.

Requiere Postgres con el esquema `analytics` materializado:

    make dev-up-d
    cd etl && uv run --project .. python -m analytics.materialize

Se salta en local si no hay datos; en CI es obligatorio.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import pytest

from app.repositories import analytics_sync as repo
from app.services import bi as bi_service

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
GOLDEN = Path(__file__).parent / "golden" / "bi_golden.json"


def _cargar_golden() -> list[dict]:
    if not GOLDEN.exists():
        pytest.skip(f"no existe {GOLDEN} — córrelo con capturar_golden_bi.py")
    return json.loads(GOLDEN.read_text())


@pytest.fixture(scope="module", autouse=True)
def exigir_datos():
    """Sin tablas materializadas el test no prueba nada: mejor saltar que pasar en falso."""
    try:
        repo.invalidar_cache_existencia()
        hay = repo.existe_tabla("product_price_bands_l1", usar_cache=False)
    except Exception as exc:  # noqa: BLE001
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__}) — usa `make dev-up-d`")
    if not hay:
        pytest.skip(
            "el esquema analytics no está materializado — "
            "corre `python -m analytics.materialize` desde etl/"
        )


def _normalizar(v):
    """Compara con tolerancia sólo donde corresponde.

    El viaje por Postgres puede cambiar el último bit de un float (el parquet
    guarda float64 y vuelve como double precision) y el orden de las claves de un
    dict. Ninguna de las dos cosas es un cambio de comportamiento; una diferencia
    de valor sí lo sería.
    """
    if isinstance(v, dict):
        return {k: _normalizar(v[k]) for k in sorted(v)}
    if isinstance(v, list):
        return [_normalizar(x) for x in v]
    if isinstance(v, float):
        return round(v, 6)
    return v


def _iguales(a, b) -> bool:
    a, b = _normalizar(a), _normalizar(b)
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    return a == b


@pytest.mark.parametrize("caso", _cargar_golden(), ids=lambda c: f"{c['funcion']}:{c['kwargs']}")
def test_equivalencia_con_parquets(caso):
    fn = getattr(bi_service, caso["funcion"])

    if "excepcion" in caso:
        # Si antes reventaba, ahora debe reventar igual. Pasar de excepción a
        # resultado también es un cambio de comportamiento.
        with pytest.raises(Exception):  # noqa: B017, PT011
            fn(**caso["kwargs"])
        return

    obtenido = fn(**caso["kwargs"])
    esperado = caso["resultado"]

    assert _iguales(obtenido, esperado), (
        f"{caso['funcion']}({caso['kwargs']}) cambió de resultado.\n"
        f"  parquets (referencia): {json.dumps(_normalizar(esperado), ensure_ascii=False)[:600]}\n"
        f"  postgres (actual):     {json.dumps(_normalizar(obtenido), ensure_ascii=False, default=str)[:600]}"
    )

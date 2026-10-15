"""La normalización del RUT es UNA: `app.utils.rut`, con el ETL y la API detrás.

La API une la Compra Ágil contra la clave que escribe el ETL. Si las dos reglas
divergen no falla nada: la unidad sale «sin historia». Este test compara la
expresión de Polars del ETL con la función de referencia sobre los casos que
duelen; el de SQL (la API) vive en `backend/tests/test_rut.py`.
"""

import polars as pl
import pytest

from etl.analytics.compra_agil_mensual import rut_normalizado
from etl.shared_imports import normalizar_rut

CASOS = [
    ("61.608.700-2", "616087002"),
    ("061.608.700-2", "616087002"),
    ("0616087002", "616087002"),
    ("61.103.007-k", "61103007K"),
    ("061.103.007-K", "61103007K"),
    (" 76.286.670-6 ", "762866706"),
    ("69255600-3", "692556003"),
    ("0", None),
    ("000", None),
    ("0.000.000-0", None),
    ("", None),
    ("-", None),
    (None, None),
]


@pytest.mark.parametrize(("crudo", "esperado"), CASOS)
def test_la_funcion_de_referencia(crudo, esperado):
    assert normalizar_rut(crudo) == esperado


def test_la_expresion_de_polars_coincide_con_la_de_referencia():
    df = pl.DataFrame({"rut": [c for c, _ in CASOS]}, schema={"rut": pl.Utf8})
    salida = df.select(rut_normalizado("rut").alias("rut"))["rut"].to_list()
    assert salida == [normalizar_rut(c) for c, _ in CASOS]
    assert salida == [e for _, e in CASOS]


def test_es_idempotente():
    for _, esperado in CASOS:
        assert normalizar_rut(esperado) == esperado

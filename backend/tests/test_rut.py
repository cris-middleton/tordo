"""La API normaliza el RUT como el ETL: la misma regla, `app.utils.rut`.

La Compra Ágil ingerida (`licitaciones.rut_organismo`) se une con la clave que
escribe el ETL. Aquí se comprueba que la expresión de SQL de la API da, sobre
los casos que duelen, lo mismo que la función de referencia; la de Polars del ETL
se compara en `etl/tests/test_rut_normalizado.py`.
"""

import pytest
from sqlalchemy import literal, select

from app.repositories.compra_agil import _rut_normalizado, _sin_ceros
from app.utils.rut import normalizar_rut

CASOS = [
    "61.608.700-2",
    "061.608.700-2",
    "0616087002",
    "61.103.007-k",
    " 76.286.670-6 ",
    "0",
    "000",
    "0.000.000-0",
    "",
    "-",
]


def test_normalizar_rut_ejemplos():
    assert normalizar_rut("061.608.700-2") == "616087002"
    assert normalizar_rut("61.103.007-k") == "61103007K"
    assert normalizar_rut("0.000.000-0") is None
    assert normalizar_rut(None) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("crudo", CASOS)
async def test_el_sql_de_la_api_coincide_con_la_referencia(async_db, crudo):
    sql = (await async_db.execute(select(_rut_normalizado(literal(crudo))))).scalar()
    assert sql == normalizar_rut(crudo)


@pytest.mark.asyncio
async def test_sin_ceros_es_un_seguro_para_tablas_viejas(async_db):
    """`comprador_rut` materializada antes del cambio conserva los ceros."""
    assert (
        await async_db.execute(select(_sin_ceros(literal("0616087002"))))
    ).scalar() == "616087002"
    assert (await async_db.execute(select(_sin_ceros(literal("000"))))).scalar() is None

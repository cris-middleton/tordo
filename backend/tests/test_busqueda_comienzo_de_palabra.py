r"""La búsqueda encuentra un término al COMIENZO de una palabra, no dentro de otra.

Con `ILIKE '%t%'`, «bus» encontraba «combustible» y «mesa», «parmesano». La regla
de ahora (`app/repositories/busqueda.py`) ancla el fragmento con `\m`, y la usan
todas las búsquedas por texto de la API:

- el catálogo y «Lo mejor de hoy», por `coincide_termino`;
- los productos de `/bi/productos`, por `_analytics_sql.sql_busqueda_texto`;
- los productos de `/publico/productos`, con la misma idea sobre slugs
  (`test_publico_http.py`).

Lo que escribe el usuario se busca literal: un metacarácter de regex no cambia
el patrón ni revienta la consulta.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql

from app.models.licitacion import Licitacion
from app.repositories import analytics as repo_analytics
from app.repositories.busqueda import fragmento
from app.repositories.licitaciones import coincide_termino

NOMBRES = {
    "B-COMBUSTIBLE": "Compra de combustible diésel",
    "B-BUSES": "Arriendo de buses para traslado",
    "B-BUS": "Servicio de bus escolar",
    "B-PARMESANO": "Queso parmesano rallado",
    "B-MESA": "Mesa de reuniones",
    "B-VALVULA": "Válvula de retención",
    "B-CMAS": "Licencias C++ y Visual Studio",
    "B-PULGADA": "Cañería de 3/4 pulgada",
    "B-PUNTO": "Planilla Excel.xlsx para inventario",
}


@pytest_asyncio.fixture
async def catalogo(async_db):
    async_db.add_all(
        [
            Licitacion(
                codigo_externo=codigo,
                nombre=nombre,
                fecha_publicacion=datetime.now(UTC),
                activo=True,
            )
            for codigo, nombre in NOMBRES.items()
        ]
    )
    await async_db.flush()


async def _buscar(db, termino: str) -> set[str]:
    filas = await db.execute(
        select(Licitacion.codigo_externo).where(
            Licitacion.codigo_externo.startswith("B-"), coincide_termino(termino)
        )
    )
    return set(filas.scalars())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("termino", "esperado"),
    [
        # El caso que lo destapó: «bus» dentro de «combustible».
        ("bus", {"B-BUS", "B-BUSES"}),
        ("mesa", {"B-MESA"}),
        # El comienzo de una palabra sigue bastando.
        ("valvul", {"B-VALVULA"}),
        ("parmes", {"B-PARMESANO"}),
        ("combus", {"B-COMBUSTIBLE"}),
        # Dentro de una palabra, no.
        ("bustible", set()),
        ("lvula", set()),
        ("esano", set()),
    ],
)
async def test_el_fragmento_empieza_una_palabra(async_db, catalogo, termino, esperado):
    assert await _buscar(async_db, termino) == esperado


@pytest.mark.asyncio
@pytest.mark.parametrize("termino", ["válvul", "VALVUL", "Válvula", "valvula"])
async def test_tildes_y_mayusculas_no_importan(async_db, catalogo, termino):
    assert await _buscar(async_db, termino) == {"B-VALVULA"}


@pytest.mark.asyncio
async def test_una_enie_se_busca_sin_tilde_como_se_indexo(async_db, catalogo):
    """`nombre_norm` es `unaccent(nombre)`: «Cañería» se guarda «Caneria»."""
    assert await _buscar(async_db, "cañer") == {"B-PULGADA"}
    assert await _buscar(async_db, "caner") == {"B-PULGADA"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("termino", "esperado"),
    [
        # Los metacaracteres se buscan literales.
        ("c++", {"B-CMAS"}),
        ("3/4", {"B-PULGADA"}),
        ("excel.xlsx", {"B-PUNTO"}),
        # Un «.» no es «cualquier carácter»: «excelxxlsx» no existe.
        ("excel.", {"B-PUNTO"}),
        ("excelaxlsx", set()),
        # Lo que no empieza por letra o dígito se recorta por delante.
        ("(bus", {"B-BUS", "B-BUSES"}),
        # Regex que, sin escapar, encontrarían todo o romperían la consulta.
        (".*", set()),
        ("a|b", set()),
        ("bus|mesa", set()),
        ("[", set()),
        ("(", set()),
        ("\\", set()),
        ("x\\", set()),
        ("x{2", set()),
        ("x)", set()),
        # `unaccent` convierte «©» en «(C)»: escapar antes de quitar las tildes
        # dejaría un paréntesis suelto, un error de sintaxis en la regex.
        ("x©)", set()),
    ],
)
async def test_lo_que_escribe_el_usuario_se_busca_literal(async_db, catalogo, termino, esperado):
    assert await _buscar(async_db, termino) == esperado


def test_fragmento_recorta_solo_el_principio():
    assert fragmento("(bus") == "bus"
    assert fragmento("c++") == "c++"
    assert fragmento(".net") == "net"
    assert fragmento("&") == ""
    assert fragmento("") == ""


@pytest.mark.asyncio
async def test_el_indice_de_trigramas_sigue_sirviendo_el_fragmento(async_db):
    """`gin_trgm_ops` sirve `~*` como servía `ILIKE`. Se apaga el recorrido
    secuencial para que la tabla casi vacía de los tests no decida el plan."""
    await async_db.execute(text("SET LOCAL enable_seqscan = off"))
    consulta = select(Licitacion.id).where(coincide_termino("valvul"))
    compilada = consulta.compile(dialect=postgresql.dialect(paramstyle="named"))
    filas = (await async_db.execute(text(f"EXPLAIN {compilada}"), compilada.params)).all()
    plan = "\n".join(fila[0] for fila in filas)
    assert "ix_licitaciones_nombre_trgm" in plan, plan


# ── /bi/productos: la tabla de analytics, sobre `lower(col)` ─────────────────

TABLA = "tabla_busqueda_palabra"


@pytest_asyncio.fixture
async def productos(async_db):
    await async_db.execute(text(f"CREATE SCHEMA IF NOT EXISTS {repo_analytics.SCHEMA}"))
    await async_db.execute(
        text(f'CREATE TABLE {repo_analytics.SCHEMA}.{TABLA} ("nombre" TEXT, n BIGINT)')
    )
    await async_db.execute(
        text(
            f"INSERT INTO {repo_analytics.SCHEMA}.{TABLA} VALUES "
            "('Queso parmesano', 5), ('Mesa de reuniones', 4), ('Combustible', 3), "
            "('Buses de acercamiento', 2), ('Válvula de bola', 1)"
        )
    )
    return async_db


async def _productos(db, termino: str) -> set[str]:
    df = await repo_analytics.buscar_texto(db, TABLA, "nombre", termino, orden="n")
    return set(df["nombre"].to_list()) if not df.is_empty() else set()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("termino", "esperado"),
    [
        ("mesa", {"Mesa de reuniones"}),
        ("bus", {"Buses de acercamiento"}),
        ("válv", {"Válvula de bola"}),
        ("PARMES", {"Queso parmesano"}),
        ("esano", set()),
        ("%", set()),
        (".*", set()),
        ("(", set()),
    ],
)
async def test_productos_de_bi_con_la_misma_regla(productos, termino, esperado):
    assert await _productos(productos, termino) == esperado

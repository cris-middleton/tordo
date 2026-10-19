"""El catálogo se pagina sin repetir ni saltarse filas.

El orden de `GET /tenders/` era «abiertas primero» y una columna (fecha de
publicación, cierre, monto o nombre). Con un empate en esa columna Postgres puede
devolver las filas empatadas en cualquier orden, y en la práctica lo hace: con
`LIMIT` y `OFFSET` usa un ordenamiento parcial (top-N) que no es estable, así que
la página 2 no sigue a la página 1 — una misma licitación sale dos veces y otra
no sale nunca. El empate no es raro: el ETL carga en lote, y muchas filas
comparten fecha de publicación al segundo; casi todas las Compras Ágiles, el
monto tope.

El último criterio de todo orden es ahora el `id`, que es único.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

ORGANISMO = "ZZ-EMPATE"
FILAS = 60
POR_PAGINA = 7
# Todas con la misma fecha, el mismo cierre, el mismo monto y el mismo nombre:
# ningún criterio de orden las distingue salvo el desempate.
FECHA = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
CIERRE = datetime.now(UTC) + timedelta(days=10)


@pytest_asyncio.fixture
async def empatadas(async_db):
    async_db.add_all(
        [
            Licitacion(
                codigo_externo=f"EMP-{i:03d}",
                nombre="Zzempate suministro de oficina",
                codigo_organismo=ORGANISMO,
                estado="Publicada",
                fecha_publicacion=FECHA,
                fecha_cierre=CIERRE,
                monto_estimado=1_000_000,
                activo=True,
            )
            for i in range(FILAS)
        ]
    )
    await async_db.flush()


async def _recorrer(db, buscar) -> list[str]:
    codigos: list[str] = []
    for salto in range(0, FILAS, POR_PAGINA):
        filas, total = await buscar(db, salto)
        assert total == FILAS
        codigos.extend(f.codigo_externo for f in filas)
    return codigos


def _sin_repetir_ni_faltar(codigos: list[str]) -> None:
    repetidas = sorted({c for c in codigos if codigos.count(c) > 1})
    assert not repetidas, f"salen dos veces: {repetidas}"
    assert len(codigos) == FILAS, f"faltan {FILAS - len(set(codigos))} filas"


@pytest.mark.asyncio
@pytest.mark.parametrize("orden", [*repo.COLUMNAS_ORDENABLES, None])
@pytest.mark.parametrize("ascendente", [False, True])
async def test_cada_orden_pagina_sin_repetir_ni_saltar(async_db, empatadas, orden, ascendente):
    filtros = repo.Filtros(codigo_organismo=ORGANISMO)

    async def buscar(db, salto):
        return await repo.buscar(
            db, filtros, orden=orden, ascendente=ascendente, salto=salto, limite=POR_PAGINA
        )

    _sin_repetir_ni_faltar(await _recorrer(async_db, buscar))


@pytest.mark.asyncio
@pytest.mark.parametrize("ascendente", [False, True])
async def test_relevancia_pagina_sin_repetir_ni_saltar(async_db, empatadas, ascendente):
    """La misma puntuación para todas: el texto es idéntico."""
    filtros = repo.Filtros(codigo_organismo=ORGANISMO, terminos=["zzempate"])

    async def buscar(db, salto):
        return await repo.buscar_por_relevancia(
            db, filtros, ascendente=ascendente, salto=salto, limite=POR_PAGINA
        )

    _sin_repetir_ni_faltar(await _recorrer(async_db, buscar))


@pytest.mark.asyncio
async def test_el_desempate_es_el_id(async_db, empatadas):
    """Descendente por defecto: entre empatadas, la de id mayor primero."""
    filas, _ = await repo.buscar(
        async_db, repo.Filtros(codigo_organismo=ORGANISMO), salto=0, limite=FILAS
    )
    ids = [f.id for f in filas]
    assert ids == sorted(ids, reverse=True)

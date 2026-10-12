"""En el listado, lo que se puede postular va primero.

Buscar «limpieza» devolvía primero licitaciones cerradas y adjudicadas: el orden
era sólo por fecha de publicación. Y ordenar por cierre ascendente empezaba por
las que cerraron hace meses. Quien busca, busca a qué postular.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

AHORA = datetime.now(UTC)
TERMINO = "zzescobillones"


@pytest_asyncio.fixture
async def mezcla(async_db):
    filas = [
        # La más reciente, pero cerrada.
        Licitacion(
            codigo_externo="AP-CERRADA",
            nombre=f"Compra de {TERMINO}",
            estado="Cerrada",
            fecha_publicacion=AHORA - timedelta(days=1),
            fecha_cierre=AHORA - timedelta(hours=2),
            activo=True,
        ),
        # Publicada hace más, y abierta.
        Licitacion(
            codigo_externo="AP-ABIERTA",
            nombre=f"Suministro de {TERMINO}",
            estado="Publicada",
            fecha_publicacion=AHORA - timedelta(days=5),
            fecha_cierre=AHORA + timedelta(days=7),
            activo=True,
        ),
        # «Publicada» en la API pero con el cierre ya pasado: no se puede postular.
        Licitacion(
            codigo_externo="AP-VENCIDA",
            nombre=f"Adquisición de {TERMINO}",
            estado="Publicada",
            fecha_publicacion=AHORA - timedelta(days=2),
            fecha_cierre=AHORA - timedelta(days=1),
            activo=True,
        ),
        Licitacion(
            codigo_externo="AP-ADJUDICADA",
            nombre=f"Servicio de {TERMINO}",
            estado="Adjudicada",
            fecha_publicacion=AHORA - timedelta(hours=1),
            fecha_cierre=AHORA - timedelta(days=30),
            activo=True,
        ),
    ]
    async_db.add_all(filas)
    await async_db.flush()
    return filas


def _filtros():
    return repo.Filtros(terminos=[TERMINO])


@pytest.mark.asyncio
async def test_por_defecto_la_abierta_va_primero(async_db, mezcla):
    filas, total = await repo.buscar(async_db, _filtros())

    assert total == 4
    assert filas[0].codigo_externo == "AP-ABIERTA"


@pytest.mark.asyncio
async def test_por_cierre_ascendente_no_empieza_por_las_ya_cerradas(async_db, mezcla):
    filas, _ = await repo.buscar(async_db, _filtros(), orden="fecha_cierre", ascendente=True)

    assert filas[0].codigo_externo == "AP-ABIERTA"


@pytest.mark.asyncio
async def test_por_relevancia_tambien_va_primero_la_abierta(async_db, mezcla):
    """Las cuatro puntúan casi igual contra el término; la abierta va primero
    por la clave de orden, no por suerte."""
    filas, total = await repo.buscar_por_relevancia(async_db, _filtros())

    assert total == 4
    assert filas[0].codigo_externo == "AP-ABIERTA"


@pytest.mark.asyncio
async def test_la_region_filtra_aunque_venga_con_espacios(async_db):
    """Así llegan de la API y así quedaron guardadas antes de limpiarlas."""
    async_db.add(
        Licitacion(
            codigo_externo="AP-REGION",
            nombre=f"Otra de {TERMINO}",
            region="Región del Biobío ",
            fecha_publicacion=AHORA,
            activo=True,
        )
    )
    await async_db.flush()

    filas, total = await repo.buscar(
        async_db, repo.Filtros(terminos=[TERMINO], region="Región del Biobío")
    )

    assert total == 1 and filas[0].codigo_externo == "AP-REGION"

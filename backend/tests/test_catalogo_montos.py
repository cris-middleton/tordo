"""Un monto de 0 en el filtro del catálogo es un filtro.

`Filtros.monto_minimo`/`monto_maximo` se aplicaban por su verdad, así que
`max_amount=0` (o `min_amount=0`) no filtraba nada y devolvía el catálogo
entero. Ahora se aplican siempre que vengan.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

ORGANISMO = "ZZ-MONTOS"


@pytest_asyncio.fixture
async def catalogo(async_db):
    cierre = datetime.now(UTC) + timedelta(days=10)
    async_db.add_all(
        [
            Licitacion(
                codigo_externo=f"MONTO-{monto}",
                nombre="Zzmontos suministro",
                codigo_organismo=ORGANISMO,
                estado="Publicada",
                fecha_publicacion=datetime(2026, 10, 1, tzinfo=UTC),
                fecha_cierre=cierre,
                monto_estimado=monto,
                activo=True,
            )
            for monto in (0, 500_000, 2_000_000)
        ]
    )
    await async_db.flush()


async def _codigos(db, **filtros) -> list[str]:
    filas, _ = await repo.buscar(
        db, repo.Filtros(codigo_organismo=ORGANISMO, **filtros), salto=0, limite=50
    )
    return sorted(f.codigo_externo for f in filas)


@pytest.mark.asyncio
async def test_monto_maximo_cero_deja_solo_las_de_cero(async_db, catalogo):
    assert await _codigos(async_db, monto_maximo=0) == ["MONTO-0"]


@pytest.mark.asyncio
async def test_monto_minimo_cero_deja_fuera_las_sin_monto(async_db, catalogo):
    async_db.add(
        Licitacion(
            codigo_externo="MONTO-NULO",
            nombre="Zzmontos sin monto",
            codigo_organismo=ORGANISMO,
            estado="Publicada",
            fecha_publicacion=datetime(2026, 10, 1, tzinfo=UTC),
            activo=True,
        )
    )
    await async_db.flush()

    assert await _codigos(async_db, monto_minimo=0) == ["MONTO-0", "MONTO-2000000", "MONTO-500000"]
    assert len(await _codigos(async_db)) == 4


@pytest.mark.asyncio
async def test_sin_montos_no_filtra(async_db, catalogo):
    assert await _codigos(async_db) == ["MONTO-0", "MONTO-2000000", "MONTO-500000"]

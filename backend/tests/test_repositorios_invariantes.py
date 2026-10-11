"""Los filtros que estaban repetidos por los routers, ahora en un solo sitio.

Se escribían a mano en varios endpoints, y ninguno tenía test. Fallar en ellos
**no rompe nada visible**, que es exactamente lo que los hace peligrosos. Desde
el pivote público queda uno: una licitación retirada no se lista ni se abre.
(Los de documentos y checklist se fueron con las cuentas.)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo_licitaciones


async def _licitacion(db, codigo: str, *, activo: bool = True) -> Licitacion:
    lic = Licitacion(
        codigo_externo=codigo,
        nombre=f"Servicio {codigo}",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=1),
        fecha_cierre=datetime.now(UTC) + timedelta(days=10),
        estado="Publicada",
        activo=activo,
    )
    db.add(lic)
    await db.flush()
    return lic


# ── Licitaciones: `activo` es lo que decide que existan ──────────────────────


@pytest.mark.asyncio
async def test_ni_se_lista_ni_se_abre_por_codigo(async_db):
    retirada = await _licitacion(async_db, "INV-RETIRADA-2", activo=False)

    assert await repo_licitaciones.obtener(async_db, retirada.id) is None
    assert await repo_licitaciones.obtener_por_codigo(async_db, "INV-RETIRADA-2") is None

    filas, _total = await repo_licitaciones.buscar(
        async_db, repo_licitaciones.Filtros(terminos=["INV-RETIRADA-2"]), limite=100
    )
    assert not filas

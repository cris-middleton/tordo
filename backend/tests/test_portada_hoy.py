"""Las cifras nuevas de la portada: Compras Ágiles por día de cierre y publicadas hoy.

docs/IDENTIDAD_Y_PORTADA_2026-10.md §3.5 y §3.6. Las dos cuentan **días de Chile**:
una Compra Ágil que cierra a las 23:30 de Santiago cierra «hoy» aunque en UTC ya
sea mañana, y una publicada a las 23:30 de Santiago es de hoy. Un día UTC empieza
cuatro horas antes (tres en verano), así que el error sólo se ve de noche —como el
de `test_reloj_chile.py`—, y por eso estos tests fijan el instante.

El día de prueba es en 2031: la base de desarrollo no tiene nada publicado ni
cerrando entonces. Aun así, los conteos de abiertas se miden POR DIFERENCIA
(una abierta sin cierre de la base de desarrollo sigue abierta en 2031).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.core.tiempo import ZONA_CHILE
from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

#: 16 de agosto de 2031, 03:45 UTC = 23:45 del día 15 en Santiago (invierno, -04).
INSTANTE = datetime(2031, 8, 16, 3, 45, tzinfo=UTC)
DIA = date(2031, 8, 15)
AYER, MANANA = DIA - timedelta(days=1), DIA + timedelta(days=1)
HOSPITAL, ARICA = "Hospital del Salvador", "Municipalidad de Arica"


def _chile(dia: date, hora: int, minuto: int = 0) -> datetime:
    return datetime.combine(dia, time(hora, minuto), tzinfo=ZONA_CHILE)


def _lic(
    codigo: str,
    *,
    tipo: str = "compra_agil",
    cierre: datetime | None = None,
    publicada: datetime | None = None,
    organismo: str | None = "SERVICIO DE PRUEBA",
    activo: bool = True,
) -> Licitacion:
    return Licitacion(
        codigo_externo=codigo,
        nombre=f"Compra {codigo}",
        tipo_convocatoria=tipo,
        estado="Publicada",
        fecha_publicacion=publicada or _chile(DIA, 9),
        fecha_cierre=cierre,
        nombre_organismo=organismo,
        activo=activo,
    )


def test_la_premisa_el_instante_es_de_noche_en_chile_y_de_manana_en_utc():
    assert INSTANTE.date() == date(2031, 8, 16)
    assert INSTANTE.astimezone(ZONA_CHILE).date() == DIA


# ── Compras Ágiles por día de cierre ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_reparte_por_dia_de_chile_y_los_cuatro_tramos_suman_las_abiertas(async_db):
    antes = await repo.contar_abiertas(async_db, ahora=INSTANTE)
    async_db.add_all(
        [
            # 23:50 de Santiago = 03:50 UTC del 16: ya es «mañana» en UTC, pero cierra HOY.
            _lic("CIE-HOY", cierre=_chile(DIA, 23, 50)),
            _lic("CIE-MANANA-0010", cierre=_chile(DIA + timedelta(days=1), 0, 10)),
            _lic("CIE-MANANA", cierre=_chile(DIA + timedelta(days=1), 18)),
            _lic("CIE-PASADO-0000", cierre=_chile(DIA + timedelta(days=2), 0, 0)),
            _lic("CIE-TERCERO", cierre=_chile(DIA + timedelta(days=3), 23, 59)),
            _lic("CIE-CUARTO-0000", cierre=_chile(DIA + timedelta(days=4), 0, 0)),
            _lic("CIE-SIN-CIERRE", cierre=None),  # abierta por no tener cierre: «después»
            _lic("CIE-YA-CERRO", cierre=_chile(DIA, 23, 40)),  # antes de las 23:45: no abierta
            _lic("CIE-RETIRADA", cierre=_chile(DIA + timedelta(days=1), 9), activo=False),
            _lic("CIE-LICITACION", tipo="licitacion", cierre=_chile(DIA, 23, 55)),
        ]
    )
    await async_db.flush()

    despues = await repo.contar_abiertas(async_db, ahora=INSTANTE)

    a, d = antes.compra_agil_por_cierre, despues.compra_agil_por_cierre
    assert (d.hoy - a.hoy, d.manana - a.manana) == (1, 2)
    assert (d.dos_tres_dias - a.dos_tres_dias, d.despues - a.despues) == (2, 2)
    assert despues.compra_agil - antes.compra_agil == 7
    assert despues.licitaciones - antes.licitaciones == 1
    # Sobre toda la tabla, no sólo lo sembrado.
    assert d.hoy + d.manana + d.dos_tres_dias + d.despues == despues.compra_agil


@pytest.mark.asyncio
async def test_sin_reloj_fijo_los_tramos_tambien_suman(async_db):
    """Con `now()` de Postgres y `hoy_chile()`, como en producción."""
    async_db.add_all(
        [
            _lic("CIE-REAL-1", cierre=datetime.now(UTC) + timedelta(hours=3)),
            _lic("CIE-REAL-2", cierre=datetime.now(UTC) + timedelta(days=5)),
        ]
    )
    await async_db.flush()

    conteo = await repo.contar_abiertas(async_db)

    t = conteo.compra_agil_por_cierre
    assert t.hoy + t.manana + t.dos_tres_dias + t.despues == conteo.compra_agil


@pytest.mark.asyncio
async def test_un_reloj_sin_zona_se_rechaza(async_db):
    with pytest.raises(ValueError, match="zona horaria"):
        await repo.contar_abiertas(async_db, ahora=datetime(2031, 8, 16, 3, 45))

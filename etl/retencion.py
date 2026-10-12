"""Cuánto vive el catálogo en Postgres (spec del pivote §5.2, paso 7).

Postgres guarda lo que se sirve HOY: licitaciones abiertas y recientes, y la
Compra Ágil de los últimos 30 días, y nunca del mes anterior. La historia completa vive en los parquets de
R2 (`etl/almacen.py`), que es donde la leen analytics y el ranking.

- **Compra Ágil**: publicada hace más de `DIAS_COMPRA_AGIL` días **y nunca del mes
  anterior** (en hora de Chile), fuera. Lo segundo no es redundante: con sólo
  30 días móviles ninguna corrida semanal ve un mes ENTERO —la del 28 de
  septiembre ve del 1 al 28; la del 5 de octubre, del 5 al 30— y el máximo que
  acumula `compra_agil_mensual` se queda con uno de los dos trozos, perdiendo
  hasta una semana de cada mes. Así un mes sólo se purga cuando ya van dos por
  delante, y toda corrida del mes siguiente lo ve completo: en Postgres quedan
  entre 30 y ~62 días de Compra Ágil.
- **Licitaciones** (todo lo que no es Compra Ágil): cerrada hace más de
  `DIAS_LICITACION_CERRADA` días, fuera. Una sin fecha de cierre cuenta desde su
  publicación, o no se iría nunca. 90 días cubren de sobra la re-consulta de
  resultados (`etl.cron.DIAS_RESULTADOS`, 30).

**Corre en el cron semanal, DESPUÉS de `compra_agil_mensual` y sólo si ese
módulo terminó bien** (`etl.cron.correr_semanal`). Es la única fuente de
`publicadas`, y la acumula leyendo esta misma tabla: borrar una Compra Ágil que
todavía no contó la perdería para siempre. Corriendo justo después, todo lo que
se borra acaba de contarse.

Lo purgado sale del catálogo entero: el detalle de un código purgado responde
404, como uno que nunca existió (`etl/tests/test_retencion.py`). **Nada que
lea Postgres puede contar con lo purgado**: un conteo de Compra Ágil de 90–180
días se saca de `analytics.compra_agil_mensual`, nunca de `licitaciones`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text

from etl.config import config

logger = logging.getLogger(__name__)

DIAS_COMPRA_AGIL = 30
DIAS_LICITACION_CERRADA = 90
#: Los meses de `compra_agil_mensual` son de Chile (`fecha_publicacion AT TIME
#: ZONE 'America/Santiago'`): el corte tiene que caer en la misma frontera.
ZONA_CHILE = ZoneInfo("America/Santiago")

#: Lo que se purga. El detalle va primero: su FK no es `ON DELETE CASCADE`.
#: `IS DISTINCT FROM` y no `<>`: con un tipo nulo, `<>` da NULL y la fila no se
#: iría nunca (hoy la columna es NOT NULL; la consulta no depende de eso).
_PURGABLES = """
    SELECT id FROM licitaciones
     WHERE (tipo_convocatoria = 'compra_agil' AND fecha_publicacion < :corte_ca)
        OR (tipo_convocatoria IS DISTINCT FROM 'compra_agil'
            AND COALESCE(fecha_cierre, fecha_publicacion) < :corte_lic)
"""


@dataclass(frozen=True)
class Purgado:
    licitaciones: int
    detalles: int


def inicio_mes_anterior(ahora: datetime) -> datetime:
    """Las 00:00 de Chile del primer día del mes anterior al de `ahora`."""
    local = ahora.astimezone(ZONA_CHILE)
    anio, mes = (local.year - 1, 12) if local.month == 1 else (local.year, local.month - 1)
    return datetime(anio, mes, 1, tzinfo=ZONA_CHILE)


def cortes(ahora: datetime) -> tuple[datetime, datetime]:
    """(corte de Compra Ágil, corte de licitaciones): lo anterior se borra."""
    corte_ca = min(ahora - timedelta(days=DIAS_COMPRA_AGIL), inicio_mes_anterior(ahora))
    return corte_ca, ahora - timedelta(days=DIAS_LICITACION_CERRADA)


def purgar_catalogo(ahora: datetime, url: str | None = None) -> Purgado:
    """Borra lo que ya no se sirve, en una transacción. `ahora` con zona."""
    corte_ca, corte_lic = cortes(ahora)
    parametros = {"corte_ca": corte_ca, "corte_lic": corte_lic}
    engine = create_engine(url or _url_sync(config.DATABASE_URL))
    try:
        with engine.begin() as conn:
            detalles = conn.execute(
                text(f"DELETE FROM licitaciones_detalle WHERE licitacion_id IN ({_PURGABLES})"),
                parametros,
            ).rowcount
            licitaciones = conn.execute(
                text(f"DELETE FROM licitaciones WHERE id IN ({_PURGABLES})"), parametros
            ).rowcount
    finally:
        engine.dispose()
    logger.info(
        "retención: %d licitaciones y %d detalles purgados (Compra Ágil antes de %s, "
        "cerradas antes de %s)",
        licitaciones,
        detalles,
        corte_ca.date(),
        corte_lic.date(),
    )
    return Purgado(licitaciones=licitaciones, detalles=detalles)


def _url_sync(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)

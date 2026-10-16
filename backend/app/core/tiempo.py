"""El reloj del producto es el de Chile.

TORDO es sólo para Chile: los plazos de Mercado Público, los envíos de correo,
el calendario de los cron y los días del BI se cuentan en `America/Santiago`.
Este módulo existe para que esa decisión esté escrita **una vez**.

Hizo falta porque no lo estaba: Celery declaraba su zona, las tareas de ETL
tenían su propia constante, y la cuota diaria de BI usaba `date.today()` — la
fecha local del proceso, que en un contenedor es UTC. Con Chile en UTC-4, el
día de la cuota cambiaba a las **20:00 hora de Santiago**: quien gastaba sus
tres consultas por la mañana tenía que esperar al anochecer, y quien las
gastaba a las 19:00 recibía tres más una hora después. La pantalla de plan
decía «consultas restantes hoy» sobre un «hoy» que no era el del usuario.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

ZONA_CHILE = ZoneInfo("America/Santiago")


def ahora_chile() -> datetime:
    """El instante actual, con la zona de Chile puesta."""
    return datetime.now(ZONA_CHILE)


def hoy_chile() -> date:
    """La fecha de hoy **para el usuario**, no para el servidor."""
    return ahora_chile().date()


def en_hora_de_chile(fecha: datetime) -> datetime:
    """Una fecha de Mercado Público como instante, en UTC.

    Las dos APIs de ChileCompra dan hora de pared de Chile: la clásica sin
    zona y la de Compra Ágil con una `Z` que no es UTC. Guardada ingenua en una
    columna `timestamptz`, Postgres la lee en la zona de la sesión (UTC), y cada
    cierre quedaba 3–4 h antes. Una fecha sin zona se lee aquí en
    `America/Santiago`, con su cambio de hora; una con zona se respeta.

    El día del cambio de hora decide `zoneinfo` con `fold=0`, como en
    `inicio_del_dia`: la hora que no existe (00:xx del primer domingo de
    septiembre) lleva el desfase de antes del salto, y la repetida (23:xx del
    primer sábado de abril) es la **primera** vez, el cierre más temprano.
    Se devuelve en UTC por lo mismo que `inicio_del_dia`: un instante en esas
    horas no es igual a ninguno de otra zona (PEP 495).
    """
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=ZONA_CHILE)
    return fecha.astimezone(UTC)


def inicio_del_dia(dia: date) -> datetime:
    """El primer instante de `dia` en Chile, EN UTC: el borde de un «hoy».

    Un día de Chile no es un día UTC (empieza a las 03:00 o 04:00 UTC) ni dura
    siempre 24 horas: el primer domingo de septiembre las 00:00 no existen y el
    día empieza a la 01:00 (-03). `zoneinfo` resuelve esa hora inexistente con el
    desfase anterior (-04), que es justamente ese instante.

    Se devuelve en UTC a propósito: un `datetime` en una hora inexistente no es
    igual a ningún otro de otra zona (PEP 495) y restar dos de la misma zona da
    horas de reloj, no transcurridas (24 h el día del cambio). En UTC, las dos
    cosas son de instantes.
    """
    return datetime.combine(dia, time.min, tzinfo=ZONA_CHILE).astimezone(UTC)

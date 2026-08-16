"""El reloj del producto es el de Chile.

TORDO es sólo para Chile: los plazos de Mercado Público, los envíos de correo,
el calendario de Celery y las cuotas diarias se cuentan en `America/Santiago`.
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

from datetime import date, datetime
from zoneinfo import ZoneInfo

ZONA_CHILE = ZoneInfo("America/Santiago")


def ahora_chile() -> datetime:
    """El instante actual, con la zona de Chile puesta."""
    return datetime.now(ZONA_CHILE)


def hoy_chile() -> date:
    """La fecha de hoy **para el usuario**, no para el servidor."""
    return ahora_chile().date()

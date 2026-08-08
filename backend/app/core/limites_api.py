"""Límite de peticiones por clave de API.

Por qué por CLAVE y no por IP
-----------------------------
El límite de BI es por IP, y para un navegador está bien: una IP es aproximadamente
una persona. Para la API pública no sirve en ninguno de los dos sentidos:

- **Castiga de más.** Un ERP integrado sale por una sola IP de oficina, así que
  todo el tráfico de la empresa cae en un mismo cubo y se limita como si fuera un
  usuario suelto.
- **Castiga de menos.** Quien quiera saltárselo sólo tiene que salir por varias
  IP, cosa que cualquier servidor puede hacer y un navegador no.

La clave, en cambio, **identifica a quien paga**: es la unidad con la que se
vende el acceso, y por eso es la unidad con la que se limita.

La ventana es de un minuto fijo, igual que la de BI
---------------------------------------------------
Fija, no deslizante: `INCR` sobre una clave que lleva el minuto dentro, y expira
sola. Un contador deslizante necesitaría guardar los tiempos de cada petición.

La contrapartida es real y conviene decirla: en el borde de dos minutos caben
hasta el doble del límite en un segundo. Para lo que esto protege —que una
integración mal escrita no tumbe la base— la simplicidad vale más que la
exactitud.

Falla abierto
-------------
Si Redis no responde, se deja pasar. Es la misma decisión que en el resto del
sistema: quedarse sin límite un rato es peor que dejar sin API a quien paga.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.plan_limits import get_quota, redis_client

logger = logging.getLogger(__name__)

#: Cuánto vive el contador. Un poco más que la ventana, para que un reloj
#: ligeramente desfasado no deje el cubo sin caducar.
TTL_SEGUNDOS = 90


@dataclass(frozen=True)
class Consumo:
    """Lo que se sabe del cubo de esta clave en este minuto."""

    limite: int
    usadas: int

    @property
    def restantes(self) -> int:
        return max(0, self.limite - self.usadas)

    @property
    def excedido(self) -> bool:
        return self.usadas > self.limite


def limite_del_tier(tier: str) -> int:
    """Peticiones por minuto que le tocan a ese plan.

    Vive en `PLAN_QUOTAS` junto al resto de límites y no en una tabla aparte: es
    una capacidad del plan, y tenerla en dos sitios es tenerla desincronizada.
    """
    return int(get_quota(tier)["api_requests_per_minute"])


def _cubo(identificador: str) -> str:
    minuto = datetime.now(UTC).strftime("%Y%m%d%H%M")
    return f"rl:api:{identificador}:{minuto}"


def consumir(identificador: str, tier: str) -> Consumo | None:
    """Suma una petición al cubo de esa clave. `None` si Redis no responde.

    `None` es «no se sabe», no «no hay consumo»: quien llama debe dejar pasar la
    petición y **no** anunciar cabeceras de límite que se estaría inventando.
    """
    limite = limite_del_tier(tier)
    try:
        r = redis_client()
        clave = _cubo(identificador)
        usadas = r.incr(clave)
        if usadas == 1:
            r.expire(clave, TTL_SEGUNDOS)
        return Consumo(limite=limite, usadas=int(usadas))
    except Exception as exc:
        logger.warning("Redis no responde (límite por clave): %s", exc)
        return None


def cabeceras(consumo: Consumo) -> dict[str, str]:
    """Las cabeceras estándar de límite.

    Se mandan **también cuando se deja pasar**: una integración sólo puede
    espaciarse si sabe cuánto le queda antes de que la corten, y enterarse por el
    429 es enterarse tarde.

    `Retry-After` no va aquí: en una respuesta correcta significaría «vuelve
    dentro de un minuto», que es lo contrario de lo que está pasando.
    """
    return {
        "X-RateLimit-Limit": str(consumo.limite),
        "X-RateLimit-Remaining": str(consumo.restantes),
    }

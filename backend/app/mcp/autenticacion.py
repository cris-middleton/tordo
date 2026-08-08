"""Quién llama al MCP, y con cargo a qué plan.

Vive aparte del servidor porque es lo que **no** se puede reimplementar. El ADR
0004 lo dice con un ejemplo propio: la fuga de `/licitacion-match` —un endpoint
Pro que no comprobaba el plan— salió de tener la autorización escrita a mano en
vez de declarada. Un MCP que repitiera esa lógica repetiría el riesgo en toda su
superficie.

Así que aquí no hay reglas nuevas: se llama a las mismas funciones que usa la
API. Lo único propio es leer la credencial de una cabecera HTTP que no pasa por
el enrutador de FastAPI.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import limites_api
from app.core.plan_limits import consumir_cuota_bi, effective_plan_tier
from app.models.empresa import Empresa
from app.services import api_keys

logger = logging.getLogger(__name__)


class ErrorDeAcceso(Exception):
    """Lo que el modelo verá como texto. Sin detalles: es una credencial."""


@dataclass(frozen=True)
class Llamante:
    """La empresa a cuyo nombre se hace la llamada, y su plan efectivo."""

    empresa: Empresa
    tier: str


def _credencial(cabeceras) -> str:
    """La clave del `Authorization: Bearer`.

    Sólo se acepta clave de API, no un JWT de sesión: el MCP es para clientes sin
    navegador, y un JWT de 30 minutos no sostiene una integración. Rechazarlo
    aquí evita además que alguien pegue su token de sesión en un cliente de
    terceros.
    """
    bruto = ""
    for nombre, valor in (cabeceras or {}).items():
        if nombre.lower() == "authorization":
            bruto = valor
            break

    if not bruto.lower().startswith("bearer "):
        raise ErrorDeAcceso(
            "Falta la credencial. Configura tu cliente MCP con la cabecera "
            "`Authorization: Bearer tordo_…` usando una clave de API."
        )

    token = bruto[7:].strip()
    if not api_keys.parece_clave(token):
        raise ErrorDeAcceso(
            "Esta credencial no es una clave de API. El MCP no acepta tokens de "
            "sesión: emite una clave en Configuración → Claves de API."
        )
    return token


async def resolver(db: AsyncSession, cabeceras) -> Llamante:
    """Verifica la clave y devuelve la empresa que fija.

    La empresa sale de la CLAVE, no de un parámetro. Es lo que hace que un
    modelo —que va a inventar identificadores en cuanto se lo pidan— no pueda
    pedir datos de otra cuenta: no hay ningún argumento con el que hacerlo.
    """
    token = _credencial(cabeceras)
    try:
        clave = await api_keys.verificar(db, token)
    except api_keys.ErrorDeClave as exc:
        raise ErrorDeAcceso(str(exc)) from exc

    empresa = await db.get(Empresa, clave.empresa_id)
    if empresa is None or not empresa.activo:
        raise ErrorDeAcceso("La empresa de esta clave ya no está activa.")

    tier = effective_plan_tier(empresa)

    # El mismo límite por minuto que la API. Sin cabeceras que devolver: el
    # protocolo no tiene dónde ponerlas, así que aquí sólo corta.
    consumo = limites_api.consumir(str(clave.id), tier)
    if consumo is not None and consumo.excedido:
        raise ErrorDeAcceso(
            f"Superaste el límite de {consumo.limite} peticiones por minuto de tu "
            f"plan. Espera un minuto antes de volver a preguntar."
        )

    await db.commit()  # `verificar` marca `ultimo_uso_en`
    return Llamante(empresa=empresa, tier=tier)


def cobrar_consulta(llamante: Llamante) -> None:
    """Descuenta una consulta de BI, con la misma regla que la API.

    Se cobra **por herramienta llamada**, no por conversación. Es lo que hace que
    la cuota siga significando lo mismo por los dos canales — y la razón de que
    las herramientas sean de grano grueso: un modelo encadena unas quince
    llamadas donde una persona hace tres.
    """
    consumir_cuota_bi(llamante.empresa)

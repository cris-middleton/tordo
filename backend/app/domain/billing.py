"""Puerto de cobro: qué necesita TORDO de una pasarela de pago.

Por qué existe
--------------
Hoy sólo hay Stripe, invocado directamente desde `api/billing.py` y
`api/webhooks.py`. Pero el ICP son PYMES chilenas a USD 25–55/mes, un segmento
que paga con tarjetas locales, débito Redcompra o transferencia. La pasarela
local entra en v1 (ADR 0005), y con Stripe cableado en los endpoints eso sería
cirugía en vez de un archivo nuevo.

Este módulo define el contrato en términos del negocio. `app/infra/billing/`
tiene las implementaciones.

Lo que este puerto NO hace
--------------------------
No finge que todas las pasarelas son iguales. Hay dos diferencias reales que se
declaran como capacidades en vez de esconderse:

- **`soporta_suscripcion_recurrente`** — Stripe cobra solo cada mes. Transbank
  WebPay es de pago único: para cobrar mensual hay que inscribir la tarjeta
  (Oneclick) o cobrar tú en cada periodo. Un puerto que lo ocultara haría que
  las suscripciones simplemente dejaran de renovarse en silencio.
- **`tiene_portal_de_gestion`** — Stripe hospeda un portal donde el cliente
  cambia de plan o cancela. Las pasarelas locales no, así que esa UI hay que
  construirla.

Quien consuma el puerto debe consultar esas capacidades, no asumirlas.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol, runtime_checkable

# Tipos de evento que el producto entiende, independientes del proveedor.
TipoEvento = Literal["activada", "actualizada", "cancelada", "pago_fallido"]

# Estados de suscripción que maneja el dominio (los mismos que guarda `empresas`).
EstadoSuscripcion = Literal["inactive", "trialing", "active", "past_due", "canceled"]


@dataclass(frozen=True)
class SesionDePago:
    """Lo que se le devuelve al frontend para que el usuario pague."""

    url: str
    referencia: str | None = None
    """Identificador del proveedor, cuando lo hay. Stripe devuelve el session id;
    Transbank, un token de transacción."""


@dataclass(frozen=True)
class EventoDeSuscripcion:
    """Un webhook ya traducido al lenguaje del dominio.

    `api/webhooks.py` opera sobre esto y no vuelve a saber de Stripe.
    """

    tipo: TipoEvento
    customer_id: str
    subscription_id: str | None = None
    plan_tier: str | None = None
    estado: EstadoSuscripcion | None = None
    empresa_id: str | None = None
    """Presente en el primer pago, cuando la empresa todavía no tiene guardado el
    customer_id y hay que localizarla por el metadata que se envió al iniciar."""


class ErrorDeCobro(Exception):
    """Fallo del proveedor. La capa de API lo traduce a un HTTP apropiado."""


@runtime_checkable
class ProveedorDePago(Protocol):
    """Lo que TORDO necesita de una pasarela.

    Implementarlo es lo único que hace falta para añadir Transbank, Flow o
    Khipu: ni `api/billing.py` ni `api/webhooks.py` cambian.
    """

    nombre: str
    soporta_suscripcion_recurrente: bool
    tiene_portal_de_gestion: bool

    def crear_o_recuperar_cliente(self, empresa, *, email_contacto: str | None = None) -> str:
        """Identificador de cliente del proveedor para esta empresa.

        El cliente representa a la EMPRESA, no al usuario: la suscripción es de
        ella y los usuarios son asientos (ADR 0002).
        """
        ...

    def iniciar_pago(
        self,
        empresa,
        *,
        plan_tier: str,
        periodo: Literal["monthly", "annual"],
        url_exito: str,
        url_cancelacion: str,
    ) -> SesionDePago:
        """Arranca un cobro y devuelve a dónde mandar al usuario."""
        ...

    def url_portal_de_gestion(self, customer_id: str, url_retorno: str) -> str | None:
        """Portal del proveedor para gestionar la suscripción.

        Devuelve None si el proveedor no tiene uno; en ese caso la aplicación
        debe ofrecer su propia UI de cambio de plan y cancelación.
        """
        ...

    def interpretar_webhook(
        self, payload: bytes, cabeceras: dict[str, str]
    ) -> EventoDeSuscripcion | None:
        """Verifica la firma y traduce el evento al dominio.

        Devuelve None si el evento es válido pero no interesa (cada pasarela
        emite decenas de tipos). Lanza `ErrorDeCobro` si la firma no valida:
        eso es un intento de suplantación, no un evento a ignorar.
        """
        ...

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
- **La fecha del periodo pagado.** Stripe la trae en la suscripción
  (`current_period_end`); MercadoPago, en `next_payment_date` del preapproval.
  Una pasarela de pago único no tendría ninguna, y ahí `cancelar_suscripcion`
  devuelve None: no hay periodo que respetar.

Quien consuma el puerto debe consultar esas capacidades, no asumirlas.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
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
    vigente_hasta: str | None = None
    """Fecha ISO-8601 hasta la que el periodo ya pagado sigue vigente, en un
    evento de cancelación.

    Existe porque `/billing/cancelar` no es el único camino por el que una
    suscripción muere: un cliente de MercadoPago puede cancelar desde la propia
    MercadoPago, sin pasar nunca por nuestro endpoint. Ese webhook es la ÚNICA
    notificación que llega, así que tiene que traer su propia fecha — la misma
    que `ProveedorDePago.cancelar_suscripcion` devuelve cuando cancela quien
    llama a nuestra API. None si el proveedor no la informó en el evento, o si
    el evento no es una cancelación."""


class ErrorDeCobro(Exception):
    """Fallo del proveedor. La capa de API lo traduce a un HTTP apropiado."""


def parsear_vigente_hasta(vigente_hasta: str) -> datetime:
    """Convierte la fecha ISO-8601 de la pasarela a un datetime aware en UTC.

    El puerto sólo promete "una fecha ISO-8601" (`cancelar_suscripcion`), no
    que siempre traiga el offset. Sin normalizar, un valor SIN offset se
    guarda tal cual en `plan_vigente_hasta` (`DateTime(timezone=True)`) — y
    Postgres interpreta un datetime naive según el *timezone de la sesión*,
    no como UTC. Si ese GUC no fuera UTC (aquí lo es, pero no es una garantía
    del esquema), la empresa conservaría el plan más o menos horas de las que
    le tocan, en silencio: nadie ve una excepción, sólo un dato corrido.

    Lanza `ValueError` si la cadena no es un ISO-8601 válido: no es
    responsabilidad de una función pura decidir si eso bloquea la
    cancelación o se trata como una fecha ausente — eso lo decide quien
    llama, que sabe si está respondiéndole a un usuario o procesando un
    webhook de fondo.
    """
    fecha = datetime.fromisoformat(vigente_hasta)
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=UTC)
    return fecha


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
        email_contacto: str | None = None,
    ) -> SesionDePago:
        """Arranca un cobro y devuelve a dónde mandar al usuario.

        `email_contacto` es el correo de quien inicia el pago. Stripe no lo
        necesita — el cliente ya lo lleva — pero MercadoPago sí: su `preapproval`
        identifica al pagador por correo en cada creación, no por un id de
        cliente. Sin este parámetro, una empresa que cancela y vuelve a
        suscribirse falla, porque para entonces el identificador guardado es el
        `payer_id` numérico y ya no sirve como correo.
        """
        ...

    def url_portal_de_gestion(self, customer_id: str, url_retorno: str) -> str | None:
        """Portal del proveedor para gestionar la suscripción.

        Devuelve None si el proveedor no tiene uno; en ese caso la aplicación
        debe ofrecer su propia UI de cambio de plan y cancelación.
        """
        ...

    def cancelar_suscripcion(self, subscription_id: str) -> str | None:
        """Cancela la suscripción en la pasarela.

        Devuelve la fecha ISO-8601 hasta la que el periodo YA PAGADO sigue
        vigente, o None si el proveedor no la informa.

        No es una capacidad opcional como `tiene_portal_de_gestion`: cobrar sin
        poder dejar de cobrar deja al cliente sin salida, y en Chile el mismo
        canal por el que se contrata tiene que servir para terminar.

        Devolver la fecha, y no un booleano, es lo que permite no cortar el
        acceso que el cliente ya pagó. Ver `plan_vigente_hasta` en la empresa.
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

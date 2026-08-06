"""Tests del puerto de cobro.

Lo que se verifica no es Stripe: es que **el producto no dependa de Stripe**. Si
estos tests pasan con un proveedor falso, añadir Transbank o Flow es escribir un
adaptador, no tocar los endpoints (ADR 0005).

No hacen red ni necesitan claves.
"""

from __future__ import annotations

import uuid
from typing import Literal

import pytest

from app.api.webhooks import aplicar_evento_de_suscripcion, buscar_empresa_del_evento
from app.domain.billing import (
    ErrorDeCobro,
    EventoDeSuscripcion,
    ProveedorDePago,
    SesionDePago,
)
from app.infra.billing import PROVEEDORES, obtener_proveedor
from app.infra.billing.stripe_adapter import StripeAdapter


class ProveedorFalso:
    """Una pasarela local imaginaria: cobro único y sin portal.

    Reproduce a propósito las dos diferencias reales con Stripe, que son las que
    un puerto mal diseñado escondería.
    """

    nombre = "falso"
    soporta_suscripcion_recurrente = False
    tiene_portal_de_gestion = False

    def __init__(self):
        self.pagos_iniciados: list[tuple[str, str]] = []

    def crear_o_recuperar_cliente(self, empresa, *, email_contacto=None) -> str:
        return f"cli_{empresa.rut_empresa}"

    def iniciar_pago(
        self,
        empresa,
        *,
        plan_tier: str,
        periodo: Literal["monthly", "annual"],
        url_exito: str,
        url_cancelacion: str,
    ) -> SesionDePago:
        self.pagos_iniciados.append((plan_tier, periodo))
        return SesionDePago(url=f"https://pasarela.cl/pagar/{plan_tier}", referencia="tok_123")

    def url_portal_de_gestion(self, customer_id: str, url_retorno: str) -> str | None:
        return None  # esta pasarela no hospeda portal

    def interpretar_webhook(self, payload: bytes, cabeceras: dict[str, str]):
        if cabeceras.get("x-firma") != "valida":
            raise ErrorDeCobro("firma inválida")
        if payload == b"ignorar":
            return None
        return EventoDeSuscripcion(
            tipo="activada", customer_id="cli_X", plan_tier="pro", estado="active"
        )


class _EmpresaFalsa:
    def __init__(self):
        self.id = uuid.uuid4()
        self.rut_empresa = "76543210-K"
        self.nombre_empresa = "Empresa Falsa"
        self.stripe_customer_id = None


# ── El contrato ──────────────────────────────────────────────────────────────


def test_el_proveedor_falso_cumple_el_puerto():
    """Si esto pasa, el puerto es implementable por algo que no es Stripe."""
    assert isinstance(ProveedorFalso(), ProveedorDePago)


def test_stripe_tambien_lo_cumple():
    assert isinstance(StripeAdapter(), ProveedorDePago)


def test_las_capacidades_se_declaran_y_difieren():
    """Que difieran es el punto: el puerto no finge que todas son iguales."""
    stripe, falso = StripeAdapter(), ProveedorFalso()
    assert stripe.soporta_suscripcion_recurrente is True
    assert falso.soporta_suscripcion_recurrente is False
    assert stripe.tiene_portal_de_gestion is True
    assert falso.tiene_portal_de_gestion is False


def test_un_proveedor_sin_portal_devuelve_none_y_no_revienta():
    assert ProveedorFalso().url_portal_de_gestion("cli_1", "https://x") is None


# ── Registro ─────────────────────────────────────────────────────────────────


def test_se_puede_registrar_un_proveedor_nuevo(monkeypatch):
    """Añadir una pasarela es registrar una clase; nada más."""
    from app.config import settings
    from app.infra import billing

    monkeypatch.setitem(PROVEEDORES, "falso", ProveedorFalso)
    monkeypatch.setattr(settings, "billing_provider", "falso")
    billing._limpiar_cache()
    try:
        assert obtener_proveedor().nombre == "falso"
    finally:
        billing._limpiar_cache()


def test_un_proveedor_desconocido_falla_con_mensaje_util(monkeypatch):
    from app.config import settings
    from app.infra import billing

    monkeypatch.setattr(settings, "billing_provider", "inexistente")
    billing._limpiar_cache()
    try:
        with pytest.raises(ErrorDeCobro) as exc:
            obtener_proveedor()
        assert "inexistente" in str(exc.value)
        assert "stripe" in str(exc.value)  # lista los disponibles
    finally:
        billing._limpiar_cache()


# ── Webhooks ─────────────────────────────────────────────────────────────────


def test_una_firma_invalida_es_un_error_no_un_evento_ignorado():
    """Tragarse una firma inválida sería aceptar eventos suplantados."""
    with pytest.raises(ErrorDeCobro):
        ProveedorFalso().interpretar_webhook(b"{}", {"x-firma": "falsa"})


def test_un_evento_que_no_interesa_devuelve_none():
    assert ProveedorFalso().interpretar_webhook(b"ignorar", {"x-firma": "valida"}) is None


def test_el_evento_llega_traducido_al_dominio():
    evento = ProveedorFalso().interpretar_webhook(b"{}", {"x-firma": "valida"})
    assert isinstance(evento, EventoDeSuscripcion)
    assert evento.tipo == "activada"
    assert evento.plan_tier == "pro"


# ── Efecto sobre la empresa ──────────────────────────────────────────────────


class _DBFalsa:
    """Sustituto mínimo de la sesión: sólo lo que usa buscar_empresa_del_evento."""

    def __init__(self, empresas):
        self._empresas = empresas
        self._filtro = None

    def query(self, _modelo):
        return self

    def filter(self, criterio):
        self._filtro = criterio
        return self

    def first(self):
        return self._empresas[0] if self._empresas else None


def test_el_primer_pago_localiza_la_empresa_por_el_metadata():
    """En el primer pago la empresa aún no tiene customer_id guardado: sin el
    empresa_id del metadata el cobro quedaría huérfano."""
    empresa = _EmpresaFalsa()
    evento = EventoDeSuscripcion(
        tipo="activada",
        customer_id="cli_nuevo",
        plan_tier="pro",
        empresa_id=str(empresa.id),
    )
    assert buscar_empresa_del_evento(_DBFalsa([empresa]), evento) is empresa


def test_un_empresa_id_corrupto_no_revienta():
    evento = EventoDeSuscripcion(tipo="activada", customer_id="", empresa_id="no-es-un-uuid")
    assert buscar_empresa_del_evento(_DBFalsa([]), evento) is None


@pytest.mark.parametrize(
    ("tipo", "plan_esperado", "estado_esperado"),
    [
        ("activada", "pro", "active"),
        ("cancelada", "basico", "canceled"),
        ("pago_fallido", None, "past_due"),
    ],
)
def test_cada_evento_deja_la_empresa_en_el_estado_correcto(
    monkeypatch, tipo, plan_esperado, estado_esperado
):
    empresa = _EmpresaFalsa()
    empresa.plan_tier = "pro" if tipo == "pago_fallido" else "basico"
    empresa.subscription_status = "active"
    empresa.stripe_subscription_id = "sub_1"

    class _Sesion:
        def query(self, _m):
            return self

        def filter(self, _c):
            return self

        def first(self):
            return empresa

        def commit(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr("app.api.webhooks.SyncSessionLocal", lambda: _Sesion())

    aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo=tipo,
            customer_id="cli_X",
            subscription_id="sub_2",
            plan_tier="pro" if tipo == "activada" else "basico",
            estado=estado_esperado,
        )
    )

    assert empresa.subscription_status == estado_esperado
    if plan_esperado is not None:
        assert empresa.plan_tier == plan_esperado
    if tipo == "cancelada":
        assert empresa.stripe_subscription_id is None

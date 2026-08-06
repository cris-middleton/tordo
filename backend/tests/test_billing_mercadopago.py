"""Tests del adaptador de MercadoPago (ADR 0008).

Sin red y sin credenciales: se sustituye `httpx.request`, que es el único punto
por el que el adaptador sale a internet.

Lo que se comprueba de verdad son las diferencias con Stripe, que es donde un
adaptador copiado del anterior se rompe en producción y no en los tests:

- la firma del webhook, que en MercadoPago cubre un manifiesto y no el cuerpo;
- que el webhook trae sólo un id y hay que ir a buscar el recurso;
- que el correo del pagador hace falta en CADA suscripción, no sólo en la primera.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from types import SimpleNamespace

import pytest

from app.domain.billing import ErrorDeCobro, ProveedorDePago
from app.infra.billing import PROVEEDORES, obtener_proveedor
from app.infra.billing.mercadopago_adapter import MercadoPagoAdapter

SECRETO = "secreto-de-webhook"


@pytest.fixture
def config(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "mercadopago_access_token", "TEST-token", raising=False)
    monkeypatch.setattr(settings, "mercadopago_webhook_secret", SECRETO, raising=False)
    monkeypatch.setattr(settings, "mercadopago_plan_pro", "plan-pro-mensual", raising=False)
    monkeypatch.setattr(settings, "mercadopago_plan_pro_annual", "plan-pro-anual", raising=False)
    monkeypatch.setattr(settings, "mercadopago_plan_enterprise", None, raising=False)
    return settings


@pytest.fixture
def empresa():
    return SimpleNamespace(
        id=uuid.uuid4(),
        rut_empresa="76543210-K",
        nombre_empresa="Constructora Test",
        billing_customer_id=None,
        billing_subscription_id=None,
        billing_provider=None,
    )


class RespuestaFalsa:
    def __init__(self, datos, status_code=200):
        self._datos = datos
        self.status_code = status_code
        self.text = json.dumps(datos)

    def json(self):
        return self._datos


@pytest.fixture
def red(monkeypatch):
    """Sustituye httpx.request y registra lo que se envió."""
    llamadas: list[dict] = []
    respuestas: dict[str, object] = {}

    def _request(metodo, url, **kwargs):
        llamadas.append({"metodo": metodo, "url": url, **kwargs})
        for fragmento, respuesta in respuestas.items():
            if fragmento in url:
                return respuesta
        return RespuestaFalsa({})

    monkeypatch.setattr("app.infra.billing.mercadopago_adapter.httpx.request", _request)
    return SimpleNamespace(llamadas=llamadas, respuestas=respuestas)


def firmar(cuerpo: dict, *, ts: str = "1700000000", request_id: str = "req-1", secreto=SECRETO):
    """Construye cuerpo y cabeceras como los manda MercadoPago."""
    payload = json.dumps(cuerpo).encode()
    recurso_id = str((cuerpo.get("data") or {}).get("id") or "")
    manifiesto = ""
    if recurso_id:
        manifiesto += f"id:{recurso_id};"
    if request_id:
        manifiesto += f"request-id:{request_id};"
    manifiesto += f"ts:{ts};"
    v1 = hmac.new(secreto.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()
    cabeceras = {"x-signature": f"ts={ts},v1={v1}", "x-request-id": request_id}
    return payload, cabeceras


# ── Contrato ─────────────────────────────────────────────────────────────────


def test_cumple_el_puerto():
    assert isinstance(MercadoPagoAdapter(), ProveedorDePago)


def test_declara_sus_capacidades_reales():
    mp = MercadoPagoAdapter()
    # Es la razón de elegirlo sobre Transbank Oneclick.
    assert mp.soporta_suscripcion_recurrente is True
    # Y esta es la que obliga a pantalla propia de cambio de plan.
    assert mp.tiene_portal_de_gestion is False
    assert mp.url_portal_de_gestion("cli_1", "https://x") is None


def test_es_el_proveedor_por_defecto(monkeypatch):
    from app.config import settings
    from app.infra.billing import _limpiar_cache

    assert PROVEEDORES["mercadopago"] is MercadoPagoAdapter
    monkeypatch.setattr(settings, "billing_provider", "mercadopago")
    _limpiar_cache()
    assert isinstance(obtener_proveedor(), MercadoPagoAdapter)
    _limpiar_cache()


# ── Configuración ────────────────────────────────────────────────────────────


def test_sin_token_el_error_dice_que_falta(config, monkeypatch, empresa):
    monkeypatch.setattr(config, "mercadopago_access_token", None)
    with pytest.raises(ErrorDeCobro, match="MERCADOPAGO_ACCESS_TOKEN"):
        MercadoPagoAdapter().iniciar_pago(
            empresa,
            plan_tier="pro",
            periodo="monthly",
            url_exito="https://x/ok",
            url_cancelacion="https://x/no",
            email_contacto="pago@empresa.cl",
        )


def test_un_plan_sin_configurar_dice_que_variable_falta(config, empresa):
    with pytest.raises(ErrorDeCobro, match="MERCADOPAGO_PLAN_ENTERPRISE"):
        MercadoPagoAdapter().iniciar_pago(
            empresa,
            plan_tier="enterprise",
            periodo="monthly",
            url_exito="https://x/ok",
            url_cancelacion="https://x/no",
            email_contacto="pago@empresa.cl",
        )


def test_un_periodo_invalido_se_rechaza(config, empresa):
    with pytest.raises(ErrorDeCobro, match="Periodo inválido"):
        MercadoPagoAdapter().iniciar_pago(
            empresa,
            plan_tier="pro",
            periodo="semanal",
            url_exito="https://x/ok",
            url_cancelacion="https://x/no",
            email_contacto="pago@empresa.cl",
        )


def test_un_error_de_mercadopago_conserva_el_detalle(config, red, empresa):
    red.respuestas["/preapproval"] = RespuestaFalsa(
        {"message": "preapproval_plan_id not found"}, status_code=404
    )
    with pytest.raises(ErrorDeCobro, match="404.*preapproval_plan_id not found"):
        MercadoPagoAdapter().iniciar_pago(
            empresa,
            plan_tier="pro",
            periodo="monthly",
            url_exito="https://x/ok",
            url_cancelacion="https://x/no",
            email_contacto="pago@empresa.cl",
        )


# ── Alta de suscripción ──────────────────────────────────────────────────────


def test_la_suscripcion_lleva_el_empresa_id_para_poder_reencontrarla(config, red, empresa):
    red.respuestas["/preapproval"] = RespuestaFalsa(
        {"id": "pre-1", "init_point": "https://mercadopago.cl/pagar/pre-1"}
    )
    sesion = MercadoPagoAdapter().iniciar_pago(
        empresa,
        plan_tier="pro",
        periodo="annual",
        url_exito="https://tordo.cl/ok",
        url_cancelacion="https://tordo.cl/no",
        email_contacto="pago@empresa.cl",
    )

    assert sesion.url == "https://mercadopago.cl/pagar/pre-1"
    assert sesion.referencia == "pre-1"

    enviado = red.llamadas[-1]["json"]
    assert enviado["preapproval_plan_id"] == "plan-pro-anual"
    assert enviado["payer_email"] == "pago@empresa.cl"
    assert enviado["back_url"] == "https://tordo.cl/ok"
    # Sin esto, un webhook que llegue antes de guardar el customer_id deja la
    # empresa sin identificar y el pago se pierde.
    assert enviado["external_reference"] == str(empresa.id)


def test_una_resuscripcion_usa_el_correo_y_no_el_payer_id_guardado(config, red, empresa):
    """La regresión que motivó pasar el correo por el puerto.

    Tras la primera autorización, `billing_customer_id` deja de ser un correo y
    pasa a ser el payer_id numérico. Deducir el correo de esa columna funcionaba
    sólo la primera vez: al cancelar y volver a suscribirse, fallaba.
    """
    empresa.billing_customer_id = "1234567890"  # payer_id que dejó el webhook
    red.respuestas["/preapproval"] = RespuestaFalsa({"id": "pre-2", "init_point": "https://x/2"})

    MercadoPagoAdapter().iniciar_pago(
        empresa,
        plan_tier="pro",
        periodo="monthly",
        url_exito="https://tordo.cl/ok",
        url_cancelacion="https://tordo.cl/no",
        email_contacto="otro@empresa.cl",
    )
    assert red.llamadas[-1]["json"]["payer_email"] == "otro@empresa.cl"


def test_sin_correo_no_se_inventa_un_pagador(config, red, empresa):
    empresa.billing_customer_id = "1234567890"
    with pytest.raises(ErrorDeCobro, match="correo del pagador"):
        MercadoPagoAdapter().iniciar_pago(
            empresa,
            plan_tier="pro",
            periodo="monthly",
            url_exito="https://x/ok",
            url_cancelacion="https://x/no",
        )


def test_no_se_crea_un_cliente_que_mercadopago_no_tiene(config, red, empresa):
    """`crear_o_recuperar_cliente` no debe llamar a la API.

    MercadoPago no tiene objeto cliente en el flujo de suscripción. Crear uno vía
    /v1/customers daría un id que ningún webhook menciona, y la búsqueda por
    billing_customer_id fallaría en silencio.
    """
    mp = MercadoPagoAdapter()
    assert mp.crear_o_recuperar_cliente(empresa, email_contacto="a@b.cl") == "a@b.cl"
    assert red.llamadas == []

    empresa.billing_customer_id = "1234567890"
    assert mp.crear_o_recuperar_cliente(empresa, email_contacto="a@b.cl") == "1234567890"
    assert red.llamadas == []


# ── Firma del webhook ────────────────────────────────────────────────────────


def test_una_firma_valida_se_acepta(config, red):
    red.respuestas["/preapproval/"] = RespuestaFalsa(
        {"id": "pre-1", "status": "authorized", "payer_id": 42, "external_reference": "emp-1"}
    )
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-1"}})
    evento = MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)
    assert evento is not None


def test_una_firma_falsificada_es_un_error_y_no_un_evento_ignorado(config, red):
    payload, cabeceras = firmar(
        {"type": "subscription_preapproval", "data": {"id": "pre-1"}}, secreto="otro-secreto"
    )
    # Tragarse esto en silencio dejaría activar suscripciones que nadie pagó.
    with pytest.raises(ErrorDeCobro, match="Firma de webhook inválida"):
        MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)
    assert red.llamadas == [], "no se debe consultar la API con una firma inválida"


def test_cambiar_el_id_del_recurso_invalida_la_firma(config, red):
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-1"}})
    manipulado = json.dumps(
        {"type": "subscription_preapproval", "data": {"id": "pre-999"}}
    ).encode()
    with pytest.raises(ErrorDeCobro, match="Firma de webhook inválida"):
        MercadoPagoAdapter().interpretar_webhook(manipulado, cabeceras)


def test_sin_cabecera_de_firma_se_rechaza(config, red):
    with pytest.raises(ErrorDeCobro, match="x-signature"):
        MercadoPagoAdapter().interpretar_webhook(b'{"type":"x"}', {})


def test_sin_secreto_configurado_se_rechaza(config, monkeypatch, red):
    monkeypatch.setattr(config, "mercadopago_webhook_secret", None)
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-1"}})
    with pytest.raises(ErrorDeCobro, match="MERCADOPAGO_WEBHOOK_SECRET"):
        MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)


def test_las_cabeceras_no_distinguen_mayusculas(config, red):
    red.respuestas["/preapproval/"] = RespuestaFalsa(
        {"id": "pre-1", "status": "authorized", "payer_id": 42, "external_reference": "emp-1"}
    )
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-1"}})
    mayusculas = {
        "X-Signature": cabeceras["x-signature"],
        "X-Request-Id": cabeceras["x-request-id"],
    }
    assert MercadoPagoAdapter().interpretar_webhook(payload, mayusculas) is not None


# ── Traducción de eventos ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "estado_mp,tipo_esperado,estado_esperado,plan_esperado",
    [
        ("authorized", "activada", "active", "pro"),
        ("cancelled", "cancelada", "canceled", "basico"),
        # Se pausa cuando el cobro falla repetidamente: se puede volver de ahí,
        # así que no se corta el acceso del todo.
        ("paused", "actualizada", "past_due", "pro"),
        ("pending", "actualizada", "inactive", "pro"),
    ],
)
def test_los_estados_se_traducen_al_dominio(
    config, red, estado_mp, tipo_esperado, estado_esperado, plan_esperado
):
    red.respuestas["/preapproval/"] = RespuestaFalsa(
        {
            "id": "pre-1",
            "status": estado_mp,
            "payer_id": 42,
            "external_reference": "11111111-1111-1111-1111-111111111111",
            "preapproval_plan_id": "plan-pro-mensual",
        }
    )
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-1"}})
    evento = MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)

    assert evento.tipo == tipo_esperado
    assert evento.estado == estado_esperado
    assert evento.plan_tier == plan_esperado
    assert evento.subscription_id == "pre-1"
    assert evento.customer_id == "42"
    # Recuperable en TODOS los eventos, no sólo en el primero: es la ventaja
    # sobre el metadata de Stripe.
    assert evento.empresa_id == "11111111-1111-1111-1111-111111111111"


def test_el_webhook_va_a_buscar_el_recurso_porque_no_viene_en_la_notificacion(config, red):
    red.respuestas["/preapproval/"] = RespuestaFalsa(
        {"id": "pre-7", "status": "authorized", "payer_id": 9, "external_reference": "emp"}
    )
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-7"}})
    MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)

    assert red.llamadas[-1]["metodo"] == "GET"
    assert red.llamadas[-1]["url"].endswith("/preapproval/pre-7")


def test_un_cobro_recurrente_rechazado_marca_past_due(config, red):
    red.respuestas["/authorized_payments/"] = RespuestaFalsa(
        {"id": "pay-1", "status": "rejected", "payer_id": 42, "preapproval_id": "pre-1"}
    )
    payload, cabeceras = firmar(
        {"type": "subscription_authorized_payment", "data": {"id": "pay-1"}}
    )
    evento = MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)
    assert evento.tipo == "pago_fallido"
    assert evento.estado == "past_due"
    assert evento.subscription_id == "pre-1"


def test_un_cobro_recurrente_exitoso_no_cambia_nada(config, red):
    red.respuestas["/authorized_payments/"] = RespuestaFalsa(
        {"id": "pay-2", "status": "approved", "payer_id": 42, "preapproval_id": "pre-1"}
    )
    payload, cabeceras = firmar(
        {"type": "subscription_authorized_payment", "data": {"id": "pay-2"}}
    )
    assert MercadoPagoAdapter().interpretar_webhook(payload, cabeceras) is None


@pytest.mark.parametrize(
    "cuerpo",
    [
        {"type": "payment", "data": {"id": "123"}},
        {"type": "chargebacks", "data": {"id": "123"}},
        {"type": "subscription_preapproval", "data": {}},
    ],
)
def test_lo_que_no_es_una_suscripcion_se_ignora_sin_error(config, red, cuerpo):
    payload, cabeceras = firmar(cuerpo)
    assert MercadoPagoAdapter().interpretar_webhook(payload, cabeceras) is None


def test_un_plan_desconocido_no_inventa_un_tier(config, red):
    """Si el plan no está en la configuración, mejor no tocar el tier.

    Adivinar 'pro' ascendería de plan a quien pagó otra cosa.
    """
    red.respuestas["/preapproval/"] = RespuestaFalsa(
        {
            "id": "pre-1",
            "status": "paused",
            "payer_id": 42,
            "external_reference": "emp",
            "preapproval_plan_id": "plan-que-nadie-configuro",
        }
    )
    payload, cabeceras = firmar({"type": "subscription_preapproval", "data": {"id": "pre-1"}})
    evento = MercadoPagoAdapter().interpretar_webhook(payload, cabeceras)
    assert evento.plan_tier is None
    assert evento.estado == "past_due"

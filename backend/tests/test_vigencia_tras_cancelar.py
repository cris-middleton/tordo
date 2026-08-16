"""El periodo ya pagado no se pierde al cancelar.

Sin esto, cancelar el día 3 de un mes pagado corta el acceso el día 3 — se cobró
el mes entero y se entregaron tres días. Es el tipo de detalle que no rompe
ningún test y sí genera una devolución.

Por qué no se usan `async_db` / `sample_empresa` directamente
---------------------------------------------------------------
`aplicar_evento_de_suscripcion` y `degradar_suscripciones_vencidas` abren su
PROPIA sesión síncrona (`SyncSessionLocal()` / `SessionLocal()`). Una fixture
creada por la transacción async del test no es visible desde esa sesión aparte:
sus filas están sólo *flusheadas*, no comprometidas, y una conexión distinta
no las ve. Se usa `sync_task_db` (`conftest.py`): una sesión síncrona atada a
la MISMA conexión, con un savepoint por test, cuyo `sessionmaker` se inyecta en
el módulo bajo prueba con `monkeypatch`. Así el `commit()`/`rollback()` interno
de la tarea sólo afecta al savepoint, no a la transacción del test.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.api import webhooks
from app.domain.billing import EventoDeSuscripcion
from app.models.empresa import Empresa
from app.tasks import trial_tasks


def _empresa_billing(session, **overrides) -> Empresa:
    """Empresa mínima para los tests de cobro, con los campos que hacen falta."""
    datos = {
        "id": uuid4(),
        "rut_empresa": f"{uuid4().int % 100_000_000}-K",
        "nombre_empresa": "Empresa de cobro",
        "estado_habil": "habil",
        "plan_tier": "basico",
        "subscription_status": "inactive",
    }
    datos.update(overrides)
    empresa = Empresa(**datos)
    session.add(empresa)
    session.flush()
    return empresa


def test_el_webhook_de_cancelacion_conserva_el_plan_hasta_la_fecha(sync_task_db, monkeypatch):
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="active",
        billing_customer_id="payer-1",
        plan_vigente_hasta=datetime.now(UTC) + timedelta(days=20),
    )
    monkeypatch.setattr(webhooks, "SyncSessionLocal", SessionLocal)

    webhooks.aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo="cancelada",
            customer_id="payer-1",
            subscription_id="preapproval-1",
            estado="canceled",
            empresa_id=str(empresa.id),
        )
    )
    session.refresh(empresa)

    assert empresa.subscription_status == "canceled"
    assert empresa.plan_tier == "pro", "se degradó de inmediato y el cliente perdió el mes que pagó"


def test_sin_fecha_de_vigencia_la_cancelacion_degrada_de_inmediato(sync_task_db, monkeypatch):
    """Una suscripción que nunca llegó a cobrarse no tiene periodo que respetar."""
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="active",
        billing_customer_id="payer-1",
        plan_vigente_hasta=None,
    )
    monkeypatch.setattr(webhooks, "SyncSessionLocal", SessionLocal)

    webhooks.aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo="cancelada",
            customer_id="payer-1",
            estado="canceled",
            empresa_id=str(empresa.id),
        )
    )
    session.refresh(empresa)

    assert empresa.plan_tier == "basico"


def test_una_cancelacion_que_no_paso_por_nuestro_endpoint_tambien_conserva_el_plan(
    sync_task_db, monkeypatch
):
    """Un cliente de MercadoPago puede cancelar desde la propia MercadoPago, sin
    pasar nunca por `/billing/cancelar`. Ese webhook es la ÚNICA notificación
    que llega, así que tiene que traer su propia fecha en `evento.vigente_hasta`
    — si no la usara, esta cancelación reproduciría exactamente el bug que esta
    tarea existe para cerrar."""
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="active",
        billing_customer_id="payer-2",
        plan_vigente_hasta=None,  # nunca pasó por /billing/cancelar
    )
    monkeypatch.setattr(webhooks, "SyncSessionLocal", SessionLocal)

    webhooks.aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo="cancelada",
            customer_id="payer-2",
            estado="canceled",
            empresa_id=str(empresa.id),
            vigente_hasta=(datetime.now(UTC) + timedelta(days=15)).isoformat(),
        )
    )
    session.refresh(empresa)

    assert empresa.subscription_status == "canceled"
    assert empresa.plan_tier == "pro", (
        "sin la fecha del evento, esta cancelación —que nunca pasó por "
        "/billing/cancelar— habría degradado de inmediato"
    )
    assert empresa.plan_vigente_hasta is not None


def test_una_fecha_de_vigencia_invalida_en_el_evento_se_trata_como_ausente(
    sync_task_db, monkeypatch
):
    """La pasarela mandó basura en `vigente_hasta`. Un webhook no tiene a quién
    devolverle un error —es una notificación de fondo, no una acción de un
    usuario esperando respuesta—, así que se registra y se degrada como si la
    fecha no hubiera llegado: la empresa igual queda `canceled`."""
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="active",
        billing_customer_id="payer-3",
        plan_vigente_hasta=None,
    )
    monkeypatch.setattr(webhooks, "SyncSessionLocal", SessionLocal)

    webhooks.aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo="cancelada",
            customer_id="payer-3",
            estado="canceled",
            empresa_id=str(empresa.id),
            vigente_hasta="no-es-una-fecha",
        )
    )
    session.refresh(empresa)

    assert empresa.subscription_status == "canceled"
    assert empresa.plan_tier == "basico"


def test_cancelar_y_resuscribirse_dentro_del_periodo_conserva_el_plan(sync_task_db, monkeypatch):
    """La secuencia completa del hallazgo: cancela, se arrepiente, el job corre
    después.

    Sin limpiar `plan_vigente_hasta` al reactivar, el job nocturno degradaría a
    una empresa que YA está pagando de nuevo en cuanto llegara la fecha vieja
    de la cancelación de la que se arrepintió — silenciosamente, en un job que
    corre a las 3 de la mañana.
    """
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="active",
        billing_customer_id="payer-4",
    )
    monkeypatch.setattr(webhooks, "SyncSessionLocal", SessionLocal)
    monkeypatch.setattr(trial_tasks, "SessionLocal", SessionLocal)

    # 1. Cancela a mitad de un periodo de 20 días ya pagado.
    webhooks.aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo="cancelada",
            customer_id="payer-4",
            subscription_id="preapproval-4",
            estado="canceled",
            empresa_id=str(empresa.id),
            vigente_hasta=(datetime.now(UTC) + timedelta(days=20)).isoformat(),
        )
    )
    session.refresh(empresa)
    assert empresa.plan_tier == "pro"
    assert empresa.plan_vigente_hasta is not None

    # 2. Se arrepiente y reactiva DENTRO del periodo de gracia.
    webhooks.aplicar_evento_de_suscripcion(
        EventoDeSuscripcion(
            tipo="activada",
            customer_id="payer-4",
            subscription_id="preapproval-5",
            plan_tier="pro",
            empresa_id=str(empresa.id),
        )
    )
    session.refresh(empresa)
    assert empresa.subscription_status == "active"
    assert empresa.plan_vigente_hasta is None, (
        "quedó colgada la fecha de la cancelación anterior: el job nocturno "
        "degradaría a una empresa que ya está pagando de nuevo"
    )

    # 3. El job corre, como lo haría cualquier noche, y no debe tocarla.
    trial_tasks.degradar_suscripciones_vencidas()
    session.refresh(empresa)
    assert empresa.plan_tier == "pro"


def test_el_job_degrada_cuando_la_fecha_pasa(sync_task_db, monkeypatch):
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="canceled",
        plan_vigente_hasta=datetime.now(UTC) - timedelta(minutes=1),
    )
    monkeypatch.setattr(trial_tasks, "SessionLocal", SessionLocal)

    resultado = trial_tasks.degradar_suscripciones_vencidas()
    session.refresh(empresa)

    assert empresa.plan_tier == "basico"
    assert empresa.plan_vigente_hasta is None
    assert resultado["degradadas"] >= 1


def test_el_job_no_toca_a_quien_sigue_en_su_periodo(sync_task_db, monkeypatch):
    session, SessionLocal = sync_task_db
    empresa = _empresa_billing(
        session,
        plan_tier="pro",
        subscription_status="canceled",
        plan_vigente_hasta=datetime.now(UTC) + timedelta(days=5),
    )
    monkeypatch.setattr(trial_tasks, "SessionLocal", SessionLocal)

    trial_tasks.degradar_suscripciones_vencidas()
    session.refresh(empresa)

    assert empresa.plan_tier == "pro"

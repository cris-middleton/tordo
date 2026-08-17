"""El barrido periódico que reintenta el correo de una alerta cuyo primer
intento falló.

`sent_at` significa lo mismo que en `services/notificaciones.py`: que el
correo salió, no que se intentó — ver ese módulo para la decisión completa.
Este archivo prueba la ventana de reintento (`_GRACIA_REINTENTO`,
`_VENTANA_REINTENTO`), no el envío en sí, que ya cubre `test_notificaciones.py`.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.models.alert import Alert, AlertType
from app.models.user import User
from app.services import notificaciones
from app.tasks import alert_tasks


def _usuario(session) -> User:
    sufijo = uuid.uuid4().hex[:8]
    usuario = User(
        username=f"user-{sufijo}",
        email=f"{sufijo}@pyme.cl",
        hashed_password="x",
        full_name="Test",
        is_active=True,
    )
    session.add(usuario)
    session.flush()
    return usuario


def _alerta_fallida(
    session,
    usuario: User,
    *,
    creada_hace: timedelta,
    tipo: AlertType = AlertType.ESTADO_HABIL_CAMBIO,
) -> Alert:
    """Una alerta cuyo correo ya falló una vez: `sent_at` en NULL, como la deja
    `_registrar_fallo_envio`. `created_at` se fija a mano para probar los
    bordes de la ventana de reintento sin esperar horas de verdad."""
    alerta = Alert(
        user_id=usuario.id,
        alert_type=tipo,
        entity_type="licitacion",
        entity_id=1,
        title="Cambio de estado hábil",
        message="Tu empresa pasó a inhábil.",
        notification_channels=["in_app"],
        sent_at=None,
        created_at=datetime.now(UTC) - creada_hace,
    )
    session.add(alerta)
    session.flush()
    return alerta


def test_reintenta_una_alerta_fuera_de_la_gracia_y_dentro_de_la_ventana(sync_task_db, monkeypatch):
    session, SessionLocal = sync_task_db
    monkeypatch.setattr(alert_tasks, "SessionLocal", SessionLocal)
    monkeypatch.setattr(notificaciones, "send_email", lambda **_: True)
    monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)

    usuario = _usuario(session)
    elegible = _alerta_fallida(session, usuario, creada_hace=timedelta(hours=1))

    resultado = alert_tasks.reintentar_notificaciones_fallidas()

    session.refresh(elegible)
    assert elegible.sent_at is not None
    assert resultado["candidatas"] == 1


def test_no_toca_una_alerta_recien_creada(sync_task_db, monkeypatch):
    """`_GRACIA_REINTENTO` evita competir con el despacho que ya está en curso
    para la misma alerta recién insertada — ese despacho es síncrono y dura
    segundos, así que unos minutos de margen bastan."""
    session, SessionLocal = sync_task_db
    monkeypatch.setattr(alert_tasks, "SessionLocal", SessionLocal)

    def _no_deberia_llamarse(**_):
        raise AssertionError("se despachó una alerta todavía dentro de la gracia")

    monkeypatch.setattr(notificaciones, "send_email", _no_deberia_llamarse)
    monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)

    usuario = _usuario(session)
    fresca = _alerta_fallida(session, usuario, creada_hace=timedelta(seconds=5))

    resultado = alert_tasks.reintentar_notificaciones_fallidas()

    session.refresh(fresca)
    assert fresca.sent_at is None
    assert resultado["candidatas"] == 0


def test_deja_de_reintentar_pasada_la_ventana(sync_task_db, monkeypatch):
    """Una dirección permanentemente inválida no puede generar un reintento
    para siempre: pasada `_VENTANA_REINTENTO` desde que se creó, la alerta deja
    de seleccionarse — la cola de candidatas no crece sin límite."""
    session, SessionLocal = sync_task_db
    monkeypatch.setattr(alert_tasks, "SessionLocal", SessionLocal)

    def _no_deberia_llamarse(**_):
        raise AssertionError("se reintentó una alerta más allá de la ventana de reintento")

    monkeypatch.setattr(notificaciones, "send_email", _no_deberia_llamarse)
    monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)

    usuario = _usuario(session)
    vencida = _alerta_fallida(session, usuario, creada_hace=timedelta(hours=7))

    resultado = alert_tasks.reintentar_notificaciones_fallidas()

    session.refresh(vencida)
    assert vencida.sent_at is None
    assert resultado["candidatas"] == 0


def test_una_alerta_sin_correo_no_se_selecciona(sync_task_db, monkeypatch):
    """`TENDER_UPDATE` es `SIN_CORREO`: nunca tuvo un correo que reintentar, y
    su `sent_at` se queda en NULL para siempre por diseño (ver
    `despachar_pendientes`). El barrido no debe tratarla como pendiente."""
    session, SessionLocal = sync_task_db
    monkeypatch.setattr(alert_tasks, "SessionLocal", SessionLocal)

    def _no_deberia_llamarse(**_):
        raise AssertionError("se intentó mandar un correo para un tipo SIN_CORREO")

    monkeypatch.setattr(notificaciones, "send_email", _no_deberia_llamarse)
    monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)

    usuario = _usuario(session)
    sin_correo = _alerta_fallida(
        session, usuario, creada_hace=timedelta(hours=1), tipo=AlertType.TENDER_UPDATE
    )

    resultado = alert_tasks.reintentar_notificaciones_fallidas()

    session.refresh(sin_correo)
    assert sin_correo.sent_at is None
    assert resultado["candidatas"] == 0

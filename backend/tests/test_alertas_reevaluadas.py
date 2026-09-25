"""Una licitación se evalúa dos veces: al entrar y cuando llega su detalle.

El listado de la API no trae monto, región ni descripción; el detalle sí. Al
evaluar sólo al insertar, una preferencia por región no calzaba NUNCA (la región
estaba vacía) y la descripción no contaba para las palabras clave. Ahora el ETL
vuelve a evaluar tras copiar el detalle — y para eso la alerta tiene que ser
idempotente por (licitación, preferencia): antes se habría mandado dos veces.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models.alert import Alert, AlertPreference
from app.models.licitacion import Licitacion
from app.models.user import User
from app.services import alert_engine
from app.services.alert_engine import AlertEngine


@pytest.fixture
def escenario(sync_task_db, monkeypatch):
    session, _ = sync_task_db
    monkeypatch.setattr(alert_engine, "despachar_alerta", lambda alerta, db: ["in_app"])

    usuario = User(username="alertas-re", email="re@x.cl", hashed_password="x", is_active=True)
    session.add(usuario)
    session.flush()
    por_palabra = AlertPreference(
        user_id=usuario.id, name="Aseo", keywords=["aseo"], is_active=True
    )
    por_region = AlertPreference(
        user_id=usuario.id,
        name="Biobío",
        regiones=["Región del Biobío"],
        is_active=True,
    )
    lic = Licitacion(
        codigo_externo="RE-1",
        nombre="Servicio de aseo",
        estado="Publicada",
        fecha_publicacion=datetime.now(UTC),
        activo=True,
    )
    session.add_all([por_palabra, por_region, lic])
    session.flush()
    return session, lic, por_palabra, por_region


def _alertas(session, lic):
    return session.query(Alert).filter(Alert.entity_id == lic.id).all()


def test_evaluar_dos_veces_no_duplica(escenario):
    session, lic, por_palabra, _ = escenario
    motor = AlertEngine(session)

    motor.process_new_licitacion(lic.id)
    motor.process_new_licitacion(lic.id)

    alertas = _alertas(session, lic)
    assert [a.alert_metadata["preference_id"] for a in alertas] == [por_palabra.id]


def test_la_region_que_trae_el_detalle_hace_calzar_su_preferencia(escenario):
    session, lic, por_palabra, por_region = escenario
    motor = AlertEngine(session)

    motor.process_new_licitacion(lic.id)  # al entrar: sin región
    assert {a.alert_metadata["preference_id"] for a in _alertas(session, lic)} == {por_palabra.id}

    lic.region = "Región del Biobío"  # lo que copia el detalle
    session.flush()
    motor.process_new_licitacion(lic.id)

    assert {a.alert_metadata["preference_id"] for a in _alertas(session, lic)} == {
        por_palabra.id,
        por_region.id,
    }

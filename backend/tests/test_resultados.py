"""El ciclo del resultado.

Lo que se prueba aquí no es «que se cree una alerta»: es que el producto **cierre
la historia que empezó él mismo**. Se avisaba de la oportunidad, se acompañaba la
preparación, y de cómo terminó no se decía nunca nada — con el dato disponible en
la misma API que ya consumimos.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.services import resultados

# ── Normalización del RUT ────────────────────────────────────────────────────
#
# Es la parte que decide si el usuario ve «ganaste» o «ganó otro», y falla en
# silencio: comparar las cadenas crudas da falsos negativos y el producto le
# diría a alguien que perdió una licitación que ganó.


class TestNormalizarRut:
    @pytest.mark.parametrize(
        "escrito",
        ["76.543.210-K", "76543210-K", "76543210K", " 76.543.210 - k "],
    )
    def test_todas_las_formas_de_escribirlo_coinciden(self, escrito):
        assert resultados._normalizar_rut(escrito) == "76543210K"

    def test_un_rut_vacio_no_se_parece_a_nada(self):
        assert resultados._normalizar_rut(None) == ""
        assert resultados._normalizar_rut("") == ""


class TestMonto:
    @pytest.mark.parametrize(
        ("crudo", "esperado"),
        [
            ("3100000", 3_100_000.0),
            ("$3.100.000", 3_100_000.0),
            ("3.100.000,50", 3_100_000.5),
            (2500000, 2_500_000.0),
            (None, None),
            ("", None),
            ("no es un monto", None),
        ],
    )
    def test_los_formatos_que_llegan_de_chilecompra(self, crudo, esperado):
        assert resultados._a_numero(crudo) == esperado


# ── Detección y cierre ───────────────────────────────────────────────────────


def _armar(session, *, rut_empresa: str, proveedor: str, monto: str, estado="en_seguimiento"):
    from app.models.empresa import Empresa, EmpresaUsuario
    from app.models.licitacion import Licitacion
    from app.models.licitacion_detalle import LicitacionDetalle
    from app.models.postulacion import Postulacion
    from app.models.user import User

    usuario = User(
        email=f"u{uuid4().hex[:8]}@pyme.cl",
        username=f"u{uuid4().hex[:8]}",
        hashed_password="x",
        is_active=True,
    )
    session.add(usuario)
    session.flush()

    empresa = Empresa(
        id=uuid4(),
        rut_empresa=rut_empresa,
        nombre_empresa="PYME de prueba",
        estado_habil="habil",
    )
    session.add(empresa)
    session.flush()
    session.add(EmpresaUsuario(id=uuid4(), user_id=usuario.id, empresa_id=empresa.id, rol="owner"))

    lic = Licitacion(
        codigo_externo=f"LIC-{uuid4().hex[:6]}",
        nombre="Mantención de equipos",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=40),
        fecha_cierre=datetime.now(UTC) - timedelta(days=5),
        estado="Adjudicada",
        activo=True,
    )
    session.add(lic)
    session.flush()

    session.add(
        LicitacionDetalle(
            licitacion_id=lic.id,
            codigo_externo=lic.codigo_externo,
            fecha_adjudicacion=datetime.now(UTC) - timedelta(days=1),
            proveedor_adjudicado=proveedor,
            monto_adjudicado=monto,
        )
    )
    postulacion = Postulacion(
        id=uuid4(), empresa_id=empresa.id, licitacion_id=lic.id, estado=estado
    )
    session.add(postulacion)
    session.flush()
    return empresa, lic, postulacion, usuario


def test_detecta_que_gano_otro(sync_task_db):
    session, _ = sync_task_db
    _armar(
        session,
        rut_empresa="76543210-K",
        proveedor="99888777-6 CONSTRUCTORA RIVAL LTDA",
        monto="$3.100.000",
    )

    (r,) = resultados.detectar_resultados(session)

    assert r.gano_la_empresa is False
    assert r.monto == 3_100_000.0
    assert "RIVAL" in r.proveedor


def test_detecta_que_gano_la_empresa_aunque_el_rut_venga_con_puntos(sync_task_db):
    """El RUT del ganador llega dentro del nombre del proveedor y con el formato
    que le dé la gana a ChileCompra. Sin normalizar, esto daría «perdiste»."""
    session, _ = sync_task_db
    _armar(
        session,
        rut_empresa="76543210-K",
        proveedor="76.543.210-K PYME DE PRUEBA SPA",
        monto="2900000",
    )

    (r,) = resultados.detectar_resultados(session)

    assert r.gano_la_empresa is True


def test_una_postulacion_descartada_no_se_resuelve(sync_task_db):
    """Descartarla es una decisión del usuario. Reabrirla por detrás para
    contarle cómo terminó sería reescribirle su propia decisión."""
    session, _ = sync_task_db
    _armar(
        session,
        rut_empresa="76543210-K",
        proveedor="OTRA EMPRESA",
        monto="1000000",
        estado="descartada",
    )

    assert resultados.detectar_resultados(session) == []


def test_sin_adjudicacion_conocida_no_hay_resultado(sync_task_db):
    from app.models.licitacion_detalle import LicitacionDetalle

    session, _ = sync_task_db
    _, lic, _, _ = _armar(session, rut_empresa="76543210-K", proveedor="OTRA", monto="1000000")
    detalle = (
        session.query(LicitacionDetalle).filter(LicitacionDetalle.licitacion_id == lic.id).one()
    )
    detalle.fecha_adjudicacion = None
    session.flush()

    assert resultados.detectar_resultados(session) == []


def test_cerrar_deja_la_postulacion_en_su_estado_final(sync_task_db, monkeypatch):
    from app.models.alert import Alert
    from app.models.postulacion import Postulacion

    session, _ = sync_task_db
    monkeypatch.setattr(
        resultados.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    _, _, postulacion, _ = _armar(
        session,
        rut_empresa="76543210-K",
        proveedor="76.543.210-K PYME DE PRUEBA SPA",
        monto="2900000",
    )

    resumen = resultados.revisar_resultados(session)

    assert resumen["resueltas"] == 1
    assert session.query(Postulacion).filter_by(id=postulacion.id).one().estado == "adjudicada"
    alerta = session.query(Alert).one()
    assert "Ganaste" in alerta.title
    assert alerta.alert_metadata["gano"] is True


def test_no_avisa_dos_veces_del_mismo_resultado(sync_task_db, monkeypatch):
    """Un resultado ocurre UNA vez. La clave de idempotencia no lleva la fecha a
    propósito: con ella, cada corrida diaria volvería a avisar de lo mismo."""
    from app.models.alert import Alert

    session, _ = sync_task_db
    monkeypatch.setattr(
        resultados.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    _armar(session, rut_empresa="76543210-K", proveedor="OTRA EMPRESA", monto="1000000")

    resultados.revisar_resultados(session)
    antes = session.query(Alert).count()
    resultados.revisar_resultados(session)

    assert session.query(Alert).count() == antes


def test_avisa_a_todo_el_equipo(sync_task_db, monkeypatch):
    """`alerts.user_id` es de usuario y la postulación es de la empresa: sin una
    alerta por miembro, sólo se entera quien la creó."""
    from app.models.alert import Alert
    from app.models.empresa import EmpresaUsuario
    from app.models.user import User

    session, _ = sync_task_db
    monkeypatch.setattr(
        resultados.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    empresa, _, _, _ = _armar(
        session, rut_empresa="76543210-K", proveedor="OTRA EMPRESA", monto="1000000"
    )
    socio = User(
        email=f"s{uuid4().hex[:8]}@pyme.cl",
        username=f"s{uuid4().hex[:8]}",
        hashed_password="x",
        is_active=True,
    )
    session.add(socio)
    session.flush()
    session.add(EmpresaUsuario(id=uuid4(), user_id=socio.id, empresa_id=empresa.id, rol="admin"))
    session.flush()

    resultados.revisar_resultados(session)

    assert session.query(Alert).count() == 2

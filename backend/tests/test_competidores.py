"""Seguimiento de competidores.

La competencia ofrece esto mismo. Lo que se prueba aquí son las dos cosas que
convierten «te avisamos cuando gane» en algo usable y no en spam: que la primera
corrida **no** dispare el historial completo, y que dos corridas no avisen dos
veces de la misma orden.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.models.competidor import normalizar_rut
from app.services import competidores


class TestNormalizarRut:
    @pytest.mark.parametrize(
        "escrito", ["76.543.210-K", "76543210-K", "76543210K", " 76.543.210 - k "]
    )
    def test_todas_las_formas_coinciden(self, escrito):
        """En la base conviven las tres escrituras según el mes de ingesta. Sin
        normalizar, el seguimiento no encuentra nada y **falla en silencio**:
        nunca avisa, y no hay forma de notar que está roto."""
        assert normalizar_rut(escrito) == "76543210K"


def _empresa_con_usuario(session):
    from app.models.empresa import Empresa, EmpresaUsuario
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
        id=uuid4(), rut_empresa="11111111-1", nombre_empresa="PYME", estado_habil="habil"
    )
    session.add(empresa)
    session.flush()
    session.add(EmpresaUsuario(id=uuid4(), user_id=usuario.id, empresa_id=empresa.id, rol="owner"))
    session.flush()
    return empresa, usuario


def _seguir(session, empresa, rut="99888777-6", visto=None):
    from app.models.competidor import CompetidorSeguido

    seguido = CompetidorSeguido(
        empresa_id=empresa.id,
        rut=rut,
        rut_norm=normalizar_rut(rut),
        nombre="Constructora Rival",
        ultimo_visto_en=visto,
    )
    session.add(seguido)
    session.flush()
    return seguido


def _orden(session, *, rut_proveedor: str, dias_atras: int, monto: float = 4_200_000):
    from app.models.orden_compra import OrdenCompra

    orden = OrdenCompra(
        codigo_oc=f"OC-{uuid4().hex[:8]}",
        nombre="Suministro de insumos",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=dias_atras),
        monto_total=monto,
        rut_proveedor=rut_proveedor,
        nombre_proveedor="CONSTRUCTORA RIVAL LTDA",
        nombre_organismo="Municipalidad de Talca",
    )
    session.add(orden)
    session.flush()
    return orden


def test_encuentra_lo_que_gano_el_competidor(sync_task_db):
    session, _ = sync_task_db
    empresa, _ = _empresa_con_usuario(session)
    _seguir(session, empresa, visto=datetime.now(UTC) - timedelta(days=30))
    _orden(session, rut_proveedor="99.888.777-6", dias_atras=2)

    (hallazgo,) = competidores.detectar(session)

    assert hallazgo.monto == 4_200_000
    assert hallazgo.organismo == "Municipalidad de Talca"


def test_el_rut_se_compara_normalizado_en_los_dos_lados(sync_task_db):
    """El seguimiento se guarda como el usuario lo escribió y la orden llega
    como venga de ChileCompra. Si la comparación no normaliza ambos, no
    coinciden nunca."""
    session, _ = sync_task_db
    empresa, _ = _empresa_con_usuario(session)
    _seguir(session, empresa, rut="99888777-6", visto=datetime.now(UTC) - timedelta(days=30))
    _orden(session, rut_proveedor="99.888.777-6", dias_atras=1)

    assert len(competidores.detectar(session)) == 1


def test_lo_anterior_a_la_marca_no_se_avisa(sync_task_db):
    """Es lo que separa «acaba de ganar» de «ha ganado alguna vez». Sin la marca,
    empezar a seguir a un proveedor grande dispararía cientos de avisos de
    golpe — y el usuario apagaría las alertas, no el seguimiento."""
    session, _ = sync_task_db
    empresa, _ = _empresa_con_usuario(session)
    _seguir(session, empresa, visto=datetime.now(UTC) - timedelta(days=3))
    _orden(session, rut_proveedor="99888777-6", dias_atras=10)  # anterior a la marca

    assert competidores.detectar(session) == []


def test_no_avisa_dos_veces_de_la_misma_orden(sync_task_db, monkeypatch):
    from app.models.alert import Alert

    session, _ = sync_task_db
    monkeypatch.setattr(
        competidores.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )
    empresa, _ = _empresa_con_usuario(session)
    _seguir(session, empresa, visto=datetime.now(UTC) - timedelta(days=30))
    _orden(session, rut_proveedor="99888777-6", dias_atras=2)

    competidores.revisar_competidores(session)
    antes = session.query(Alert).count()
    competidores.revisar_competidores(session)

    assert antes == 1
    assert session.query(Alert).count() == antes


def test_la_marca_avanza_hasta_la_orden_mas_reciente(sync_task_db, monkeypatch):
    from app.models.competidor import CompetidorSeguido

    session, _ = sync_task_db
    monkeypatch.setattr(
        competidores.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )
    empresa, _ = _empresa_con_usuario(session)
    seguido = _seguir(session, empresa, visto=datetime.now(UTC) - timedelta(days=30))
    _orden(session, rut_proveedor="99888777-6", dias_atras=8)
    reciente = _orden(session, rut_proveedor="99888777-6", dias_atras=1)

    competidores.revisar_competidores(session)

    al_dia = session.query(CompetidorSeguido).filter_by(id=seguido.id).one()
    assert al_dia.ultimo_visto_en == reciente.fecha_publicacion


def test_se_corta_para_que_el_correo_se_pueda_leer(sync_task_db):
    """Un proveedor grande gana decenas de órdenes en una semana. Un correo con
    cuarenta líneas no se lee: se archiva."""
    session, _ = sync_task_db
    empresa, _ = _empresa_con_usuario(session)
    _seguir(session, empresa, visto=datetime.now(UTC) - timedelta(days=60))
    for i in range(competidores.TOPE_POR_COMPETIDOR + 4):
        _orden(session, rut_proveedor="99888777-6", dias_atras=i + 1)

    assert len(competidores.detectar(session)) == competidores.TOPE_POR_COMPETIDOR


def test_sin_competidores_no_hace_nada(sync_task_db):
    session, _ = sync_task_db
    assert competidores.detectar(session) == []
    assert competidores.revisar_competidores(session)["alertas"] == 0

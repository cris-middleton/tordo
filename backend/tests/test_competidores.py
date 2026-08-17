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


def test_el_filtro_de_rut_compara_la_columna_generada_no_una_expresion():
    """Regresión de rendimiento, no de resultado.

    `regexp_replace(upper(rut_proveedor), ...) = :r` en el WHERE devuelve lo
    mismo que comparar contra `rut_proveedor_norm`, pero un índice normal sobre
    `rut_proveedor` no sirve para lo primero: envolver la columna en una
    expresión la vuelve un recorrido completo de `ordenes_compra` cada mañana,
    una vez por competidor vigilado. Se comprueba en el SQL compilado, porque
    el resultado no distingue las dos formas — sólo el plan de ejecución lo
    hace, y eso es justo lo que se rompería en silencio si alguien revierte
    esto a la expresión."""
    condicion = competidores._condicion_rut("99888777K")
    sql = str(condicion.compile(compile_kwargs={"literal_binds": True})).lower()

    assert "rut_proveedor_norm" in sql
    assert "regexp_replace" not in sql
    assert "upper(" not in sql


def test_una_colision_de_idempotencia_no_aborta_el_lote(sync_task_db, monkeypatch):
    """Antes: `SELECT` por la clave y luego `INSERT` si no aparecía. Con dos
    corridas cruzadas, el `SELECT` de la segunda no ve el `INSERT` recién hecho
    por la primera (MVCC), las dos intentan insertar la misma clave, y el
    `UNIQUE` de `idempotency_key` tumba el `commit()` final — **el lote
    entero**, no sólo la fila repetida.

    Aquí se simula la colisión sin dos conexiones reales: se intercepta
    `AlertEngine.create_alert_idempotent` (que hace `ON CONFLICT DO NOTHING`
    de verdad) para que devuelva `None` en la primera orden, como si otra
    corrida ya la hubiera insertado. Si alguien vuelve al patrón
    `SELECT`-luego-`INSERT`, este test dejará de llamar al helper y el conteo
    de alertas no bajará a 1: fallará.
    """
    session, _ = sync_task_db
    empresa, _ = _empresa_con_usuario(session)
    _seguir(session, empresa, visto=datetime.now(UTC) - timedelta(days=30))
    o1 = _orden(session, rut_proveedor="99888777-6", dias_atras=3)
    o2 = _orden(session, rut_proveedor="99888777-6", dias_atras=1)

    llamadas: list[int] = []
    original = competidores.AlertEngine.create_alert_idempotent

    def espia(self, **kwargs):
        llamadas.append(kwargs["entity_id"])
        if kwargs["entity_id"] == o1.id:
            return None  # ya insertada por "otra corrida"
        return original(self, **kwargs)

    monkeypatch.setattr(competidores.AlertEngine, "create_alert_idempotent", espia)
    monkeypatch.setattr(
        competidores.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    resumen = competidores.revisar_competidores(session)  # no debe lanzar IntegrityError

    assert sorted(llamadas) == sorted([o1.id, o2.id])
    assert resumen["adjudicaciones"] == 2
    assert resumen["alertas"] == 1

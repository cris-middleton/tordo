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
from app.utils.rut import calcular_dv


def _rut(numero: str) -> str:
    """Un RUT con dígito verificador REAL, calculado por la misma utilidad
    que usa producción. Los tests de `_ruts_del_proveedor` dependen de que el
    verificador sea correcto —es lo que la función exige para aceptar un
    candidato—, así que hardcodear uno a mano arriesga un typo de aritmética
    silencioso."""
    return f"{numero}-{calcular_dv(numero)}"


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


def _armar(
    session,
    *,
    rut_empresa: str,
    proveedor: str,
    monto: str,
    estado="en_seguimiento",
    fecha_adjudicacion: datetime | None = None,
):
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
            fecha_adjudicacion=fecha_adjudicacion or (datetime.now(UTC) - timedelta(days=1)),
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
        rut_empresa=_rut("76543210"),
        proveedor=f"{_rut('99888777')} CONSTRUCTORA RIVAL LTDA",
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
        rut_empresa=_rut("76543210"),
        proveedor="76.543.210-3 PYME DE PRUEBA SPA",
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
        rut_empresa=_rut("76543210"),
        proveedor="OTRA EMPRESA",
        monto="1000000",
        estado="descartada",
    )

    assert resultados.detectar_resultados(session) == []


def test_sin_adjudicacion_conocida_no_hay_resultado(sync_task_db):
    from app.models.licitacion_detalle import LicitacionDetalle

    session, _ = sync_task_db
    _, lic, _, _ = _armar(session, rut_empresa=_rut("76543210"), proveedor="OTRA", monto="1000000")
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
        rut_empresa=_rut("76543210"),
        proveedor="76.543.210-3 PYME DE PRUEBA SPA",
        monto="2900000",
    )

    resumen = resultados.revisar_resultados(session)

    assert resumen["resueltas"] == 1
    assert resumen["corregidas"] == 0
    assert session.query(Postulacion).filter_by(id=postulacion.id).one().estado == "adjudicada"
    alerta = session.query(Alert).one()
    assert "Ganaste" in alerta.title
    assert alerta.alert_metadata["gano"] is True


def test_no_avisa_dos_veces_del_mismo_resultado(sync_task_db, monkeypatch):
    """Un resultado ocurre UNA vez. La clave de idempotencia no lleva la fecha a
    propósito: con ella, cada corrida diaria volvería a avisar de lo mismo.

    También cubre el caso 3 de `emitir_y_cerrar`: la postulación queda
    resuelta y DENTRO de la ventana de reconsideración, así que
    `detectar_resultados` la vuelve a traer al segundo `revisar_resultados` —
    y aun así no debe avisar de nuevo, porque el resultado no cambió."""
    from app.models.alert import Alert

    session, _ = sync_task_db
    monkeypatch.setattr(
        resultados.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    _armar(session, rut_empresa=_rut("76543210"), proveedor="OTRA EMPRESA", monto="1000000")

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
        session, rut_empresa=_rut("76543210"), proveedor="OTRA EMPRESA", monto="1000000"
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


# ── El RUT ganador: forma válida y COINCIDENCIA EXACTA, no contención ───────
#
# Antes: `rut_empresa in rut_ganador` sobre el campo COMPLETO despojado de
# todo lo que no fuera dígito o "K" (razón social incluida). Dos RUT
# distintos podían "coincidir" con que uno apareciera dentro del otro, sin
# compartir ni el prefijo — un año, un número de calle o el RUT de OTRA
# empresa citado en el texto bastaban. Esto le decía a una empresa que ganó
# algo que no ganó.


class TestRutsDelProveedor:
    def test_campo_vacio_o_nulo_no_encuentra_nada(self):
        assert resultados._ruts_del_proveedor(None) == set()
        assert resultados._ruts_del_proveedor("") == set()

    def test_una_razon_social_con_digitos_que_no_tienen_forma_de_rut(self):
        """Un número de calle u oficina no es un RUT: no llega a 7 dígitos
        seguidos, así que ni siquiera se propone como candidato."""
        texto = "CONSTRUCTORA CAMINO LAS FLORES 245, OFICINA 12 SPA"

        assert resultados._ruts_del_proveedor(texto) == set()

    def test_un_digito_verificador_k_se_reconoce(self):
        rut = _rut("15000005")  # dv real = K
        assert rut.endswith("-K")

        encontrados = resultados._ruts_del_proveedor(f"{rut} MI EMPRESA SPA")

        assert resultados._normalizar_rut(rut) in encontrados

    def test_dos_ruts_que_comparten_prefijo_no_se_confunden(self):
        """`12345678` y `12345671` comparten los primeros 7 dígitos. La
        contención vieja los habría podido cruzar; la igualdad exacta, no."""
        rut_empresa = _rut("12345678")
        rut_en_el_texto = _rut("12345671")
        assert rut_en_el_texto != rut_empresa

        encontrados = resultados._ruts_del_proveedor(f"{rut_en_el_texto} OTRA RAZON SOCIAL SPA")

        assert resultados._normalizar_rut(rut_empresa) not in encontrados
        assert resultados._normalizar_rut(rut_en_el_texto) in encontrados

    def test_un_campo_con_nombre_y_numero_encuentra_igual_el_rut(self):
        """Nombre, un número que NO es RUT (un año) y el RUT real, todo junto."""
        rut = _rut("76543210")
        texto = f"CONSTRUCTORA RIVAL LTDA, ADJUDICADO EL AÑO 2024 POR {rut}"

        assert resultados._normalizar_rut(rut) in resultados._ruts_del_proveedor(texto)

    def test_el_bug_original_no_reaparece(self):
        """Reproduce, verificado a mano contra el código viejo, el caso que
        rompía `in`: el RUT completo de la empresa aparece como SUBCADENA
        dentro de un teléfono u otro número más largo, sin relación real con
        quién ganó. Con `rut_empresa in rut_ganador` sobre el campo entero
        despojado de todo lo que no fuera dígito, esto daba `True`."""
        rut_empresa = _rut("76543210")
        normalizado = resultados._normalizar_rut(rut_empresa)
        # Un teléfono de 10 dígitos que CONTIENE los 9 dígitos del RUT de la
        # empresa a partir de la segunda posición.
        telefono = f"4{normalizado}"
        assert normalizado in telefono  # confirma que el viejo `in` habría dado True
        texto = f"OTRA EMPRESA SPA, FONO {telefono}"

        encontrados = resultados._ruts_del_proveedor(texto)

        assert normalizado not in encontrados


def test_gano_la_empresa_con_una_razon_social_que_trae_digitos(sync_task_db):
    """De punta a punta, a través de `detectar_resultados`: la razón social
    trae dígitos que no son un RUT, y no debe confundirse con nada."""
    session, _ = sync_task_db
    _armar(
        session,
        rut_empresa=_rut("76543210"),
        proveedor="CONSTRUCTORA CAMINO LAS FLORES 245, OFICINA 12 SPA",
        monto="1000000",
    )

    (r,) = resultados.detectar_resultados(session)

    assert r.gano_la_empresa is False


def test_gano_la_empresa_no_se_confunde_por_un_telefono_que_contiene_el_rut(sync_task_db):
    """El caso que reproducía el bug original de punta a punta: bajo
    `rut_empresa in rut_ganador` sobre el campo completo, un teléfono que
    CONTIENE el RUT de la empresa como subcadena daba «ganaste» sin que la
    empresa tuviera nada que ver con esa licitación."""
    session, _ = sync_task_db
    rut_empresa = _rut("76543210")
    telefono = f"4{resultados._normalizar_rut(rut_empresa)}"
    _armar(
        session,
        rut_empresa=rut_empresa,
        proveedor=f"OTRA EMPRESA SPA, FONO {telefono}",
        monto="1000000",
    )

    (r,) = resultados.detectar_resultados(session)

    assert r.gano_la_empresa is False


def test_gano_la_empresa_no_se_confunde_por_un_rut_con_prefijo_compartido(sync_task_db):
    session, _ = sync_task_db
    _armar(
        session,
        rut_empresa=_rut("12345678"),
        proveedor=f"{_rut('12345671')} OTRA RAZON SOCIAL SPA",
        monto="1000000",
    )

    (r,) = resultados.detectar_resultados(session)

    assert r.gano_la_empresa is False


# ── Corrección dentro de la ventana de reconsideración ──────────────────────


def test_una_correccion_dentro_de_la_ventana_reabre_y_avisa_de_nuevo(sync_task_db, monkeypatch):
    """ChileCompra revoca y readjudica: la postulación ya estaba resuelta
    como «perdiste», y una nueva pasada la corrige a «ganaste»."""
    from app.models.alert import Alert
    from app.models.licitacion_detalle import LicitacionDetalle
    from app.models.postulacion import Postulacion

    session, _ = sync_task_db
    monkeypatch.setattr(
        resultados.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    rut_empresa = _rut("76543210")
    _, lic, postulacion, _ = _armar(
        session,
        rut_empresa=rut_empresa,
        proveedor="OTRA EMPRESA",
        monto="1000000",
        fecha_adjudicacion=datetime.now(UTC) - timedelta(days=10),
    )

    primer_resumen = resultados.revisar_resultados(session)
    assert primer_resumen["resueltas"] == 1
    assert session.query(Postulacion).filter_by(id=postulacion.id).one().estado == "no_adjudicada"

    # ChileCompra corrige: ahora gana la empresa que sigue la licitación.
    detalle = (
        session.query(LicitacionDetalle).filter(LicitacionDetalle.licitacion_id == lic.id).one()
    )
    detalle.proveedor_adjudicado = f"{rut_empresa} PYME DE PRUEBA SPA"
    session.flush()

    segundo_resumen = resultados.revisar_resultados(session)

    assert segundo_resumen["resueltas"] == 0
    assert segundo_resumen["corregidas"] == 1
    assert session.query(Postulacion).filter_by(id=postulacion.id).one().estado == "adjudicada"
    # Por id y no por `created_at`: las dos alertas nacen en la misma
    # transacción, y `now()` es constante dentro de una — empataban y el orden
    # quedaba al azar. Falló así en un `make ci`.
    alertas = session.query(Alert).order_by(Alert.id).all()
    assert len(alertas) == 2
    assert "orrección" in alertas[-1].title


def test_fuera_de_la_ventana_no_se_reconsidera(sync_task_db, monkeypatch):
    """Pasados los `VENTANA_RECONSIDERACION_DIAS`, una postulación ya
    resuelta se da por firme — aunque el dato subyacente cambie."""
    from app.models.alert import Alert
    from app.models.licitacion_detalle import LicitacionDetalle
    from app.models.postulacion import Postulacion

    session, _ = sync_task_db
    monkeypatch.setattr(
        resultados.notificaciones, "despachar_pendientes", lambda db, ids: {"en_tanda": len(ids)}
    )

    rut_empresa = _rut("76543210")
    fecha_vieja = datetime.now(UTC) - timedelta(days=resultados.VENTANA_RECONSIDERACION_DIAS + 5)
    _, lic, postulacion, _ = _armar(
        session,
        rut_empresa=rut_empresa,
        proveedor="OTRA EMPRESA",
        monto="1000000",
        fecha_adjudicacion=fecha_vieja,
    )

    resultados.revisar_resultados(session)
    assert session.query(Postulacion).filter_by(id=postulacion.id).one().estado == "no_adjudicada"

    detalle = (
        session.query(LicitacionDetalle).filter(LicitacionDetalle.licitacion_id == lic.id).one()
    )
    detalle.proveedor_adjudicado = f"{rut_empresa} PYME DE PRUEBA SPA"
    session.flush()

    # Fuera de la ventana: `detectar_resultados` ni siquiera la vuelve a traer.
    assert resultados.detectar_resultados(session) == []

    resultados.revisar_resultados(session)

    assert session.query(Postulacion).filter_by(id=postulacion.id).one().estado == "no_adjudicada"
    assert session.query(Alert).count() == 1

"""Estado hábil sin fuente configurada.

El módulo dependía de un CSV masivo que no existe, y la variable que lo apuntaba
venía vacía por defecto, así que el job devolvía `{"skipped": True}` en cada
corrida y **nadie se enteraba**: un skip no es un error, no aparece en Sentry, y
el panel simplemente mostraba `desconocido` para siempre.

El fallo de fondo no era la fuente que falta. Era que faltaba **en silencio**.

Estos tests fijan lo contrario: sin fuente, el job falla de forma visible y dice
exactamente qué configurar. Cuando exista `MERCADO_PUBLICO_TICKET`, se reemplaza
`test_sin_ticket_el_job_falla_de_forma_visible` por la verificación real contra
la API — ver `consultar_rut`.

Ronda de revisión (2026-08-16): tres huecos más, todos de la misma familia —
un valor no vacío que igual significa "no configurado" (el placeholder de
`.env.example`), una respuesta HTTP documentada que igual se colaba
(`203 Ticket no válido`), y un default silencioso dentro del parseo
(`Listado` vacío → `no_encontrado`, sin haberlo visto nunca en una respuesta
real). Los tests de abajo fijan las tres correcciones.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.models.alert import Alert
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User
from app.services import estado_habil_service as svc


class _RespuestaFalsa:
    """Doble liviano de `requests.Response`: no se le pega a la red real."""

    def __init__(self, status_code: int, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_sin_ticket_consultar_rut_lo_dice_en_vez_de_adivinar(monkeypatch):
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "", raising=False)
    with pytest.raises(svc.FuenteNoConfigurada) as exc:
        svc.consultar_rut("76543210-K")
    assert "MERCADO_PUBLICO_TICKET" in str(exc.value), (
        "el error tiene que nombrar la variable que falta; si no, quien lo lea "
        "no sabe qué hacer con él"
    )


def test_sin_ticket_el_job_falla_de_forma_visible(monkeypatch, sync_task_db):
    """El job NO puede devolver `skipped`: eso es lo que escondió el fallo un año."""
    from app.tasks import estado_habil_tasks

    session, SessionLocal = sync_task_db
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "", raising=False)
    monkeypatch.setattr(estado_habil_tasks, "SessionLocal", SessionLocal)

    with pytest.raises(svc.FuenteNoConfigurada):
        estado_habil_tasks.check_estado_habil()


def test_la_feature_apagada_sigue_siendo_un_skip_legitimo(monkeypatch):
    """Apagar algo a propósito no es lo mismo que no haberlo configurado."""
    from app.config import settings
    from app.tasks import estado_habil_tasks

    monkeypatch.setattr(settings, "feature_estado_habil", False)
    assert estado_habil_tasks.check_estado_habil() == {"skipped": True}


def test_no_queda_rastro_del_CSV():
    """Trinquete: el descargador y su variable se fueron, y no vuelven de copia-pega."""
    from app.config import settings

    assert not hasattr(settings, "estado_habil_csv_url")
    assert not hasattr(svc, "_download_csv")
    assert not hasattr(svc, "_lookup_rut_in_rows")


def test_el_plan_free_no_vende_el_monitor_de_estado_habil():
    """No se vende una capacidad que responde `desconocido` siempre.

    Es el mismo principio que `test_contrato_bi.py`: si una capacidad se anuncia
    en `/billing/plans`, tiene que existir.
    """
    from app.api.billing import PLANS

    for plan in PLANS:
        assert not any("estado hábil" in f.lower() for f in plan.features), (
            f"el plan '{plan.id}' sigue vendiendo el monitor de estado hábil"
        )


def test_placeholder_de_env_example_cuenta_como_no_configurado(monkeypatch):
    """`your-ticket-here` es el marcador que trae `.env.example`, no un ticket
    real. Si alguien lo copia tal cual a su `.env` (que es exactamente lo que
    documenta `docs/deploy_steps/tareas_manuales.md` §2 que pasa hoy), el
    chequeo tiene que verlo tan no-configurado como una cadena vacía."""
    monkeypatch.setattr(
        svc.settings, "mercado_publico_ticket", svc.TICKET_PLACEHOLDER, raising=False
    )
    with pytest.raises(svc.FuenteNoConfigurada) as exc:
        svc.consultar_rut("76543210-K")
    assert "MERCADO_PUBLICO_TICKET" in str(exc.value)


def test_el_placeholder_declarado_coincide_con_env_example():
    """Trinquete: si el placeholder cambia en `.env.example` sin tocar el
    código, este chequeo se queda ciego otra vez — el mismo bug que esta tarea
    cerró, sólo que para el ticket en vez del CSV."""
    repo_root = Path(__file__).resolve().parents[2]
    contenido = (repo_root / ".env.example").read_text()
    linea = next(
        fila for fila in contenido.splitlines() if fila.startswith("MERCADO_PUBLICO_TICKET=")
    )
    valor_en_env_example = linea.split("=", 1)[1].strip()
    assert valor_en_env_example == svc.TICKET_PLACEHOLDER


def test_203_ticket_no_valido_es_error_de_consulta(monkeypatch):
    """`203` es la forma documentada en que esta API avisa un ticket inválido
    (comprobado en vivo, ver tareas_manuales.md §1). No puede colarse como un
    200 cualquiera: el mensaje además nombra al ticket como sospechoso."""
    monkeypatch.setattr(
        svc.settings, "mercado_publico_ticket", "un-ticket-cualquiera", raising=False
    )
    monkeypatch.setattr(svc.requests, "get", lambda *a, **k: _RespuestaFalsa(203))

    with pytest.raises(svc.ErrorDeConsulta) as exc:
        svc.consultar_rut("76543210-K")
    assert "ticket" in str(exc.value).lower()


# ── La forma REAL de BuscarProveedor (contrastada en vivo el 2026-09-24) ─────
#
# No trae ningún estado de habilidad: sólo si el RUT está inscrito. Los tests
# que había aquí fijaban una forma supuesta (`Listado[0].Estado`) que la API no
# devuelve nunca, así que en producción TODA consulta terminaba en error.

INSCRITO = {
    "Cantidad": 1,
    "FechaCreacion": "2026-09-25T02:51:19.4155404Z",
    "listaEmpresas": [{"CodigoEmpresa": "141927", "NombreEmpresa": "PRONOMED SPA"}],
}
NO_INSCRITO = {"Codigo": 10200, "Mensaje": "No hay resultados de empresas."}


def test_un_rut_inscrito_es_inscrito_no_habil():
    """La API confirma la inscripción; la habilidad sólo la ve el proveedor."""
    assert svc._estado_de_respuesta(INSCRITO) == svc.ESTADO_INSCRITO


def test_sin_resultados_es_no_encontrado():
    assert svc._estado_de_respuesta(NO_INSCRITO) == svc.ESTADO_NO_ENCONTRADO


def test_una_forma_desconocida_no_adivina():
    for rara in ({"algoDistinto": True}, {"listaEmpresas": []}, {"Listado": [{"Estado": "Hábil"}]}):
        with pytest.raises(svc.ErrorDeConsulta):
            svc._estado_de_respuesta(rara)


@pytest.mark.parametrize("entrada", ["76286670-6", "76.286.670-6", "762866706", " 76.286.670-6 "])
def test_el_rut_va_con_puntos(entrada):
    """Sin puntos la API responde «no hay resultados» también a un inscrito."""
    assert svc._formatear_rut(entrada) == "76.286.670-6"


def test_rut_corto_y_con_k():
    assert svc._formatear_rut("1234567-k") == "1.234.567-K"


def test_no_inscrito_llega_como_500_y_no_es_un_error(monkeypatch):
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "t", raising=False)
    monkeypatch.setattr(svc.requests, "get", lambda *a, **k: _RespuestaFalsa(500, NO_INSCRITO))
    assert svc.consultar_rut("11.111.111-1") == svc.ESTADO_NO_ENCONTRADO


def test_otro_500_si_es_un_error(monkeypatch):
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "t", raising=False)
    monkeypatch.setattr(
        svc.requests, "get", lambda *a, **k: _RespuestaFalsa(500, {"Codigo": 99, "Mensaje": "x"})
    )
    with pytest.raises(svc.ErrorDeConsulta):
        svc.consultar_rut("76.286.670-6")


# ── El job ───────────────────────────────────────────────────────────────────


def _empresa(session, rut: str, estado: str = "desconocido"):
    usuario = User(username=f"u{rut}", email=f"{rut}@x.cl", hashed_password="x", is_active=True)
    empresa = Empresa(rut_empresa=rut, nombre_empresa=f"E {rut}", estado_habil=estado)
    session.add_all([usuario, empresa])
    session.flush()
    session.add(EmpresaUsuario(user_id=usuario.id, empresa_id=empresa.id, rol="owner"))
    session.flush()
    return empresa


def _alertas_de(session, empresa):
    return session.query(Alert).filter(Alert.empresa_id == empresa.id).all()


def test_una_consulta_fallida_no_tumba_la_corrida(monkeypatch, sync_task_db):
    session, _ = sync_task_db
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "t", raising=False)
    monkeypatch.setattr(svc.notificaciones, "despachar_pendientes", lambda *a, **k: {})
    falla = _empresa(session, "11.111.111-1")
    bien = _empresa(session, "76.286.670-6")

    def consultar(rut):
        if rut == falla.rut_empresa:
            raise svc.ErrorDeConsulta("caída")
        return svc.ESTADO_INSCRITO

    monkeypatch.setattr(svc, "consultar_rut", consultar)

    resumen = svc.run_estado_habil_check(session)

    assert resumen["fallidas"] >= 1
    session.refresh(bien)
    assert bien.estado_habil == svc.ESTADO_INSCRITO


def test_confirmar_la_inscripcion_no_es_noticia(monkeypatch, sync_task_db):
    """`desconocido` → `inscrito` es la primera consulta: avisar sería ruido."""
    session, _ = sync_task_db
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "t", raising=False)
    monkeypatch.setattr(svc.notificaciones, "despachar_pendientes", lambda *a, **k: {})
    monkeypatch.setattr(svc, "consultar_rut", lambda rut: svc.ESTADO_INSCRITO)
    empresa = _empresa(session, "76.286.670-6")

    svc.run_estado_habil_check(session)

    assert _alertas_de(session, empresa) == []


def test_dejar_de_figurar_si_avisa(monkeypatch, sync_task_db):
    session, _ = sync_task_db
    monkeypatch.setattr(svc.settings, "mercado_publico_ticket", "t", raising=False)
    monkeypatch.setattr(svc.notificaciones, "despachar_pendientes", lambda *a, **k: {})
    monkeypatch.setattr(svc, "consultar_rut", lambda rut: svc.ESTADO_NO_ENCONTRADO)
    empresa = _empresa(session, "76.286.670-6", estado="inscrito")

    svc.run_estado_habil_check(session)

    alertas = _alertas_de(session, empresa)
    assert len(alertas) == 1
    assert "no figura en el Registro de Proveedores" in alertas[0].message

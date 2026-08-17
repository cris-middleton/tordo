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


def test_estado_de_respuesta_reconoce_habil():
    assert svc._estado_de_respuesta({"Listado": [{"Estado": "Hábil"}]}) == svc.ESTADO_HABIL


def test_estado_de_respuesta_reconoce_inhabil():
    assert svc._estado_de_respuesta({"Listado": [{"Estado": "Inhábil"}]}) == svc.ESTADO_INHABIL


def test_estado_de_respuesta_listado_vacio_no_adivina():
    """Un `Listado` vacío es, en teoría, una instancia bien formada de la forma
    documentada — pero nadie la ha visto en una respuesta real, y podría
    significar 'no existe', un RUT malformado, o una cuota agotada. Como
    `_create_estado_habil_alert` dispara ante CUALQUIER cambio de estado,
    adivinar mal acá manda una alerta falsa a toda la empresa. Se prefiere
    fallar y confirmar con un ticket real antes de mapear esto a
    `no_encontrado`."""
    with pytest.raises(svc.ErrorDeConsulta):
        svc._estado_de_respuesta({"Listado": []})


def test_estado_de_respuesta_sin_listado_no_adivina():
    with pytest.raises(svc.ErrorDeConsulta):
        svc._estado_de_respuesta({"algoDistinto": True})


def test_estado_de_respuesta_estado_no_reconocido_no_adivina():
    with pytest.raises(svc.ErrorDeConsulta):
        svc._estado_de_respuesta({"Listado": [{"Estado": "Pendiente"}]})

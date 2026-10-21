"""Un ticket rechazado hace FALLAR la corrida: `/fail` y salida distinta de cero.

**Por qué existe.** Con un ticket falso, `python -m etl.cron frecuente --forzar`
terminaba «bien» y daba el latido en verde:

- la API clásica responde **HTTP 203** —un 2xx— con
  `{"Codigo": 203, "Mensaje": "Ticket no válido."}`, y el extractor lo leía como
  «0 registros»;
- Compra Ágil responde 401 con `{"success": "NOK", "errors": [...]}`, que se
  registraba como error y se devolvía `None`.

Las dos formas se verificaron en vivo (2026-10-12) y son las que se simulan aquí.
Un ticket vencido dejaría el catálogo congelado sin que nadie se enterase.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
import requests

from etl import cron
from etl.config import config as etl_config
from etl.extractors.base import CredencialRechazada
from etl.extractors.compra_agil import CompraAgilExtractor
from etl.extractors.mercado_publico_licitaciones import MercadoPublicoLicitacionesExtractor
from etl.loaders.database_loader_v2 import DatabaseLoaderV2

URL_LATIDO = "https://hc-ping.com/prueba"
TICKET = "TICKET-DE-PRUEBA-NO-SE-IMPRIME"

#: Lo que responde la API clásica a un ticket inválido, verificado en vivo.
CLASICA_TICKET_INVALIDO = (203, {"Codigo": 203, "Mensaje": "Ticket no válido."})
#: Lo que responde Compra Ágil, verificado en vivo.
AGIL_TICKET_INVALIDO = (
    401,
    {
        "success": "NOK",
        "trace": None,
        "payload": None,
        "errors": [
            {
                "codigo": "401",
                "mensaje": "El ticket no existe, es inválido o no tiene permisos.",
                "detalle": None,
            }
        ],
    },
)


class _Respuesta:
    def __init__(self, estado: int, cuerpo):
        self.status_code = estado
        self._cuerpo = cuerpo

    def json(self):
        return self._cuerpo

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code}", response=self)


class _API:
    """`requests.get` falso: responde según el host y cuenta las llamadas."""

    def __init__(self, clasica=(200, {"Cantidad": 0, "Listado": []}), agil=None):
        self.clasica = clasica
        self.agil = agil or (200, {"success": "OK", "payload": {"resultados": []}})
        self.llamadas: list[str] = []

    def __call__(self, url, params=None, headers=None, timeout=None):
        self.llamadas.append(url)
        estado, cuerpo = self.agil if "api2." in url else self.clasica
        return _Respuesta(estado, cuerpo)


def _clasica():
    return MercadoPublicoLicitacionesExtractor(
        {
            "MERCADO_PUBLICO_URL": "https://api.mercadopublico.cl",
            "MERCADO_PUBLICO_TICKET": TICKET,
            "MAX_RETRIES": 3,
            "RETRY_DELAY": 0,
        }
    )


def _agil():
    return CompraAgilExtractor({"COMPRA_AGIL_TICKET": TICKET, "MAX_RETRIES": 3, "RETRY_DELAY": 0})


# ── Los extractores ──────────────────────────────────────────────────────────


def test_la_clasica_con_203_lanza_y_no_reintenta(monkeypatch):
    api = _API(clasica=CLASICA_TICKET_INVALIDO)
    monkeypatch.setattr(requests, "get", api)
    with pytest.raises(CredencialRechazada, match="Ticket no válido"):
        _clasica().extract(fecha_desde="2026-10-09", fecha_hasta="2026-10-09")
    # Un ticket inválido no se arregla reintentando: una sola petición.
    assert len(api.llamadas) == 1


@pytest.mark.parametrize("estado", [401, 403])
def test_la_clasica_con_401_o_403_lanza(monkeypatch, estado):
    monkeypatch.setattr(requests, "get", _API(clasica=(estado, {})))
    with pytest.raises(CredencialRechazada):
        _clasica().extract_detalle_licitacion("1057401-1-LP24")


def test_la_clasica_sin_datos_no_es_un_rechazo(monkeypatch):
    """Un día sin licitaciones sigue siendo un día sin licitaciones."""
    monkeypatch.setattr(requests, "get", _API())
    assert _clasica().extract(fecha_desde="2026-10-09", fecha_hasta="2026-10-09") == []


@pytest.mark.parametrize("respuesta", [AGIL_TICKET_INVALIDO, (403, {})])
def test_compra_agil_con_401_o_403_lanza(monkeypatch, respuesta):
    monkeypatch.setattr(requests, "get", _API(agil=respuesta))
    with pytest.raises(CredencialRechazada, match="ticket"):
        _agil().extract(
            cambio_desde=datetime(2026, 10, 11, 10), cambio_hasta=datetime(2026, 10, 11, 12)
        )


def test_el_mensaje_no_lleva_el_ticket(monkeypatch):
    monkeypatch.setattr(requests, "get", _API(clasica=CLASICA_TICKET_INVALIDO))
    with pytest.raises(CredencialRechazada) as exc:
        _clasica().extract(fecha_desde="2026-10-09", fecha_hasta="2026-10-09")
    assert TICKET not in str(exc.value)


# ── La corrida entera ────────────────────────────────────────────────────────


class _Latido:
    def __init__(self):
        self.peticiones: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.peticiones.append(request)
        return httpx.Response(200)

    def urls(self) -> list[str]:
        return [str(p.url) for p in self.peticiones]


def _frecuente_real(monkeypatch, api: _API):
    """`ejecutar` con los pasos REALES del ETL; sólo la red es falsa.

    Sin base a propósito: con el rechazo bien propagado nada llega a conectar, y
    si llegara, el `/fail` no diría `CredencialRechazada` y el test lo vería (en
    vez de colgarse esperando una base que no está).
    """

    def sin_base(self):
        raise RuntimeError("este test no tiene base de datos")

    monkeypatch.setattr(DatabaseLoaderV2, "connect", sin_base)
    monkeypatch.setattr(requests, "get", api)
    monkeypatch.setattr(etl_config, "MERCADO_PUBLICO_TICKET", TICKET)
    monkeypatch.setattr(etl_config, "COMPRA_AGIL_TICKET", "")
    latido = _Latido()
    codigo = cron.ejecutar(
        "frecuente",
        forzar=True,
        ahora=lambda: datetime(2026, 10, 13, 16, 0, tzinfo=UTC),  # no es la primera del día
        latido=cron.Latido(URL_LATIDO, httpx.Client(transport=httpx.MockTransport(latido))),
    )
    return codigo, latido


@pytest.mark.parametrize(
    "api",
    [
        _API(agil=AGIL_TICKET_INVALIDO, clasica=CLASICA_TICKET_INVALIDO),
        # Aunque sólo una de las dos lo rechace.
        _API(agil=AGIL_TICKET_INVALIDO),
    ],
    ids=["las-dos", "solo-compra-agil"],
)
def test_frecuente_con_el_ticket_rechazado_falla_y_lo_dice(monkeypatch, api):
    codigo, latido = _frecuente_real(monkeypatch, api)
    assert codigo != 0
    assert latido.urls() == [f"{URL_LATIDO}/start", f"{URL_LATIDO}/fail"]
    cuerpo = latido.peticiones[-1].content.decode()
    assert "CredencialRechazada" in cuerpo
    assert TICKET not in cuerpo


def test_frecuente_con_la_clasica_rechazada_tambien_falla(monkeypatch):
    codigo, latido = _frecuente_real(monkeypatch, _API(clasica=CLASICA_TICKET_INVALIDO))
    assert codigo != 0
    assert latido.urls()[-1] == f"{URL_LATIDO}/fail"
    assert "CredencialRechazada" in latido.peticiones[-1].content.decode()


def test_semanal_con_r2_rechazando_las_credenciales_falla(monkeypatch):
    """La semanal no usa el ticket —la descarga masiva es pública—: su
    credencial es la de R2, y un rechazo de R2 tampoco puede dar verde."""

    def bajar():
        raise RuntimeError("An error occurred (AccessDenied) when calling ListObjectsV2")

    pasos = cron.PasosSemanal(
        bajar=bajar,
        purgar=lambda periodos: {},
        descargar=lambda periodos, con_datos: True,
        analytics=lambda: [],
        materializar=lambda: cron.Materializacion(hechas=[], fallidas=[]),
        subir=lambda: 0,
        retener=lambda instante: None,
    )
    latido = _Latido()
    codigo = cron.ejecutar(
        "semanal",
        ahora=lambda: datetime(2026, 10, 11, 6, 0, tzinfo=UTC),
        corridas={"semanal": lambda instante: cron.correr_semanal(instante, pasos)},
        latido=cron.Latido(URL_LATIDO, httpx.Client(transport=httpx.MockTransport(latido))),
    )
    assert codigo != 0
    assert latido.urls()[-1] == f"{URL_LATIDO}/fail"
    assert "AccessDenied" in latido.peticiones[-1].content.decode()

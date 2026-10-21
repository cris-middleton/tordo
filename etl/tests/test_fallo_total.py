"""Un fallo TOTAL hace fallar la corrida; uno aislado, no.

**Por qué existe.** Con la API caída o la base sin escribir, los cron terminaban
bien y el latido daba verde:

- la API clásica sin responder: `_make_request` devolvía `None` cada día y el
  listado salía vacío, «0 registros»;
- Compra Ágil sin responder la primera página: un ERROR en el log y `[]`;
- `load_licitaciones` con todas las tandas fallidas: devolvía 0 y el ETL decía
  «completed successfully».

Lo aislado (un día de varios, una hora de veintiséis, una tanda de varias) se
sigue tolerando: lo recoge la pasada siguiente. Nada de red ni de base.
"""

from __future__ import annotations

from datetime import datetime

import pytest
import requests
from sqlalchemy.exc import OperationalError

from etl import main as etl_main
from etl.extractors import compra_agil as modulo_agil
from etl.extractors import mercado_publico_licitaciones as modulo_clasica
from etl.extractors.base import ConsultaFallida
from etl.extractors.compra_agil import CompraAgilExtractor
from etl.extractors.mercado_publico_licitaciones import MercadoPublicoLicitacionesExtractor
from etl.loaders.database_loader_v2 import CargaFallida, DatabaseLoaderV2


@pytest.fixture(autouse=True)
def _sin_esperas(monkeypatch):
    monkeypatch.setattr(modulo_clasica.time, "sleep", lambda _s: None)
    monkeypatch.setattr(modulo_agil.time, "sleep", lambda _s: None)


class _Respuesta:
    def __init__(self, estado: int, cuerpo):
        self.status_code = estado
        self._cuerpo = cuerpo

    def json(self):
        return self._cuerpo

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code}", response=self)


def _clasica():
    return MercadoPublicoLicitacionesExtractor(
        {
            "MERCADO_PUBLICO_URL": "https://api.mercadopublico.cl",
            "MERCADO_PUBLICO_TICKET": "T",
            "MAX_RETRIES": 2,
            "RETRY_DELAY": 0,
        }
    )


def _agil():
    return CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T", "MAX_RETRIES": 2, "RETRY_DELAY": 0})


LICITACION = {"CodigoExterno": "1-1-LE26", "Nombre": "Algo", "CodigoEstado": 5}


# ── La API clásica ───────────────────────────────────────────────────────────


def test_la_clasica_caida_todos_los_dias_lanza(monkeypatch):
    def caida(*_a, **_k):
        raise requests.ConnectionError("Connection refused")

    monkeypatch.setattr(requests, "get", caida)
    with pytest.raises(ConsultaFallida, match="API clásica"):
        _clasica().extract(fecha_desde="2026-10-09", fecha_hasta="2026-10-10")


def test_la_clasica_con_un_dia_caido_de_dos_sigue(monkeypatch, caplog):
    def una_si_otra_no(_url, params=None, **_k):
        if params["fecha"] == "09102026":
            return _Respuesta(503, {})
        return _Respuesta(200, {"Cantidad": 1, "Listado": [LICITACION]})

    monkeypatch.setattr(requests, "get", una_si_otra_no)
    with caplog.at_level("ERROR"):
        registros = _clasica().extract(fecha_desde="2026-10-09", fecha_hasta="2026-10-10")
    assert registros == [LICITACION]
    assert "09102026" in caplog.text


def test_la_clasica_sin_licitaciones_no_es_un_fallo(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *_a, **_k: _Respuesta(200, {"Listado": []}))
    assert _clasica().extract(fecha_desde="2026-10-09", fecha_hasta="2026-10-09") == []


def test_el_etl_de_licitaciones_con_la_api_caida_devuelve_false(monkeypatch):
    def caida(*_a, **_k):
        raise requests.Timeout("read timed out")

    monkeypatch.setattr(requests, "get", caida)
    monkeypatch.setattr(etl_main.config, "MERCADO_PUBLICO_TICKET", "T")
    monkeypatch.setattr(etl_main.config, "RETRY_DELAY", 0)
    assert etl_main.run_etl_licitaciones_v2("2026-10-09", "2026-10-09") is False


# ── Compra Ágil ──────────────────────────────────────────────────────────────

DESDE, HASTA = datetime(2026, 10, 13, 10), datetime(2026, 10, 13, 13)  # tres tramos


def _pagina(items):
    return {
        "success": "OK",
        "payload": {"items": items, "paginacion": {"total_paginas": 1}},
    }


def test_compra_agil_sin_ninguna_primera_pagina_lanza(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *_a, **_k: _Respuesta(504, {}))
    with pytest.raises(ConsultaFallida, match="Compra Ágil"):
        _agil().extract(cambio_desde=DESDE, cambio_hasta=HASTA)


def test_compra_agil_con_un_tramo_caido_trae_los_demas(monkeypatch, caplog):
    def un_tramo_caido(_url, params=None, **_k):
        if params["cambio_desde"].startswith("2026-10-13T11"):
            return _Respuesta(504, {})
        return _Respuesta(200, _pagina([{"codigo": f"C-{params['cambio_desde']}"}]))

    monkeypatch.setattr(requests, "get", un_tramo_caido)
    with caplog.at_level("ERROR"):
        registros = _agil().extract(cambio_desde=DESDE, cambio_hasta=HASTA)
    assert len(registros) == 2
    assert "2026-10-13T11:00:00Z" in caplog.text


def test_compra_agil_sin_cambios_no_es_un_fallo(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *_a, **_k: _Respuesta(200, _pagina([])))
    assert _agil().extract(cambio_desde=DESDE, cambio_hasta=HASTA) == []


def test_una_pagina_siguiente_que_falla_lo_dice(monkeypatch, caplog):
    def segunda_caida(_url, params=None, **_k):
        if params["numero_pagina"] == 2:
            return _Respuesta(504, {})
        cuerpo = _pagina([{"codigo": f"C-{params['cambio_desde']}"}])
        cuerpo["payload"]["paginacion"]["total_paginas"] = 2
        return _Respuesta(200, cuerpo)

    monkeypatch.setattr(requests, "get", segunda_caida)
    with caplog.at_level("ERROR"):
        registros = _agil().extract(cambio_desde=DESDE, cambio_hasta=HASTA)
    assert len(registros) == 3
    assert "incompleto" in caplog.text


def test_el_etl_de_compra_agil_con_la_api_caida_devuelve_false(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda *_a, **_k: _Respuesta(500, {}))
    monkeypatch.setattr(etl_main.config, "COMPRA_AGIL_TICKET", "T", raising=False)
    monkeypatch.setattr(etl_main.config, "RETRY_DELAY", 0)
    assert etl_main.run_etl_compra_agil(cambio_desde=DESDE, cambio_hasta=HASTA) is False


# ── La carga ─────────────────────────────────────────────────────────────────


class _Sesion:
    """Sesión falsa: la tanda `n` (desde 1) falla si está en `fallan`."""

    def __init__(self, fallan):
        self.fallan = set(fallan)
        self.tanda = 0
        self.rollbacks = 0

    def execute(self, sentencia, *_a):
        if str(sentencia).lstrip().startswith("SELECT"):
            self.tanda += 1
            if self.tanda in self.fallan:
                raise OperationalError("SELECT", {}, Exception("server closed the connection"))
        return []

    def commit(self):
        pass

    def rollback(self):
        self.rollbacks += 1


def _cargador(fallan):
    loader = DatabaseLoaderV2({"DATABASE_URL": "postgresql://nadie@localhost/nada"})
    loader.session = _Sesion(fallan)
    return loader


def _filas(n):
    return [{"codigo_externo": f"X-{i}", "nombre": "n"} for i in range(n)]


def test_si_fallan_todas_las_tandas_la_carga_lanza():
    with pytest.raises(CargaFallida, match="2 tanda"):
        _cargador(fallan={1, 2}).load_licitaciones(_filas(501))


def test_una_tanda_fallida_de_dos_se_tolera():
    assert _cargador(fallan={1}).load_licitaciones(_filas(501)) == 1


def test_nada_que_cargar_no_es_un_fallo():
    assert _cargador(fallan={1}).load_licitaciones([]) == 0


class _ExtractorCon:
    def __init__(self, registros):
        self.registros = registros

    def extract(self, **_k):
        return self.registros


class _LoaderQueNoEscribe:
    def __init__(self, *_a):
        pass

    def connect(self):
        pass

    def disconnect(self):
        pass

    def load_licitaciones(self, _filas):
        raise CargaFallida("Licitaciones: fallaron las 1 tanda(s)")


def test_el_etl_de_licitaciones_sin_escribir_nada_devuelve_false(monkeypatch):
    monkeypatch.setattr(
        etl_main, "MercadoPublicoLicitacionesExtractor", lambda _c: _ExtractorCon([LICITACION])
    )
    monkeypatch.setattr(etl_main, "DatabaseLoaderV2", _LoaderQueNoEscribe)
    assert etl_main.run_etl_licitaciones_v2("2026-10-09", "2026-10-09") is False


def test_el_etl_de_licitaciones_sin_ninguna_fila_transformable_devuelve_false(monkeypatch):
    monkeypatch.setattr(
        etl_main,
        "MercadoPublicoLicitacionesExtractor",
        lambda _c: _ExtractorCon([{"CodigoExterno": "", "Nombre": ""}]),
    )
    monkeypatch.setattr(etl_main, "DatabaseLoaderV2", _LoaderQueNoEscribe)
    assert etl_main.run_etl_licitaciones_v2("2026-10-09", "2026-10-09") is False

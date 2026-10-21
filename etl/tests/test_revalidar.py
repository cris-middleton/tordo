"""Los cron piden a Next que regenere las páginas públicas (paso 10 del pivote).

El contrato con `frontend/app/api/revalidar`: `POST` con `X-Revalidar-Secreto` y
`{"etiquetas": [...]}`; 200 `{"revalidadas": [...]}`, 401 secreto, 400 cuerpo,
503 si Next no tiene secreto. **Un fallo no tumba la corrida**: los datos ya
están en Postgres, la página sólo se queda vieja.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

import httpx
import pytest

from etl import cron
from etl.cron import ZONA_CHILE, Revalidador

URL = "https://tordo.cl/api/revalidar"
SECRETO = "secreto-de-prueba-que-no-se-registra"


class _Next:
    def __init__(self, estado=200, cuerpo=None, error=None):
        self.estado = estado
        self.cuerpo = cuerpo if cuerpo is not None else {"revalidadas": ["analytics"]}
        self.error = error
        self.peticiones: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.peticiones.append(request)
        if self.error:
            raise self.error
        return httpx.Response(self.estado, json=self.cuerpo)


def _revalidador(next_falso, url=URL, secreto=SECRETO):
    return Revalidador(url, secreto, httpx.Client(transport=httpx.MockTransport(next_falso)))


def test_manda_el_secreto_en_la_cabecera_y_las_etiquetas_en_el_cuerpo():
    next_falso = _Next()
    assert _revalidador(next_falso).revalidar(["analytics"]) is True
    (peticion,) = next_falso.peticiones
    assert peticion.method == "POST"
    assert str(peticion.url) == URL
    assert peticion.headers["X-Revalidar-Secreto"] == SECRETO
    assert json.loads(peticion.content) == {"etiquetas": ["analytics"]}


@pytest.mark.parametrize(
    "url,secreto", [("", SECRETO), (URL, ""), ("", "")], ids=["sin-url", "sin-secreto", "nada"]
)
def test_sin_las_dos_variables_no_hace_nada(url, secreto, caplog):
    next_falso = _Next()
    with caplog.at_level(logging.INFO, logger="etl.cron"):
        assert _revalidador(next_falso, url, secreto).revalidar(["analytics"]) is False
    assert next_falso.peticiones == []
    assert any(r.levelno == logging.INFO and "omitida" in r.message for r in caplog.records)


@pytest.mark.parametrize(
    "estado,pista",
    [(401, "secreto"), (400, "cuerpo"), (503, "no tiene"), (500, "inesperada")],
)
def test_una_respuesta_mala_se_registra_en_error_sin_lanzar(estado, pista, caplog):
    with caplog.at_level(logging.ERROR, logger="etl.cron"):
        assert _revalidador(_Next(estado, {"error": "x"})).revalidar(["analytics"]) is False
    (registro,) = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert str(estado) in registro.message and pista in registro.message
    assert SECRETO not in registro.message


def test_next_caido_se_registra_en_error_sin_lanzar(caplog):
    caido = _Next(error=httpx.ConnectError("sin red"))
    with caplog.at_level(logging.ERROR, logger="etl.cron"):
        assert _revalidador(caido).revalidar(["compra-agil"]) is False
    assert any("no respondió" in r.message for r in caplog.records)


def test_desde_el_entorno():
    r = Revalidador.desde_entorno({"REVALIDAR_URL": f" {URL} ", "REVALIDAR_SECRETO": SECRETO})
    assert (r.url, r.secreto) == (URL, SECRETO)
    vacio = Revalidador.desde_entorno({})
    assert (vacio.url, vacio.secreto) == ("", "")


# ── Dónde lo llama cada cron ─────────────────────────────────────────────────


def _chile(texto: str) -> datetime:
    return datetime.fromisoformat(texto).replace(tzinfo=ZONA_CHILE)


class _Registro:
    def __init__(self):
        self.llamadas: list[tuple] = []

    def paso(self, nombre, resultado=True):
        def _paso(*args):
            self.llamadas.append((nombre, *args))
            return resultado

        return _paso

    def nombres(self):
        return [llamada[0] for llamada in self.llamadas]


def _semanal(r, hechas=("time_series",), fallidas=()):
    def materializar():
        r.llamadas.append(("materializar",))
        return cron.Materializacion(hechas=list(hechas), fallidas=list(fallidas))

    return cron.PasosSemanal(
        bajar=r.paso("bajar"),
        purgar=r.paso("purgar"),
        descargar=r.paso("descargar"),
        analytics=lambda: [],
        materializar=materializar,
        subir=r.paso("subir"),
        retener=r.paso("retener"),
        revalidar=r.paso("revalidar", False),
    )


def test_la_semanal_revalida_analytics_despues_de_materializar():
    r = _Registro()
    # La revalidación «falla» (devuelve False) y la corrida sigue siendo buena.
    assert cron.correr_semanal(_chile("2026-10-11T03:00:00"), _semanal(r))
    nombres = r.nombres()
    assert nombres.index("revalidar") == nombres.index("materializar") + 1
    assert ("revalidar", ["analytics"]) in r.llamadas


def test_sin_materializar_nada_no_se_revalida():
    r = _Registro()
    pasos = _semanal(r, hechas=(), fallidas=("time_series", "price_bands"))
    assert not cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)
    assert "revalidar" not in r.nombres()


def test_una_tabla_rota_no_deja_las_paginas_viejas_una_semana():
    """Antes, con una sola tabla fallida no se revalidaba nada: las páginas
    seguían con la semana anterior aunque las demás tablas ya fueran nuevas.
    La etiqueta es una para todo analytics: basta una tabla nueva. La corrida
    sigue terminando mal, para que el /fail diga qué tabla."""
    r = _Registro()
    pasos = _semanal(r, hechas=("time_series",), fallidas=("price_bands",))
    assert not cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)
    assert ("revalidar", ["analytics"]) in r.llamadas


def test_materializar_tabla_por_tabla_dice_cuales_fallaron(monkeypatch):
    tablas = [spec.tabla for spec in cron.CATALOGO]
    rota = tablas[1]
    pedidas = []

    def main(argv):
        pedidas.append(argv)
        return 1 if argv == ["--solo", rota] else 0

    monkeypatch.setattr(cron.materialize, "main", main)
    resultado = cron._materializar()
    assert resultado.fallidas == [rota]
    assert resultado.hechas == [t for t in tablas if t != rota]
    assert pedidas == [["--solo", t] for t in tablas]


def _frecuente(r, ok=True):
    return cron.PasosFrecuente(
        compra_agil=r.paso("compra_agil", ok),
        licitaciones=r.paso("licitaciones"),
        detalles_nuevos=r.paso("detalles_nuevos"),
        barrido=r.paso("barrido"),
        resultados=r.paso("resultados"),
        revalidar=r.paso("revalidar", False),
    )


@pytest.mark.parametrize("instante", ["2026-10-13T10:00:00", "2026-10-13T16:00:00"])
def test_la_frecuente_revalida_compra_agil_al_final(instante):
    r = _Registro()
    assert cron.correr_frecuente(_chile(instante), _frecuente(r))
    assert r.llamadas[-1] == ("revalidar", ["compra-agil"])


def test_la_frecuente_revalida_aunque_un_paso_falle():
    r = _Registro()
    assert not cron.correr_frecuente(_chile("2026-10-13T16:00:00"), _frecuente(r, ok=False))
    assert r.llamadas[-1] == ("revalidar", ["compra-agil"])

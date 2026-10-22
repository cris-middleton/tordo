"""«¿Quisiste decir…?» (`services/publico/sugerencias.py`, `GET /publico/sugerencia`)."""

from __future__ import annotations

import gc
import weakref

import polars as pl
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.main import app
from app.services.publico import sugerencias
from app.services.publico.sugerencias import Vocabulario, vocabulario_de

PRODUCTOS = pl.DataFrame(
    {
        "slug": [
            "computador-escritorio",
            "guantes-nitrilo-talla",
            "latex-guante",
            "silla-ergonomica",
            "silla-visita",
            "sillon-ejecutivo",
            "detergente-liquido",
            "liquido-jabon",
            "libro-silva",
        ],
        "n": [40, 272, 50, 30, 10, 5, 12, 20, 1],
    }
)


@pytest.fixture
def vocab(monkeypatch) -> Vocabulario:
    v = vocabulario_de(PRODUCTOS)
    monkeypatch.setattr(sugerencias, "vocabulario", lambda: v)
    return v


class _Indice:
    def __init__(self, productos: pl.DataFrame):
        self.productos = productos


def test_el_vocabulario_se_rehace_con_cada_indice_y_no_retiene_el_viejo(monkeypatch):
    """La caché reconoce el índice por referencia débil, no por `id()`: Python reusa
    el id de un índice liberado, y con él se serviría el vocabulario del viejo."""
    monkeypatch.setattr(sugerencias, "_cache", None)
    vigente = [_Indice(PRODUCTOS)]
    monkeypatch.setattr(sugerencias.indexables, "indice", lambda: vigente[0])
    assert "computador" in sugerencias.vocabulario().peso

    viejo = weakref.ref(vigente[0])
    vigente[0] = _Indice(pl.DataFrame({"slug": ["mesa-comedor"], "n": [3]}))
    gc.collect()
    assert viejo() is None
    assert set(sugerencias.vocabulario().peso) == {"mesa", "comedor"}


def test_el_vocabulario_son_las_palabras_de_los_slugs_con_sus_compras():
    v = vocabulario_de(PRODUCTOS)
    assert v.peso["silla"] == 40
    assert v.peso["liquido"] == 32
    assert v.ordenadas == sorted(v.peso)


@pytest.mark.parametrize(
    ("q", "esperada"),
    [
        ("computdor", "computador"),
        ("guantez de nitrlo", "guante de nitrilo"),
        ("silal ergonomica", "silla ergonomica"),
        ("jabon liqido", "jabon liquido"),
        ("Detergnte", "detergente"),
    ],
)
def test_corrige_las_palabras_mal_escritas(vocab, q, esperada):
    assert sugerencias.sugerencia(q) == esperada


@pytest.mark.parametrize(
    "q",
    [
        "guante",  # conocida: empieza «guantes»
        "guantes",  # conocida, entera
        "sillas",  # su singular es conocido
        "xyzzy",  # no hay nada parecido
        "pc",  # corta
        "mesa",  # parecida a nada con cuatro letras
        "covid-19",  # con dígitos o signos
        "lapiz",  # tiene sinónimos: no es un error
    ],
)
def test_lo_que_no_se_corrige(vocab, q):
    assert sugerencias.sugerencia(q) is None


def test_a_igual_parecido_gana_la_de_mas_compras(vocab):
    """«silxa» se parece igual a «silla» que a «silva»: 40 compras contra 1."""
    assert sugerencias.mas_parecida("silxa", vocab) == "silla"


def test_las_palabras_sin_corregir_salen_como_se_escribieron(vocab):
    assert sugerencias.sugerencia("Silal ROJA") == "silla ROJA"


def test_sin_vocabulario_no_hay_sugerencia(monkeypatch):
    monkeypatch.setattr(sugerencias, "vocabulario", lambda: vocabulario_de(PRODUCTOS.head(0)))
    assert sugerencias.sugerencia("computdor") is None


def test_la_ruta_responde_con_la_sugerencia(vocab, monkeypatch):
    monkeypatch.setattr(settings, "feature_analytics", True)
    # Sin `with`: el ciclo de vida de la app (el del MCP) sólo puede correr una vez.
    cliente = TestClient(app)
    r = cliente.get(f"{PREFIJO_API}/publico/sugerencia", params={"q": "computdor"})
    assert r.status_code == 200
    assert r.json() == {"sugerencia": "computador"}
    sin_nada = cliente.get(f"{PREFIJO_API}/publico/sugerencia", params={"q": "guante"})
    assert sin_nada.json() == {"sugerencia": None}
    assert cliente.get(f"{PREFIJO_API}/publico/sugerencia").status_code == 422

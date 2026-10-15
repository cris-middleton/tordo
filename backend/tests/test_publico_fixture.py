"""`/publico/*` contra el esquema `analytics` materializado del golden master.

`test_publico_http.py` fija la forma con tablas en memoria; esto comprueba que
las consultas de verdad —nombres de tabla y de columna incluidos— funcionan
sobre lo que produce el materializador, y que todo lo que el sitemap anuncia
resuelve. `make ci` materializa el fixture antes de los tests; en CI, sin él,
esto es un error y no un salto (mismo motivo que en el golden).

Las bandas por producto (L0/L0N) del fixture son sintéticas
(`golden/fixture_productos.py`): un indexable con dos unidades, uno que no, y
una colisión de slug. Los E2E del frontend usan esos mismos slugs.
"""

from __future__ import annotations

import json
import os

import polars as pl
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.main import app, limitador_ip
from app.repositories import analytics_sync as repo
from app.services.publico import indexables
from tests.test_publico_http import ruts_de_persona

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
BASE = f"{PREFIJO_API}/publico"


@pytest.fixture(scope="module", autouse=True)
def exigir_datos():
    try:
        repo.invalidar_cache_existencia()
        hay = repo.existe_tabla("market_concentration", usar_cache=False)
    except Exception as exc:  # noqa: BLE001
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__}) — usa `make dev-up-d`")
    if not hay:
        mensaje = "el esquema analytics no está materializado — ver test_bi_service_equivalencia"
        if IN_CI:
            raise AssertionError(mensaje)
        pytest.skip(mensaje)


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(settings, "feature_analytics", True)
    indexables.invalidar()
    yield TestClient(app)
    indexables.invalidar()


def _get(cliente, ruta, **params):
    # Se recorren más de 60 rutas en un test: sin esto, el límite por IP las
    # cortaría con 429 a mitad de camino.
    limitador_ip.reiniciar()
    r = cliente.get(f"{BASE}{ruta}", params=params)
    assert r.status_code == 200, f"{ruta}: {r.status_code} {r.text[:200]}"
    texto = json.dumps(r.json(), ensure_ascii=False)
    assert not ruts_de_persona(texto), f"{ruta} trae un RUT de persona"
    return r.json()


def test_el_sitemap_trae_compradores_y_rubros(cliente):
    mapa = _get(cliente, "/sitemap")
    assert mapa["actualizado"] is not None
    # Guardas: si el índice saliera vacío, el resto comprobaría el vacío.
    assert len(mapa["compradores"]) >= 10, "¿cambió el criterio o el fixture?"
    assert len(mapa["rubros"]) >= 50, "¿cambió el criterio o el fixture?"
    # Sintéticos: el de la resma no llega a 10 compras, y de la colisión
    # jabón/jabon queda una sola página.
    assert mapa["productos"] == ["guante-nitrilo-prueba", "jabon-liquido-prueba"]


def test_los_slugs_de_rubro_son_unicos_y_no_vacios(cliente):
    rubros = indexables.indice().rubros
    assert rubros["slug"].n_unique() == rubros.height
    assert (rubros["slug"] != "").all()


def test_cada_rubro_del_sitemap_resuelve_con_datos(cliente):
    for slug in _get(cliente, "/sitemap")["rubros"]:
        cuerpo = _get(cliente, f"/rubros/{slug}")
        assert cuerpo["slug"] == slug
        assert cuerpo["indexable"] is True
        # Lo que el sitemap anuncia no puede ser «Sin datos históricos».
        assert cuerpo["panorama"]["disponible"] is True, slug


def test_un_rubro_sin_datos_existe_con_noindex(cliente):
    """El fixture recortado trae rubros en `market_concentration` sin
    competidores: son justo las páginas delgadas que no se indexan."""
    sin_datos = indexables.indice().rubros.filter(~pl.col("indexable"))
    assert not sin_datos.is_empty(), "¿cambió el fixture?"
    cuerpo = _get(cliente, f"/rubros/{sin_datos['slug'][0]}")
    assert cuerpo["indexable"] is False


def test_los_compradores_indexables_tienen_perfil_y_rubros_enlazables(cliente):
    # Con página, no necesariamente indexable: un rubro sin datos se enlaza
    # igual desde el comprador, y su página existe con noindex.
    rubros_con_pagina = set(indexables.indice().rubros["slug"].to_list())
    for codigo in _get(cliente, "/sitemap")["compradores"][:15]:
        cuerpo = _get(cliente, f"/compradores/{codigo}")
        assert cuerpo["indexable"] is True
        assert cuerpo["perfil"]["disponible"] is True
        assert cuerpo["periodo"]["ventana_hasta"] is not None
        assert cuerpo["rubros"], codigo
        for rubro in cuerpo["rubros"]:
            assert rubro["slug"] in rubros_con_pagina


def test_un_comprador_sin_perfil_ni_mercado_es_404(cliente):
    r = cliente.get(f"{BASE}/compradores/no-existe")
    assert r.status_code == 404


def test_producto_indexable_con_dos_unidades_y_compradores_enlazables(cliente):
    compradores = set(_get(cliente, "/sitemap")["compradores"])
    cuerpo = _get(cliente, "/productos/guante-nitrilo-prueba")
    assert cuerpo["indexable"] is True
    assert cuerpo["codigo_onu"] == "99999901"
    assert cuerpo["nombre_generico"] == "Producto de prueba"
    assert [u["unidad"] for u in cuerpo["unidades"]] == ["caja", "unidad"]
    assert [c["codigo"] for c in cuerpo["compradores"]] == ["111875", "113812"]
    # Los enlaces producto → comprador llevan a páginas indexadas.
    assert {c["codigo"] for c in cuerpo["compradores"]} <= compradores


def test_producto_no_indexable_y_colision(cliente):
    assert _get(cliente, "/productos/resma-papel-prueba")["indexable"] is False
    jabon = _get(cliente, "/productos/jabon-liquido-prueba")
    assert jabon["firma"] == "jabon liquido prueba"  # 30 compras contra 12
    encontrados = _get(cliente, "/productos", q="prueba")
    assert [p["slug"] for p in encontrados] == [
        "guante-nitrilo-prueba",
        "jabon-liquido-prueba",
        "resma-papel-prueba",
    ]


def test_la_busqueda_quita_las_palabras_que_la_firma_quita(cliente):
    """«guante de nitrilo» exigía un «de» que la firma `guante nitrilo prueba`
    no tiene (spec del rediseño §8.5). Sobre las tablas materializadas de verdad."""
    encontrados = _get(cliente, "/productos", q="guante de nitrilo")
    assert [p["slug"] for p in encontrados] == ["guante-nitrilo-prueba"]
    assert _get(cliente, "/productos", q="de la") == []

"""`/publico/*` por HTTP, con analytics en memoria.

Cubre la forma de cada respuesta (es el contrato con el frontend, que construye
las páginas en paralelo), los 404 en español, el producto no indexable que
responde 200, la búsqueda, que nada pide `Authorization`, y que **ningún RUT de
proveedor** sale por esta superficie aunque esté en las tablas.

Contra la base materializada del golden master corre `test_publico_fixture.py`.
"""

from __future__ import annotations

import json
import re

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.main import app
from app.services.bi import comprador as servicio_comprador
from app.services.bi import rubro as servicio_rubro
from app.services.publico import indexables, paginas
from tests.analytics_en_memoria import AnalyticsEnMemoria

BASE = f"{PREFIJO_API}/publico"

#: Un RUT de persona natural sembrado en las tablas. No puede salir nunca.
RUT_PERSONA = "12.708.987-6"
RUT = re.compile(r"\b(\d{1,2})\.?(\d{3})\.?(\d{3})-[\dkK]\b")

#: Bajo este número, el RUT es de una persona natural (etl/analytics/personas.py).
UMBRAL_PERSONA = 50_000_000


def ruts_de_persona(texto: str) -> list[str]:
    """Los RUT de persona natural que aparezcan en `texto`.

    Sólo los de persona: el de una empresa o un organismo es público, y el
    fixture del golden trae alguno pegado al nombre de un comprador.
    """
    return [m.group(0) for m in RUT.finditer(texto) if int("".join(m.groups())) < UMBRAL_PERSONA]


VENTANA = {"ventana_desde": "2023-10-01", "ventana_hasta": "2026-09-30"}


def _mercado(codigo, nombre, rubro, n, monto):
    return {
        "CodigoOrganismoPublico": codigo,
        "OrganismoPublico": nombre,
        "RubroN2": rubro,
        "n_transacciones": n,
        "monto_total_mercado": monto,
        "hhi": 5000.0,
        "top_proveedor": "PROVEEDOR CON RUT " + RUT_PERSONA,
        **VENTANA,
    }


def _banda(firma, unidad, n, pred, p50, **extra):
    return {
        "firma_producto": firma,
        "UnidadMedida": unidad,
        "n": n,
        "p10": p50 * 0.8,
        "p25": p50 * 0.9,
        "p50": p50,
        "p75": p50 * 1.1,
        "p90": p50 * 1.2,
        "qcd": 0.1,
        "predictibilidad": pred,
        "confianza": 0.7,
        "codigoProductoONU": "46181504",
        "NombreroductoGenerico": "Guantes protectores",
        "descripcion": "GUANTE NITRILO TALLA M",
        "compradores": 5,
        "cuota_mayor": 0.2,
        **VENTANA,
        **extra,
    }


@pytest.fixture
def analytics(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos["buyer_scores.parquet"] = [
        {
            "CodigoOrganismoPublico": "7297",
            "NombreOrganismo": "HOSPITAL DE PRUEBA",
            "buyer_score": 0.8,
            "clasificacion": "bueno",
            "n_oc_total": 5000,
            "n_meses_activo": 30,
        },
        {
            "CodigoOrganismoPublico": "1",
            "NombreOrganismo": "MUNICIPALIDAD CHICA",
            "buyer_score": 0.5,
            "clasificacion": "regular",
            "n_oc_total": 3,
            "n_meses_activo": 2,
        },
    ]
    datos["buyer_risk_flags.parquet"] = [
        {"CodigoOrganismoPublico": "7297", "NombreOrganismo": "HOSPITAL DE PRUEBA", "n_flags": 0}
    ]
    datos["market_concentration.parquet"] = [
        _mercado("7297", "HOSPITAL DE PRUEBA", "Equipos médicos", 120, 9_000_000.0),
        _mercado("7297", "HOSPITAL DE PRUEBA", "Aseo / Limpieza", 40, 1_000_000.0),
        _mercado("1", "MUNICIPALIDAD CHICA", "Aseo / Limpieza", 2, 50_000.0),
    ]
    datos["competitors_by_market.parquet"] = [
        {
            "CodigoOrganismoPublico": "7297",
            "RubroN2": "Equipos médicos",
            "CodigoProveedor": "1595644",
            "NombreProveedor": "PN-0a1b2c3d",
            "RutProveedor": RUT_PERSONA,
            "monto_total": 9_000_000.0,
            "n_oc": 120,
        }
    ]
    datos["compra_agil_comprador.parquet"] = [
        {
            "CodigoOrganismoPublico": "7297",
            "ordenes": 80,
            "publicadas": 100,
            "proveedores_distintos": 25,
            "cuota_lider_pct": 12.5,
            "monto_p25": 100_000.0,
            "monto_mediana": 250_000.0,
            "monto_p75": 600_000.0,
            **VENTANA,
        }
    ]
    datos["product_price_bands_L0N.parquet"] = [
        _banda("guante nitrilo", "caja", 60, "alta", 9_000.0),
        _banda("guante nitrilo", "unidad", 25, "media", 90.0),
        _banda("guante látex", "par", 4, "alta", 300.0),
        _banda("guante latex", "par", 2, "alta", 310.0),  # pierde la colisión
    ]
    datos["product_price_bands_L0.parquet"] = [
        _banda(
            "guante nitrilo",
            "caja",
            40,
            "alta",
            8_800.0,
            CodigoOrganismoPublico="7297",
            OrganismoPublico="HOSPITAL DE PRUEBA",
        ),
        _banda(
            "guante nitrilo",
            "unidad",
            12,
            "media",
            95.0,
            CodigoOrganismoPublico="1",
            OrganismoPublico="MUNICIPALIDAD CHICA",
        ),
    ]
    datos.instalar(monkeypatch, indexables, paginas, servicio_comprador, servicio_rubro)
    # El perfil prueba dos nombres de columna para la transparencia; sin tabla, ninguno.
    monkeypatch.setattr(servicio_comprador, "_columna_presente", lambda *_: None)
    monkeypatch.setattr(settings, "feature_analytics", True)
    indexables.invalidar()
    yield datos
    indexables.invalidar()


@pytest.fixture
def cliente():
    # Sin `with`: no corre el ciclo de vida, que no hace falta (nada de esto
    # toca la base) y que en local sin Postgres no arrancaría.
    return TestClient(app)


def _get(cliente, ruta, **params):
    r = cliente.get(f"{BASE}{ruta}", params=params)
    # Nada de esta superficie pide credencial: lo demuestra pedirla sin ella.
    assert "authorization" not in {k.lower() for k in r.request.headers}
    return r


class TestSitemap:
    def test_solo_lo_indexable(self, analytics, cliente):
        r = _get(cliente, "/sitemap")
        assert r.status_code == 200
        assert r.json() == {
            "actualizado": "2026-09-30",
            "compradores": ["7297"],
            # Aseo no tiene competidores: su panorama sale vacío, así que tiene
            # página pero no sitemap.
            "rubros": ["equipos-medicos"],
            # El látex no llega a 10 compras: tiene página, no sitemap.
            "productos": ["guante-nitrilo"],
        }

    def test_ida_y_vuelta_cada_entrada_resuelve(self, analytics, cliente):
        mapa = _get(cliente, "/sitemap").json()
        for codigo in mapa["compradores"]:
            assert _get(cliente, f"/compradores/{codigo}").status_code == 200
        for slug in mapa["rubros"]:
            r = _get(cliente, f"/rubros/{slug}")
            assert r.status_code == 200 and r.json()["slug"] == slug
        for slug in mapa["productos"]:
            r = _get(cliente, f"/productos/{slug}")
            assert r.status_code == 200 and r.json()["indexable"] is True


class TestComprador:
    def test_forma(self, analytics, cliente):
        r = _get(cliente, "/compradores/7297")
        assert r.status_code == 200
        cuerpo = r.json()
        assert set(cuerpo) == {
            "codigo",
            "nombre",
            "indexable",
            "periodo",
            "perfil",
            "compra_agil",
            "rubros",
        }
        assert cuerpo["codigo"] == "7297"
        assert cuerpo["nombre"] == "HOSPITAL DE PRUEBA"
        assert cuerpo["indexable"] is True
        assert cuerpo["periodo"] == VENTANA
        assert cuerpo["perfil"]["disponible"] is True
        assert cuerpo["perfil"]["buyer_score"] == 0.8
        assert cuerpo["compra_agil"] == {
            "ordenes": 80,
            "publicadas": 100,
            "proveedores_distintos": 25,
            "cuota_lider_pct": 12.5,
            "monto_mediana": 250_000.0,
            "monto_p25": 100_000.0,
            "monto_p75": 600_000.0,
        }
        # Por monto, con el slug que resuelve la página del rubro.
        assert cuerpo["rubros"] == [
            {
                "nombre": "Equipos médicos",
                "slug": "equipos-medicos",
                "monto": 9_000_000.0,
                "ordenes": 120,
            },
            {
                "nombre": "Aseo / Limpieza",
                "slug": "aseo-limpieza",
                "monto": 1_000_000.0,
                "ordenes": 40,
            },
        ]

    def test_con_poco_volumen_existe_pero_no_se_indexa(self, analytics, cliente):
        cuerpo = _get(cliente, "/compradores/1").json()
        assert cuerpo["indexable"] is False
        assert cuerpo["compra_agil"] is None

    def test_desconocido_es_404_en_espanol(self, analytics, cliente):
        r = _get(cliente, "/compradores/999999")
        assert r.status_code == 404
        assert r.json() == {"detail": "Comprador no encontrado"}


class TestRubro:
    def test_forma(self, analytics, cliente):
        r = _get(cliente, "/rubros/aseo-limpieza")
        assert r.status_code == 200
        cuerpo = r.json()
        assert set(cuerpo) == {"slug", "nombre", "indexable", "panorama", "compradores"}
        assert cuerpo["nombre"] == "Aseo / Limpieza"
        assert "disponible" in cuerpo["panorama"]
        assert cuerpo["compradores"] == [
            {
                "codigo": "7297",
                "nombre": "HOSPITAL DE PRUEBA",
                "monto": 1_000_000.0,
                "ordenes": 40,
            },
            {"codigo": "1", "nombre": "MUNICIPALIDAD CHICA", "monto": 50_000.0, "ordenes": 2},
        ]

    def test_sin_datos_existe_pero_no_se_indexa(self, analytics, cliente):
        """Una página que dice «Sin datos históricos» no va al índice, pero
        responde 200: se llega a ella desde la ficha de un comprador."""
        cuerpo = _get(cliente, "/rubros/aseo-limpieza").json()
        assert cuerpo["panorama"]["disponible"] is False
        assert cuerpo["indexable"] is False

    def test_con_competidores_se_indexa(self, analytics, cliente):
        cuerpo = _get(cliente, "/rubros/equipos-medicos").json()
        assert cuerpo["panorama"]["disponible"] is True
        assert cuerpo["indexable"] is True

    def test_el_panorama_es_el_del_bi(self, analytics, cliente):
        cuerpo = _get(cliente, "/rubros/equipos-medicos").json()
        competencia = cuerpo["panorama"]["competencia"]
        assert competencia["lideres"][0]["nombre"] == "PN-0a1b2c3d"

    @pytest.mark.parametrize("slug", ["no-existe", "Equipos-Medicos", "equipos médicos"])
    def test_slug_desconocido_es_404(self, analytics, cliente, slug):
        """El backend no des-slugifica lo que le llegue: o es el slug exacto o
        no hay página. Así una URL tiene una sola forma canónica."""
        r = _get(cliente, f"/rubros/{slug}")
        assert r.status_code == 404
        assert r.json() == {"detail": "Rubro no encontrado"}


class TestProducto:
    def test_forma(self, analytics, cliente):
        r = _get(cliente, "/productos/guante-nitrilo")
        assert r.status_code == 200
        cuerpo = r.json()
        assert set(cuerpo) == {
            "slug",
            "firma",
            "nombre_generico",
            "codigo_onu",
            "descripcion",
            "indexable",
            "unidades",
            "compradores",
            "periodo",
        }
        assert cuerpo["firma"] == "guante nitrilo"
        # La ventana de la banda (identidad §3.4): sin ella, el precio se leería como «de siempre».
        assert cuerpo["periodo"] == VENTANA
        assert cuerpo["nombre_generico"] == "Guantes protectores"
        assert cuerpo["codigo_onu"] == "46181504"
        assert cuerpo["indexable"] is True
        assert [u["unidad"] for u in cuerpo["unidades"]] == ["caja", "unidad"]
        assert set(cuerpo["unidades"][0]) == {
            "unidad",
            "n",
            "p10",
            "p25",
            "p50",
            "p75",
            "p90",
            "predictibilidad",
            "confianza",
            "compradores",
            "cuota_mayor",
            "de_mercado",
            "medianas_compradores",
        }
        assert cuerpo["unidades"][0]["compradores"] == 5
        assert cuerpo["unidades"][0]["cuota_mayor"] == 0.2
        assert cuerpo["unidades"][0]["de_mercado"] is True
        assert cuerpo["compradores"] == [
            {
                "codigo": "7297",
                "nombre": "HOSPITAL DE PRUEBA",
                "unidad": "caja",
                "n": 40,
                "p50": 8_800.0,
            },
            {
                "codigo": "1",
                "nombre": "MUNICIPALIDAD CHICA",
                "unidad": "unidad",
                "n": 12,
                "p50": 95.0,
            },
        ]

    def test_no_indexable_responde_200(self, analytics, cliente):
        """La página existe, con `noindex`: se llega por la búsqueda."""
        r = _get(cliente, "/productos/guante-latex")
        assert r.status_code == 200
        cuerpo = r.json()
        assert cuerpo["indexable"] is False
        # Ganó la colisión la firma de más compras (con tilde: 4 contra 2).
        assert cuerpo["firma"] == "guante látex"
        assert cuerpo["compradores"] == []

    def test_sin_ventana_en_la_tabla_el_periodo_es_nulo(self, analytics, cliente):
        """Una tabla materializada antes de que existiera la ventana: la ficha sale igual."""
        fila = _banda("guante nitrilo", "caja", 60, "alta", 9_000.0)
        del fila["ventana_desde"], fila["ventana_hasta"]
        analytics["product_price_bands_L0N.parquet"] = [fila]
        indexables.invalidar()

        r = _get(cliente, "/productos/guante-nitrilo")

        assert r.status_code == 200
        assert r.json()["periodo"] is None

    def test_de_mercado_por_unidad(self, analytics, cliente):
        """Cada banda dice si es un precio de mercado (≥ 3 compradores, ninguno
        sobre la mitad): la portada sólo publica una que lo sea."""
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("guante nitrilo", "caja", 60, "alta", 9_000.0, compradores=1, cuota_mayor=1.0),
            _banda("guante nitrilo", "unidad", 25, "media", 90.0),
        ]
        indexables.invalidar()
        unidades = _get(cliente, "/productos/guante-nitrilo").json()["unidades"]
        assert [u["de_mercado"] for u in unidades] == [False, True]

    def test_sin_compradores_en_la_tabla_no_es_de_mercado(self, analytics, cliente):
        """Una tabla materializada antes de contar compradores: la ficha sale,
        sin decir de cuántos es, y ninguna banda pasa por precio de mercado."""
        fila = _banda("guante nitrilo", "caja", 60, "alta", 9_000.0)
        del fila["compradores"], fila["cuota_mayor"]
        analytics["product_price_bands_L0N.parquet"] = [fila]
        indexables.invalidar()

        r = _get(cliente, "/productos/guante-nitrilo")

        assert r.status_code == 200
        banda = r.json()["unidades"][0]
        assert banda["compradores"] is None
        assert banda["cuota_mayor"] is None
        assert banda["de_mercado"] is False

    @staticmethod
    def _comprador(unidad, codigo, n, p50, puesto, firma="guante nitrilo"):
        return {
            "firma_producto": firma,
            "UnidadMedida": unidad,
            "CodigoOrganismoPublico": codigo,
            "OrganismoPublico": f"ORGANISMO {codigo}",
            "n": n,
            "p50": p50,
            "puesto": puesto,
            **VENTANA,
        }

    def test_cada_banda_trae_la_mediana_de_todos_sus_compradores(self, analytics, cliente):
        """El gráfico dibuja un punto por comprador: cada banda trae los suyos,
        de su unidad y en orden de `puesto`, más allá de los 10 de «Quién lo compra»."""
        cajas = [self._comprador("caja", str(100 + i), 1, 9_000.0 + i, i + 2) for i in range(12)]
        analytics["product_price_compradores.parquet"] = [
            *reversed(cajas),
            self._comprador("caja", "7297", 5, 8_800.0, 1),
            self._comprador("unidad", "1", 3, 95.0, 14),
            # Otra firma con la misma unidad no se cuela.
            self._comprador("caja", "9", 50, 1.0, 1, firma="guante látex"),
        ]

        unidades = _get(cliente, "/productos/guante-nitrilo").json()["unidades"]

        caja, unidad = unidades
        assert caja["medianas_compradores"] == [{"n": 5, "p50": 8_800.0}] + [
            {"n": 1, "p50": 9_000.0 + i} for i in range(12)
        ]
        assert unidad["medianas_compradores"] == [{"n": 3, "p50": 95.0}]

    def test_las_medianas_tienen_tope(self, analytics, cliente, monkeypatch):
        """Se quedan las de más compras: el `puesto` las ordena."""
        monkeypatch.setattr(paginas, "TOPE_MEDIANAS_POR_BANDA", 2)
        analytics["product_price_compradores.parquet"] = [
            self._comprador("caja", "3", 1, 30.0, 3),
            self._comprador("caja", "1", 4, 10.0, 1),
            self._comprador("caja", "2", 2, 20.0, 2),
        ]
        caja = _get(cliente, "/productos/guante-nitrilo").json()["unidades"][0]
        assert caja["medianas_compradores"] == [{"n": 4, "p50": 10.0}, {"n": 2, "p50": 20.0}]

    def test_sin_la_tabla_las_medianas_son_nulas(self, analytics, cliente):
        """No se sabe: null, no `[]` (que diría «ningún comprador»)."""
        assert "product_price_compradores.parquet" not in analytics.tablas
        unidades = _get(cliente, "/productos/guante-nitrilo").json()["unidades"]
        assert [u["medianas_compradores"] for u in unidades] == [None, None]

    def test_con_la_tabla_y_sin_filas_de_la_unidad_las_medianas_son_vacias(
        self, analytics, cliente
    ):
        analytics["product_price_compradores.parquet"] = [
            self._comprador("caja", "7297", 5, 8_800.0, 1)
        ]
        unidades = _get(cliente, "/productos/guante-nitrilo").json()["unidades"]
        assert [len(u["medianas_compradores"]) for u in unidades] == [1, 0]

    def test_los_compradores_salen_de_la_tabla_sin_minimo(self, analytics, cliente):
        """«Quién lo compra» lee `product_price_compradores`: todos los
        organismos de la banda, también los de una sola compra, que L0 dejaba
        fuera (exige tres). Los primeros `TOP_ENLACES` por `puesto`."""
        filas = [
            {
                "firma_producto": "guante nitrilo",
                "UnidadMedida": "caja",
                "CodigoOrganismoPublico": str(100 + i),
                "OrganismoPublico": f"MUNICIPALIDAD {i}",
                "n": 2 if i < 3 else 1,
                "p50": 9_000.0 + i,
                "puesto": i + 1,
                **VENTANA,
            }
            for i in range(paginas.TOP_ENLACES + 5)
        ]
        # Otra firma no se cuela, aunque tenga más compras.
        filas.append({**filas[0], "firma_producto": "guante látex", "n": 99, "puesto": 1})
        # Desordenadas a propósito: el orden lo da `puesto`, no el de las filas.
        analytics["product_price_compradores.parquet"] = list(reversed(filas))

        compradores = _get(cliente, "/productos/guante-nitrilo").json()["compradores"]

        assert len(compradores) == paginas.TOP_ENLACES
        assert [c["codigo"] for c in compradores] == [
            str(100 + i) for i in range(paginas.TOP_ENLACES)
        ]
        assert compradores[0] == {
            "codigo": "100",
            "nombre": "MUNICIPALIDAD 0",
            "unidad": "caja",
            "n": 2,
            "p50": 9_000.0,
        }
        # Los de una sola compra también: es lo que L0 no podía dar.
        assert compradores[-1]["n"] == 1
        # Ninguno de L0 (HOSPITAL DE PRUEBA): con la tabla nueva no se mezclan.
        assert "7297" not in {c["codigo"] for c in compradores}

    def test_sin_la_tabla_de_compradores_cae_a_l0(self, analytics, cliente):
        """Hasta la primera semanal que la genera, la ficha lista los de L0
        (≥ 3 compras por organismo), como antes, sin error."""
        assert "product_price_compradores.parquet" not in analytics.tablas
        compradores = _get(cliente, "/productos/guante-nitrilo").json()["compradores"]
        assert [c["codigo"] for c in compradores] == ["7297", "1"]

    def test_con_la_tabla_y_sin_filas_no_cae_a_l0(self, analytics, cliente):
        """Si la tabla existe, manda ella: una firma sin compradores ahí no
        tiene compradores, y L0 (una tabla con otro criterio) no los inventa."""
        analytics["product_price_compradores.parquet"] = [
            {
                "firma_producto": "guante látex",
                "UnidadMedida": "par",
                "CodigoOrganismoPublico": "1",
                "OrganismoPublico": "MUNICIPALIDAD CHICA",
                "n": 4,
                "p50": 300.0,
                "puesto": 1,
                **VENTANA,
            }
        ]
        assert _get(cliente, "/productos/guante-nitrilo").json()["compradores"] == []

    def test_desconocido_es_404(self, analytics, cliente):
        r = _get(cliente, "/productos/no-existe")
        assert r.status_code == 404
        assert r.json() == {"detail": "Producto no encontrado"}


class TestBusqueda:
    def test_ignora_tildes_y_orden_de_palabras(self, analytics, cliente):
        r = _get(cliente, "/productos", q="Látex GUANTE")
        assert r.status_code == 200
        assert r.json() == [
            {
                "slug": "guante-latex",
                "firma": "guante látex",
                "descripcion": "GUANTE NITRILO TALLA M",
                "n": 4,
                "indexable": False,
            }
        ]

    def test_la_descripcion_es_la_de_la_unidad_con_mas_compras(self, analytics, cliente):
        """Lo que se lee en la lista es cómo escribe el producto quien lo compra,
        no la firma (palabras ordenadas): la de su banda con más compras."""
        analytics["product_price_bands_L0N.parquet"] = [
            _banda(
                "guante nitrilo", "caja", 60, "alta", 9_000.0, descripcion="CAJA GUANTE NITRILO"
            ),
            _banda("guante nitrilo", "unidad", 25, "media", 90.0, descripcion="GUANTE NITRILO"),
        ]
        indexables.invalidar()
        r = _get(cliente, "/productos", q="nitrilo")
        assert [p["descripcion"] for p in r.json()] == ["CAJA GUANTE NITRILO"]

    def test_primero_los_indexables(self, analytics, cliente):
        slugs = [p["slug"] for p in _get(cliente, "/productos", q="guante").json()]
        assert slugs == ["guante-nitrilo", "guante-latex"]

    def test_limite(self, analytics, cliente):
        assert len(_get(cliente, "/productos", q="guante", limite=1).json()) == 1

    @pytest.mark.parametrize(
        "params", [{}, {"q": "g"}, {"q": "guante", "limite": 0}, {"q": "guante", "limite": 51}]
    )
    def test_parametros_invalidos_son_422(self, analytics, cliente, params):
        assert _get(cliente, "/productos", **params).status_code == 422


def test_sin_analytics_es_503(cliente, monkeypatch):
    monkeypatch.setattr(settings, "feature_analytics", False)
    assert _get(cliente, "/sitemap").status_code == 503


def _claves(valor, encontradas: set[str]) -> set[str]:
    if isinstance(valor, dict):
        for k, v in valor.items():
            encontradas.add(k.lower())
            _claves(v, encontradas)
    elif isinstance(valor, list):
        for v in valor:
            _claves(v, encontradas)
    return encontradas


def test_ninguna_respuesta_trae_un_rut_ni_un_codigo_de_proveedor(analytics, cliente):
    """Spec del pivote §8. El RUT de una persona está sembrado en las tablas
    (`RutProveedor`, el `top_proveedor` de la concentración) y el código de
    proveedor también: nada de eso puede salir por aquí."""
    rutas = [
        "/sitemap",
        "/compradores/7297",
        "/compradores/1",
        "/rubros/equipos-medicos",
        "/rubros/aseo-limpieza",
        "/productos/guante-nitrilo",
        "/productos/guante-latex",
    ]
    respuestas = [_get(cliente, r) for r in rutas]
    respuestas.append(_get(cliente, "/productos", q="guante"))
    for r in respuestas:
        assert r.status_code == 200, r.url
        texto = json.dumps(r.json(), ensure_ascii=False)
        assert not ruts_de_persona(texto), f"{r.url} trae un RUT de persona"
        assert "1595644" not in texto, f"{r.url} trae un código de proveedor"
        claves = _claves(r.json(), set())
        assert not {c for c in claves if "rut" in c or ("proveedor" in c and "codigo" in c)}, r.url


class TestBusquedaConLaReglaDeLaFirma:
    """El término pasa por la regla de la firma (`app/utils/firma.py`).

    Firmas con la forma real: los artículos ya no están (los quitó el ETL) y las
    tildes sí. Las cifras son las de los ejemplos de la spec del rediseño §1.3.5.
    """

    @pytest.fixture
    def firmas(self, analytics):
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("guantes nitrilo talla", "caja", 272, "alta", 9_000.0),
            _banda("arriendo conductor vehículos", "mes", 12, "media", 900_000.0),
            _banda("desechables guantes talla", "caja", 30, "alta", 5_000.0),
            _banda("aseo concepcion servicio", "mes", 15, "alta", 1_000_000.0),
            _banda("parmesano queso rallado", "kg", 11, "alta", 20_000.0),
            _banda("mesa reuniones", "unidad", 10, "alta", 150_000.0),
        ]
        indexables.invalidar()
        yield analytics
        indexables.invalidar()

    def _slugs(self, cliente, q):
        r = _get(cliente, "/productos", q=q)
        assert r.status_code == 200
        return [p["slug"] for p in r.json()]

    def test_guantes_de_nitrilo_encuentra_la_firma_sin_el_de(self, firmas, cliente):
        assert self._slugs(cliente, "guantes de nitrilo") == ["guantes-nitrilo-talla"]

    @pytest.mark.parametrize("q", ["arriendo de vehículos", "ARRIENDO DE VEHICULOS"])
    def test_arriendo_de_vehiculos_con_y_sin_tilde(self, firmas, cliente, q):
        assert self._slugs(cliente, q) == ["arriendo-conductor-vehiculos"]

    def test_los_digitos_del_termino_no_cuentan(self, firmas, cliente):
        assert self._slugs(cliente, "guantes nitrilo 100") == ["guantes-nitrilo-talla"]

    def test_la_palabra_se_busca_al_comienzo_no_dentro_de_otra(self, firmas, cliente):
        """«mesa» no encuentra «parmesano» (`repositories/busqueda.py`), y el
        comienzo de una palabra sigue bastando: «parmes», «guante»."""
        assert self._slugs(cliente, "mesa") == ["mesa-reuniones"]
        assert self._slugs(cliente, "parmes") == ["parmesano-queso-rallado"]
        assert self._slugs(cliente, "rallado queso") == ["parmesano-queso-rallado"]
        assert self._slugs(cliente, "esano") == []
        assert set(self._slugs(cliente, "guante")) == {
            "guantes-nitrilo-talla",
            "desechables-guantes-talla",
        }

    @pytest.mark.parametrize("q", ["de la", "pc"])
    def test_sin_palabras_utiles_es_una_lista_vacia_y_no_un_error(self, firmas, cliente, q):
        """Antes, «de la» encontraba «desechables … talla» y «pc» encontraba
        «concepcion»: letras sueltas dentro de otra palabra."""
        assert self._slugs(cliente, q) == []


class TestBusquedaConLasOtrasFormas:
    """Plural, género y sinónimos (`app/utils/sinonimos.py`) en `/productos?q=`.

    Medido en la copia local: «lápices» encontraba 20 productos y dejaba fuera
    los 165 de «lápiz»; «guantes», los 385 de «guante».
    """

    @pytest.fixture
    def firmas(self, analytics):
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("grafito lapiz", "unidad", 40, "alta", 300.0),
            _banda("azul boligrafo", "unidad", 90, "alta", 250.0),
            _banda("latex guante", "caja", 50, "alta", 4_000.0),
            _banda("escritorio notebook", "unidad", 12, "alta", 600_000.0),
            _banda("pcr reactivo", "kit", 15, "alta", 90_000.0),
            _banda("comedor mesa", "unidad", 10, "alta", 150_000.0),
        ]
        indexables.invalidar()
        yield analytics
        indexables.invalidar()

    def _slugs(self, cliente, q):
        r = _get(cliente, "/productos", q=q)
        assert r.status_code == 200
        return [p["slug"] for p in r.json()]

    @pytest.mark.parametrize("q", ["lapices", "lápiz", "LÁPIZ"])
    def test_lapices_encuentra_lapiz_y_primero_lo_escrito(self, firmas, cliente, q):
        """El bolígrafo tiene más compras, pero sólo responde por sinónimo."""
        assert self._slugs(cliente, q) == ["grafito-lapiz", "azul-boligrafo"]

    def test_guantes_encuentra_guante(self, firmas, cliente):
        assert self._slugs(cliente, "guantes de látex") == ["latex-guante"]

    def test_pc_encuentra_computadores_y_no_pcr(self, firmas, cliente):
        assert self._slugs(cliente, "pc") == ["escritorio-notebook"]

    def test_mesas_no_encuentra_meses(self, firmas, cliente):
        assert self._slugs(cliente, "mesas") == ["comedor-mesa"]
        assert self._slugs(cliente, "meses") == []


@pytest.mark.parametrize("sin_nombre", [None, "", "   "])
def test_un_perfil_sin_nombre_toma_el_de_sus_mercados(analytics, cliente, sin_nombre):
    """`buyer_scores` saca el nombre de las licitaciones: un comprador con órdenes
    y sin licitaciones en la ventana llegaba sin él (47 de 1.303 en la copia local),
    y su página indexable salía con el `h1` vacío."""
    analytics["buyer_scores.parquet"] = [
        {
            "CodigoOrganismoPublico": "7297",
            "NombreOrganismo": sin_nombre,
            "buyer_score": 0.8,
            "clasificacion": "bueno",
            "n_oc_total": 5000,
            "n_meses_activo": 30,
        }
    ]
    indexables.invalidar()
    cuerpo = _get(cliente, "/compradores/7297").json()
    assert cuerpo["nombre"] == "HOSPITAL DE PRUEBA"
    assert cuerpo["indexable"] is True


class TestBuscarCompradores:
    """`GET /publico/compradores?q=`: llegar a la ficha de un comprador por su nombre."""

    def _codigos(self, cliente, q, **params):
        r = _get(cliente, "/compradores", q=q, **params)
        assert r.status_code == 200
        return [c["codigo"] for c in r.json()]

    def test_por_su_nombre_sin_tildes_ni_mayusculas(self, analytics, cliente):
        assert self._codigos(cliente, "hospital de prueba") == ["7297"]
        assert self._codigos(cliente, "HOSPITAL") == ["7297"]
        assert self._codigos(cliente, "municipalidad chica") == ["1"]

    def test_cada_palabra_al_comienzo_de_una_palabra_y_en_cualquier_orden(self, analytics, cliente):
        assert self._codigos(cliente, "prueba hosp") == ["7297"]
        assert self._codigos(cliente, "spital") == []
        assert self._codigos(cliente, "hospitales") == ["7297"]

    def test_primero_los_indexables(self, analytics, cliente):
        """Los dos se llaman «Hospital…»: primero el que tiene ficha indexable."""
        analytics["buyer_scores.parquet"] = [
            {
                "CodigoOrganismoPublico": "7297",
                "NombreOrganismo": "HOSPITAL DE PRUEBA",
                "n_oc_total": 5000,
            },
            {"CodigoOrganismoPublico": "1", "NombreOrganismo": "HOSPITAL CHICO", "n_oc_total": 3},
        ]
        indexables.invalidar()
        cuerpo = _get(cliente, "/compradores", q="hospital").json()
        assert [c["codigo"] for c in cuerpo] == ["7297", "1"]
        assert [c["indexable"] for c in cuerpo] == [True, False]
        assert cuerpo[0]["n"] == 5000

    def test_sin_palabras_utiles_no_busca(self, analytics, cliente):
        assert self._codigos(cliente, "de la") == []

    def test_respeta_el_limite(self, analytics, cliente):
        assert len(self._codigos(cliente, "hospital", limite=1)) == 1
        assert _get(cliente, "/compradores", q="hospital", limite=0).status_code == 422


def test_buscar_comprador_pone_antes_la_palabra_entera(analytics, cliente):
    """«talca» empieza «Talcahuano», que compra más; el de Talca va primero."""
    analytics["buyer_scores.parquet"] = [
        {
            "CodigoOrganismoPublico": "7297",
            "NombreOrganismo": "HOSPITAL DE TALCAHUANO",
            "n_oc_total": 9000,
        },
        {"CodigoOrganismoPublico": "1", "NombreOrganismo": "HOSPITAL DE TALCA", "n_oc_total": 900},
    ]
    analytics["market_concentration.parquet"] = [
        _mercado("7297", "HOSPITAL DE TALCAHUANO", "Equipos médicos", 120, 9_000_000.0),
        _mercado("1", "HOSPITAL DE TALCA", "Equipos médicos", 40, 1_000_000.0),
    ]
    indexables.invalidar()
    cuerpo = _get(cliente, "/compradores", q="hospital talca").json()
    assert [c["codigo"] for c in cuerpo] == ["1", "7297"]

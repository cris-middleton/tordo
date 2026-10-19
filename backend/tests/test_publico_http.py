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

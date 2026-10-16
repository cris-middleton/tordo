"""Qué páginas públicas existen y cuáles se indexan (`services/publico/indexables.py`).

Con tablas en memoria: lo que se fija aquí son los CRITERIOS —umbrales,
colisiones de slug, caché—, no el SQL, que es el mismo `_load` del resto del BI.
"""

from __future__ import annotations

import pytest

from app.services.publico import indexables
from tests.analytics_en_memoria import AnalyticsEnMemoria

MIN_OC = indexables.MIN_ORDENES_COMPRADOR
MIN_N = indexables.MIN_COMPRAS_PRODUCTO


def _mercado(codigo: str, rubro: str, n: int = 5, nombre: str | None = None) -> dict:
    return {
        "CodigoOrganismoPublico": codigo,
        "OrganismoPublico": nombre or f"ORGANISMO {codigo}",
        "RubroN2": rubro,
        "n_transacciones": n,
        "monto_total_mercado": 1000.0 * n,
        "ventana_desde": "2023-10-01",
        "ventana_hasta": "2026-09-30",
    }


def _competidor(rubro: str) -> dict:
    return {"CodigoOrganismoPublico": "1", "RubroN2": rubro, "CodigoProveedor": "9"}


def _banda(
    firma: str,
    n: int,
    predictibilidad: str = "alta",
    unidad: str = "unidad",
    compradores: int = 5,
    cuota_mayor: float = 0.2,
) -> dict:
    return {
        "firma_producto": firma,
        "UnidadMedida": unidad,
        "n": n,
        "predictibilidad": predictibilidad,
        "compradores": compradores,
        "cuota_mayor": cuota_mayor,
    }


@pytest.fixture
def analytics(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos.instalar(monkeypatch, indexables)
    indexables.invalidar()
    yield datos
    indexables.invalidar()


class TestCompradores:
    def test_indexable_con_volumen_y_mercado_en_la_ventana(self, analytics):
        analytics["buyer_scores.parquet"] = [
            {"CodigoOrganismoPublico": "1", "NombreOrganismo": "UNO", "n_oc_total": MIN_OC},
            {"CodigoOrganismoPublico": "2", "NombreOrganismo": "DOS", "n_oc_total": MIN_OC - 1},
            {"CodigoOrganismoPublico": "3", "NombreOrganismo": "TRES", "n_oc_total": 10_000},
        ]
        analytics["market_concentration.parquet"] = [
            _mercado("1", "Aseo"),
            _mercado("2", "Aseo"),
            _mercado("4", "Aseo"),  # con mercado pero sin perfil
        ]
        df = indexables.construir().compradores
        estado = dict(zip(df["codigo"], df["indexable"], strict=True))

        # 1: las dos cosas. 2: pocas órdenes. 3: sin mercado en la ventana.
        # 4: sin perfil. Los cuatro tienen página; sólo el 1 se indexa.
        assert estado == {"1": True, "2": False, "3": False, "4": False}

    def test_el_nombre_es_el_del_perfil_de_mas_ordenes(self, analytics):
        """Un comprador renombrado tiene dos filas hasta re-materializar."""
        analytics["buyer_scores.parquet"] = [
            {"CodigoOrganismoPublico": "1", "NombreOrganismo": "VIEJO", "n_oc_total": 60},
            {"CodigoOrganismoPublico": "1", "NombreOrganismo": "NUEVO", "n_oc_total": 900},
        ]
        analytics["market_concentration.parquet"] = [_mercado("1", "Aseo", nombre="OTRO")]
        df = indexables.construir().compradores
        assert df.to_dicts() == [{"codigo": "1", "nombre": "NUEVO", "indexable": True}]


class TestRubros:
    def test_colision_de_slug_gana_el_de_mas_ordenes(self, analytics):
        analytics["market_concentration.parquet"] = [
            _mercado("1", "Servicios Legales", n=85),
            _mercado("2", "Servicios legales", n=60),
            _mercado("3", "Servicios legales", n=40),
            _mercado("1", "Equipos médicos", n=5),
            _mercado("1", "NA", n=999),
        ]
        analytics["competitors_by_market.parquet"] = [
            _competidor("Servicios legales"),
            _competidor("Equipos médicos"),
        ]
        df = indexables.construir().rubros
        por_slug = dict(zip(df["slug"], df["nombre"], strict=True))

        # 60 + 40 = 100 > 85: se suma por rubro antes de comparar.
        assert por_slug == {
            "servicios-legales": "Servicios legales",
            "equipos-medicos": "Equipos médicos",
        }
        assert df["indexable"].all()

    def test_indexable_solo_con_competidores(self, analytics):
        """Sin filas en `competitors_by_market` el panorama sale vacío —la
        página dice «Sin datos históricos»—: existe, pero no se indexa."""
        analytics["market_concentration.parquet"] = [
            _mercado("1", "Aseo"),
            _mercado("1", "Equipos médicos"),
        ]
        analytics["competitors_by_market.parquet"] = [_competidor("Equipos médicos")]
        df = indexables.construir().rubros
        estado = dict(zip(df["slug"], df["indexable"], strict=True))
        assert estado == {"aseo": False, "equipos-medicos": True}

    def test_sin_tabla_de_competidores_no_se_indexa_ninguno(self, analytics):
        analytics["market_concentration.parquet"] = [_mercado("1", "Aseo")]
        df = indexables.construir().rubros
        assert df["slug"].to_list() == ["aseo"]
        assert not df["indexable"].any()

    def test_la_colision_se_resuelve_antes_que_el_criterio(self, analytics):
        """El ganador del slug es el de más órdenes aunque no tenga datos: la
        URL no cambia de destino según qué tabla se llenó esta semana."""
        analytics["market_concentration.parquet"] = [
            _mercado("1", "Servicios Legales", n=85),
            _mercado("2", "Servicios legales", n=10),
        ]
        analytics["competitors_by_market.parquet"] = [_competidor("Servicios legales")]
        df = indexables.construir().rubros
        assert df.to_dicts() == [
            {
                "slug": "servicios-legales",
                "nombre": "Servicios Legales",
                "n": 85,
                "indexable": False,
            }
        ]


class TestProductos:
    def test_criterio_de_indexable(self, analytics):
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("guante latex", MIN_N, "alta"),
            _banda("guante nitrilo", MIN_N, "media"),
            _banda("guante vinilo", MIN_N, "baja"),
            _banda("guante seda", MIN_N - 1, "alta"),
            # Basta UNA unidad que cumpla.
            _banda("papel resma", 3, "alta", unidad="caja"),
            _banda("papel resma", 40, "media", unidad="resma"),
        ]
        df = indexables.construir().productos
        estado = dict(zip(df["slug"], df["indexable"], strict=True))
        assert estado == {
            "guante-latex": True,
            "guante-nitrilo": True,
            "guante-vinilo": False,
            "guante-seda": False,
            "papel-resma": True,
        }
        # El n de la página es el de todas sus unidades.
        assert df.filter(df["slug"] == "papel-resma")["n"].item() == 43

    def test_un_precio_de_mercado_necesita_varios_compradores(self, analytics):
        """Decisión del dueño (2026-10-16): ≥ 3 compradores y ninguno con más de
        la mitad de las compras. Una banda de un solo organismo es el precio de
        su contrato, no el del Estado."""
        minimo = indexables.MIN_COMPRADORES_PRODUCTO
        tope = indexables.CUOTA_MAXIMA_COMPRADOR
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("cloro litro", 40, compradores=minimo, cuota_mayor=tope),
            _banda("cloro gel", 40, compradores=minimo - 1, cuota_mayor=0.5),
            _banda("cloro tableta", 40, compradores=1, cuota_mayor=1.0),
            _banda("cloro bidon", 40, compradores=12, cuota_mayor=0.51),
            # La banda que cumple n y predictibilidad tiene que ser LA MISMA que
            # cumple compradores: no se suman méritos de dos unidades.
            _banda("cloro pastilla", 40, "baja", unidad="caja", compradores=9),
            _banda("cloro pastilla", 40, "alta", unidad="unidad", compradores=1, cuota_mayor=1.0),
        ]
        df = indexables.construir().productos
        estado = dict(zip(df["slug"], df["indexable"], strict=True))
        assert estado == {
            "cloro-litro": True,
            "cloro-gel": False,
            "cloro-tableta": False,
            "cloro-bidon": False,
            "cloro-pastilla": False,
        }

    def test_una_tabla_sin_compradores_no_indexa_ningun_producto(self, analytics):
        """Materializada antes de que la banda contara sus compradores: no se
        sabe si el precio es de mercado, así que no se ofrece a un buscador.
        Las páginas siguen existiendo (con `noindex`)."""
        fila = _banda("cloro litro", 40)
        del fila["compradores"], fila["cuota_mayor"]
        analytics["product_price_bands_L0N.parquet"] = [fila]
        df = indexables.construir().productos
        assert df.to_dicts() == [
            {"slug": "cloro-litro", "firma": "cloro litro", "n": 40, "indexable": False}
        ]

    def test_colision_con_y_sin_tilde(self, analytics):
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("guante látex", 30),
            _banda("guante latex", 12),
        ]
        df = indexables.construir().productos
        assert df.to_dicts() == [
            {"slug": "guante-latex", "firma": "guante látex", "n": 30, "indexable": True}
        ]

    def test_el_desempate_es_determinista(self, analytics):
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("guante latex", 20),
            _banda("guante látex", 20),
        ]
        primero = indexables.construir().productos["firma"].to_list()
        analytics["product_price_bands_L0N.parquet"] = [
            _banda("guante látex", 20),
            _banda("guante latex", 20),
        ]
        assert indexables.construir().productos["firma"].to_list() == primero


class TestSinAnalytics:
    def test_tablas_ausentes_dan_un_indice_vacio(self, analytics):
        indice = indexables.construir()
        assert indice.compradores.is_empty()
        assert indice.rubros.is_empty()
        assert indice.productos.is_empty()
        assert indice.periodo is None

    def test_el_periodo_sale_de_la_ventana(self, analytics):
        analytics["market_concentration.parquet"] = [_mercado("1", "Aseo")]
        assert indexables.construir().periodo == {"desde": "2023-10-01", "hasta": "2026-09-30"}


class TestCache:
    def test_se_construye_una_vez_hasta_que_expira(self, analytics, monkeypatch):
        llamadas = []
        real = indexables.construir

        def contar():
            llamadas.append(1)
            return real()

        monkeypatch.setattr(indexables, "construir", contar)
        reloj = [1000.0]
        monkeypatch.setattr(indexables, "_reloj", lambda: reloj[0])

        indexables.indice()
        indexables.indice()
        assert len(llamadas) == 1

        reloj[0] += indexables.TTL_SEGUNDOS + 1
        indexables.indice()
        assert len(llamadas) == 2

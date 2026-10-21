"""Las métricas del dashboard, fijadas con un caso donde el error se ve.

Todo lo que se prueba aquí falla con el código anterior. No son tests de
regresión defensivos: son la definición de qué significa cada número, escrita
después de encontrar que tres de ellos significaban otra cosa.

El caso está construido a imagen del problema real: `competitors_by_market`
tiene una fila por *(organismo, rubro, proveedor)*, así que un proveedor con
muchos compradores aparece muchas veces. Cualquier métrica que cuente filas o
que tome una fila suelta como representativa del rubro está mal.
"""

from __future__ import annotations

import polars as pl
import pytest

from app.services.bi import competencia, temporal
from app.services.bi import rubro as svc_rubro
from app.services.bi._base import clasificar_hhi
from tests.analytics_en_memoria import AnalyticsEnMemoria

RUBRO = "Servicios de aseo"


# ── El mercado de juguete ────────────────────────────────────────────────────
#
#   Grande  (11111111-1) gana 1 orden enorme en 1 comprador   → 800 de monto,  1 OC
#   Hormiga (22222222-2) gana 60 órdenes chicas en 3          → 120 de monto, 60 OC
#   Mediano (33333333-3) gana 20 órdenes en 2                 →  80 de monto, 20 OC
#
# Los códigos tienen forma de RUT a propósito: `_normalize_rut` inserta un
# guion antes del último carácter, así que un identificador que no lo sea sale
# deformado y no coincide con nada.
#
# Total del rubro: 1.000 de monto, 81 órdenes, 3 proveedores, 4 compradores.
# Y SEIS filas — que es exactamente lo que el código viejo contaba como
# «proveedores».

COMPETIDORES = pl.DataFrame(
    [
        {
            "CodigoOrganismoPublico": "A",
            "CodigoProveedor": "11111111-1",
            "NombreProveedor": "Grande SA",
            "monto_total": 800.0,
            "n_oc": 1,
        },
        {
            "CodigoOrganismoPublico": "A",
            "CodigoProveedor": "22222222-2",
            "NombreProveedor": "Hormiga Ltda",
            "monto_total": 40.0,
            "n_oc": 20,
        },
        {
            "CodigoOrganismoPublico": "B",
            "CodigoProveedor": "22222222-2",
            "NombreProveedor": "Hormiga Ltda",
            "monto_total": 40.0,
            "n_oc": 20,
        },
        {
            "CodigoOrganismoPublico": "C",
            "CodigoProveedor": "22222222-2",
            "NombreProveedor": "Hormiga Ltda",
            "monto_total": 40.0,
            "n_oc": 20,
        },
        {
            "CodigoOrganismoPublico": "B",
            "CodigoProveedor": "33333333-3",
            "NombreProveedor": "Mediano SpA",
            "monto_total": 40.0,
            "n_oc": 10,
        },
        {
            "CodigoOrganismoPublico": "D",
            "CodigoProveedor": "33333333-3",
            "NombreProveedor": "Mediano SpA",
            "monto_total": 40.0,
            "n_oc": 10,
        },
    ]
)


def _instalar(monkeypatch, tablas: dict[str, pl.DataFrame]) -> AnalyticsEnMemoria:
    """Las tablas en memoria para los servicios: lecturas, agregados y conteos.

    El agregado por proveedor va en SQL (`_agregado`, `_totales`): un doble que
    sólo cambiara `_load` dejaría esas consultas yendo a la base de verdad.
    """
    datos = AnalyticsEnMemoria()
    datos.tablas.update(tablas)
    datos.instalar(monkeypatch, competencia, svc_rubro, temporal)
    return datos


@pytest.fixture
def mercado(monkeypatch):
    tablas = {
        "competitors_by_market.parquet": COMPETIDORES.with_columns(pl.lit(RUBRO).alias("RubroN2"))
    }
    _instalar(monkeypatch, tablas)
    return tablas


# ── Panorama: competencia ────────────────────────────────────────────────────


class TestCompetenciaDelRubro:
    def test_el_lider_es_el_del_rubro(self, mercado):
        p = svc_rubro.get_panorama(RUBRO)["competencia"]
        assert p["lideres"][0]["nombre"] == "Grande SA"
        assert p["lideres"][0]["share_pct"] == pytest.approx(80.0)

    def test_la_cuota_por_ordenes_cuenta_otra_historia(self, mercado):
        """GRANDE tiene el 80 % del monto y el 1,2 % de las órdenes; HORMIGA al
        revés. Publicar sólo el monto le diría a una PYME que el mercado está
        tomado cuando lo que hay son compras chicas repartidas."""
        lideres = {x["nombre"]: x for x in svc_rubro.get_panorama(RUBRO)["competencia"]["lideres"]}
        assert lideres["Grande SA"]["share_oc_pct"] == pytest.approx(1.23, abs=0.01)
        assert lideres["Hormiga Ltda"]["share_oc_pct"] == pytest.approx(74.07, abs=0.01)

    def test_el_hhi_sale_de_las_cuotas_del_rubro(self, mercado):
        """80² + 12² + 8² = 6.400 + 144 + 64 = 6.608 → concentrado."""
        p = svc_rubro.get_panorama(RUBRO)["competencia"]
        assert p["hhi"] == 6608
        assert p["tipo_mercado"] == "concentrado"

    def test_cuenta_proveedores_y_compradores_distintos(self, mercado):
        p = svc_rubro.get_panorama(RUBRO)["competencia"]
        assert p["n_proveedores"] == 3
        assert p["n_compradores"] == 4

    @pytest.mark.parametrize(
        ("hhi", "esperado"),
        [(0, "fragmentado"), (1500, "fragmentado"), (1501, "moderado"), (2501, "concentrado")],
    )
    def test_los_cortes_del_hhi_son_los_de_la_literatura(self, hhi, esperado):
        """1.500 y 2.500 son los umbrales de las guías de competencia (DOJ/FTC).
        Están aquí para que nadie los mueva por intuición."""
        assert clasificar_hhi(hhi) == esperado


# ── Panorama: estacionalidad ─────────────────────────────────────────────────


class TestEstacionalidad:
    def _con_meses(self, monkeypatch, compras_por_mes: list[int]):
        filas = [
            {"RubroN2": RUBRO, "CodigoOrganismoPublico": org, "mes": i + 1, "compras_mes": c}
            for org in ("A", "B")
            for i, c in enumerate(compras_por_mes)
        ]
        _instalar(monkeypatch, {"seasonality_patterns.parquet": pl.DataFrame(filas)})

    def test_suma_todos_los_compradores_del_rubro(self, monkeypatch):
        """La estacionalidad que existía era la de UN organismo. Para decidir
        cuándo tener el equipo disponible, lo que importa es el mercado."""
        self._con_meses(monkeypatch, [10] * 12)
        e = svc_rubro._estacionalidad_del_rubro(RUBRO)
        assert len(e["meses"]) == 12
        assert all(m["pct"] == pytest.approx(8.3, abs=0.1) for m in e["meses"])

    def test_un_reparto_plano_no_tiene_temporada(self, monkeypatch):
        self._con_meses(monkeypatch, [10] * 12)
        assert svc_rubro._estacionalidad_del_rubro(RUBRO)["tiene_temporada"] is False

    def test_una_concentracion_real_sí_la_tiene(self, monkeypatch):
        """Diciembre, noviembre y octubre con el 60 % del año."""
        self._con_meses(monkeypatch, [4] * 9 + [20, 20, 20])
        e = svc_rubro._estacionalidad_del_rubro(RUBRO)
        assert e["tiene_temporada"] is True
        assert e["mes_pico"] in ("Oct", "Nov", "Dic")

    def test_sin_datos_lo_dice(self, monkeypatch):
        _instalar(monkeypatch, {})
        assert svc_rubro._estacionalidad_del_rubro(RUBRO)["disponible"] is False


# ── Panorama: entero ─────────────────────────────────────────────────────────


class TestPanorama:
    def test_sin_rubro_no_consulta_nada(self):
        assert svc_rubro.get_panorama("")["disponible"] is False

    def test_un_rubro_sin_histórico_lo_dice_una_vez(self, monkeypatch):
        """Cuatro bloques vacíos obligan al frontend a decidir qué significa el
        conjunto. Una respuesta no disponible con motivo, no."""
        _instalar(monkeypatch, {})
        r = svc_rubro.get_panorama("Rubro que no existe")
        assert r["disponible"] is False
        assert "Rubro que no existe" in r["motivo"]

    def test_devuelve_los_cuatro_bloques(self, mercado):
        r = svc_rubro.get_panorama(RUBRO)
        assert r["disponible"] is True
        assert set(r) >= {"mercado", "competencia", "estacionalidad", "vigilar"}

"""`/bi/precio`: el total de verdad, cinco rubros que no son al azar, y L0N
leída con tope.

- `total_registros` se contaba DESPUÉS de cortar a `MAX_PRODUCTOS_L0`: con 300
  productos en la categoría, decía 12.
- El nivel L4 tomaba `head(5)` de una lectura sin `ORDER BY`: cinco rubros del
  organismo cualesquiera, los que Postgres leyera primero.
- L0N se leía entera para la categoría, con todas sus columnas, y se ordenaba en
  Polars para quedarse con doce. La categoría `0` (las órdenes sin código ONU)
  tiene miles de productos.
"""

from __future__ import annotations

import pytest

from app.services.bi import precio
from tests.analytics_en_memoria import AnalyticsEnMemoria


class Registro(AnalyticsEnMemoria):
    def __init__(self) -> None:
        super().__init__()
        self.lecturas: list[dict] = []

    def _load(self, filename, **kwargs):
        self.lecturas.append({"tabla": filename, **kwargs})
        return super()._load(filename, **kwargs)


def _producto(i: int, n: int, **extra) -> dict:
    return {
        "firma_producto": f"producto {i:03d}",
        "descripcion": f"Producto {i}",
        "codigoProductoONU": "0",
        "NombreroductoGenerico": "Sin código",
        "UnidadMedida": "Unidad",
        "p10": 1.0,
        "p25": 2.0,
        "p50": 3.0,
        "p75": 4.0,
        "p90": 5.0,
        "pu_mean": 3.0,
        "cv": 0.1,
        "qcd": 0.1,
        "predictibilidad": "alta",
        "confianza": 0.9,
        "n": n,
        "pu_std": 9.9,
        "ventana_desde": "2025-10-01",
        "ventana_hasta": "2026-10-20",
        **extra,
    }


@pytest.fixture
def datos(monkeypatch) -> Registro:
    d = Registro()
    # 30 productos en la categoría; empates de `n` de dos en dos.
    d["product_price_bands_L0N.parquet"] = [_producto(i, 100 - i // 2) for i in range(30)]
    d.instalar(monkeypatch, precio)
    return d


def test_l0n_dice_cuantos_productos_hay_no_cuantos_devuelve(datos):
    r = precio.get_precio_producto("0")

    assert r["nivel_usado"] == "L0N"
    assert len(r["resultado"]) == precio.MAX_PRODUCTOS_L0
    assert r["total_registros"] == 30


def test_l0n_se_lee_con_tope_orden_y_columnas(datos):
    precio.get_precio_producto("0")

    (lectura,) = [x for x in datos.lecturas if x["tabla"] == "product_price_bands_L0N.parquet"]
    assert lectura["limite"] == precio.MAX_PRODUCTOS_L0
    assert (lectura["orden"], lectura["desempate_texto"]) == ("n", "firma_producto")
    # Sólo lo que la respuesta usa, más la ventana para el periodo.
    assert "pu_std" not in lectura["columnas"]
    assert {"ventana_desde", "ventana_hasta"} <= set(lectura["columnas"])


def test_l0n_ordena_por_compras_y_desempata_por_firma(datos):
    r = precio.get_precio_producto("0")

    firmas = [x["firma_producto"] for x in r["resultado"]]
    assert firmas == [f"producto {i:03d}" for i in range(12)]
    assert r["periodo"] == {"desde": "2025-10-01", "hasta": "2026-10-20"}


def test_l0_tambien_cuenta_el_total(monkeypatch):
    d = Registro()
    d["product_price_bands_L0.parquet"] = [
        _producto(i, 10, CodigoOrganismoPublico="7084", OrganismoPublico="H") for i in range(15)
    ]
    d.instalar(monkeypatch, precio)

    r = precio.get_precio_producto("0", organismo_id="7084")

    assert (r["nivel_usado"], len(r["resultado"]), r["total_registros"]) == ("L0", 12, 15)


def _rubro(nombre: str, n: int) -> dict:
    return {
        "CodigoOrganismoPublico": "7084",
        "RubroN2": nombre,
        "n_transacciones": n,
        "precio_promedio": 1.0,
        "precio_mediana": 1.0,
        "p10": 1.0,
        "p25": 1.0,
        "p75": 1.0,
        "p90": 1.0,
        "coef_variacion": 0.1,
    }


def test_l4_son_los_cinco_rubros_con_mas_transacciones(monkeypatch):
    d = Registro()
    d["price_bands.parquet"] = [
        _rubro("Zapatos", 1),
        _rubro("Bebidas", 50),
        _rubro("Aseo", 9),
        _rubro("Obras", 50),
        _rubro("Insumos", 30),
        _rubro("Árboles", 9),
        _rubro("Alimentos", 9),
    ]
    d.instalar(monkeypatch, precio)

    r = precio.get_precio_producto("99999999", organismo_id="7084")

    assert r["nivel_usado"] == "L4"
    # Más transacciones primero; empate por nombre en bytes (como Polars):
    # «Alimentos» y «Aseo» antes que «Árboles».
    assert [x["NombreProductoGenerico"] for x in r["resultado"]] == [
        "Bebidas",
        "Obras",
        "Insumos",
        "Alimentos",
        "Aseo",
    ]
    (lectura,) = [x for x in d.lecturas if x["tabla"] == "price_bands.parquet"]
    assert (lectura["orden"], lectura["desempate_texto"], lectura["limite"]) == (
        "n_transacciones",
        "RubroN2",
        5,
    )

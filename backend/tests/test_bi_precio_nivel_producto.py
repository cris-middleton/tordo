"""El nivel de producto real en la cascada de precios.

`get_precio_producto` recibe un **código UNSPSC**, que es una categoría. Los
niveles L0/L0N agrupan por producto real (la firma de `EspecificacionComprador`)
y llevan el código dentro para poder encontrarse desde ahí.

Se prueba con un doble de las tablas en vez de con la base: lo que hay que fijar aquí
es el **orden de la cascada y la forma de la respuesta**, no el SQL — que ya lo
cubre el golden master.
"""

from __future__ import annotations

import polars as pl
import pytest

from app.services.bi import precio as servicio
from tests.analytics_en_memoria import AnalyticsEnMemoria

CODIGO = "41116000"
ORGANISMO = "7416"


def _banda(**kv) -> dict:
    base = {
        "codigoProductoONU": CODIGO,
        "NombreroductoGenerico": "Reactivos o soluciones químicos",
        "CodigoOrganismoPublico": ORGANISMO,
        "OrganismoPublico": "HOSPITAL DE PRUEBA",
        "UnidadMedida": "unidad",
        "p10": 90.0,
        "p25": 95.0,
        "p50": 100.0,
        "p75": 105.0,
        "p90": 110.0,
        "pu_mean": 100.0,
        "cv": 0.05,
        "qcd": 0.05,
        "predictibilidad": "alta",
        "confianza": 0.8,
        "n": 20,
    }
    return {**base, **kv}


@pytest.fixture
def tablas(monkeypatch) -> dict[str, pl.DataFrame]:
    """Las tablas en memoria, con filtros, orden, tope y columnas como el SQL.

    L0 y L0N empujan a SQL el orden por muestra y el tope de productos, y
    preguntan qué columnas tiene la tabla y cuántas filas cumplen el filtro: un
    doble que devolviera la tabla entera sin filtrar no probaría ese recorte.
    """
    datos = AnalyticsEnMemoria()
    datos.instalar(monkeypatch, servicio)
    return datos.tablas


class TestCascada:
    def test_el_nivel_de_producto_gana_al_de_categoria(self, tablas):
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(
            [_banda(firma_producto="guantes nitrilo", descripcion="GUANTES NITRILO M")]
        )
        tablas["product_price_bands_L1.parquet"] = pl.DataFrame([_banda(p50=50_000.0)])

        r = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)

        assert r["nivel_usado"] == "L0"
        assert r["fallback"] is False
        assert r["resultado"][0]["descripcion"] == "GUANTES NITRILO M"

    def test_sin_nivel_de_producto_el_comportamiento_es_el_de_siempre(self, tablas):
        """La compatibilidad no es cortesía: el fixture del golden master se
        capturó sin estos niveles, y es lo que fija el contrato de L1→L4."""
        tablas["product_price_bands_L1.parquet"] = pl.DataFrame([_banda()])

        r = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)

        assert r["nivel_usado"] == "L1"
        assert r["fallback"] is False

    def test_una_tabla_sin_la_columna_de_firma_no_se_toma_por_nivel_cero(self, tablas):
        """Defensa contra una materialización a medias.

        Si `product_price_bands_l0` existe con el esquema viejo —o vacía y con
        otras columnas—, tratarla como nivel 0 devolvería una banda de categoría
        etiquetada como producto: peor que no tenerla.
        """
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame([_banda()])  # sin firma_producto
        tablas["product_price_bands_L1.parquet"] = pl.DataFrame([_banda()])

        assert servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)["nivel_usado"] == "L1"

    def test_sin_organismo_se_va_al_nivel_de_producto_nacional(self, tablas):
        tablas["product_price_bands_L0N.parquet"] = pl.DataFrame(
            [
                {
                    k: v
                    for k, v in _banda(
                        firma_producto="guantes nitrilo", descripcion="GUANTES NITRILO M"
                    ).items()
                    if k not in ("CodigoOrganismoPublico", "OrganismoPublico")
                }
            ]
        )
        tablas["product_price_bands_L3.parquet"] = pl.DataFrame([_banda()])

        r = servicio.get_precio_producto(CODIGO)

        assert r["nivel_usado"] == "L0N"
        assert r["fallback"] is True
        assert "referencia nacional" in r["fallback_motivo"]

    def test_el_nivel_de_producto_de_otro_organismo_no_se_cuela(self, tablas):
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(
            [_banda(firma_producto="guantes nitrilo", CodigoOrganismoPublico="9999")]
        )
        tablas["product_price_bands_L1.parquet"] = pl.DataFrame([_banda()])

        assert servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)["nivel_usado"] == "L1"


class TestVariosProductos:
    def test_devuelve_todos_los_productos_de_la_categoria(self, tablas):
        """Es la mejora entera: donde había una banda de la estantería, ahora
        hay una fila por producto."""
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(
            [
                _banda(firma_producto="calibrador chagas", descripcion="CALIBRADOR", n=8),
                _banda(firma_producto="criovial almacenar", descripcion="CRIOVIAL", n=15),
            ]
        )

        r = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)

        assert r["total_registros"] == 2
        assert [x["descripcion"] for x in r["resultado"]] == ["CRIOVIAL", "CALIBRADOR"], (
            "se ordena por muestra descendente"
        )

    def test_se_corta_en_el_tope_y_gana_la_muestra_mas_grande(self, tablas):
        filas = [
            _banda(firma_producto=f"producto numero {i}", descripcion=f"P{i}", n=i)
            for i in range(1, servicio.MAX_PRODUCTOS_L0 + 6)
        ]
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(filas)

        r = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)

        assert len(r["resultado"]) == servicio.MAX_PRODUCTOS_L0
        # El total es el de la categoría, no el de la página (antes decía 12).
        assert r["total_registros"] == len(filas)
        assert r["resultado"][0]["n"] == max(f["n"] for f in filas)

    def test_el_orden_es_estable_ante_empates(self, tablas):
        """Sin desempate, dos productos con la misma muestra alternan entre
        llamadas y la pantalla parece inestable sin que cambie el dato."""
        filas = [
            _banda(firma_producto="bbb producto", descripcion="B", n=5),
            _banda(firma_producto="aaa producto", descripcion="A", n=5),
        ]
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(filas)
        primero = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)

        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(list(reversed(filas)))
        segundo = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO)

        assert [x["descripcion"] for x in primero["resultado"]] == [
            x["descripcion"] for x in segundo["resultado"]
        ]


class TestFiltroDeUnidad:
    def test_la_unidad_filtra_dentro_del_nivel_de_producto(self, tablas):
        tablas["product_price_bands_L0.parquet"] = pl.DataFrame(
            [
                _banda(
                    firma_producto="papel higienico", descripcion="ROLLO", UnidadMedida="unidad"
                ),
                _banda(firma_producto="papel higienico", descripcion="CAJA", UnidadMedida="caja"),
            ]
        )

        r = servicio.get_precio_producto(CODIGO, organismo_id=ORGANISMO, unidad_medida="caja")

        assert r["total_registros"] == 1
        assert r["resultado"][0]["descripcion"] == "CAJA"

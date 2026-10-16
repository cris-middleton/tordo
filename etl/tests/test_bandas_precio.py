"""Las bandas de precio: dispersión, confianza y el nivel de producto real.

El caso que motiva todo esto está tomado de los datos de 2026-03: dentro de la
categoría UNSPSC «Reactivos o soluciones químicos», en un solo hospital, en un
solo mes y con la misma unidad, conviven un calibrador a $557.062 y un criovial
a $1. La banda que sale de agrupar eso no describe un mercado.
"""

from __future__ import annotations

import polars as pl
from analytics.product_price_bands import (
    QCD_ALTA,
    _compute_bands,
    build_level_0,
    build_level_0_nacional,
    build_level_1,
)


def _items(filas: list[dict]) -> pl.DataFrame:
    """Ítems ya extraídos, como los deja `extract_unit_prices`."""
    base = {
        "codigoProductoONU": "41116000",
        "NombreroductoGenerico": "Reactivos o soluciones químicos",
        "CodigoOrganismoPublico": "7416",
        "OrganismoPublico": "HOSPITAL DE PRUEBA",
        "sector": "Salud",
        "UnidadMedida": "unidad",
        "firma_producto": "",
        "EspecificacionComprador": "",
        "pu": 1000.0,
        "_periodo_archivo": "2026-3",
    }
    return pl.DataFrame([{**base, **f} for f in filas])


def _producto(descripcion: str, firma: str, precios: list[float]) -> list[dict]:
    return [
        {"firma_producto": firma, "EspecificacionComprador": descripcion, "pu": p} for p in precios
    ]


class TestDispersion:
    def test_qcd_es_cero_cuando_todos_pagan_lo_mismo(self):
        df = _items(_producto("guantes nitrilo", "guantes nitrilo", [100.0] * 12))
        b = _compute_bands(df, ["codigoProductoONU"], min_n=5, level=1)
        assert b["qcd"][0] == 0.0
        assert b["predictibilidad"][0] == "alta"

    def test_sin_dispersion_pero_con_poca_muestra_no_llega_a_alta(self):
        """Una banda perfecta sobre cuatro compras es una banda sobre cuatro compras.

        El umbral de muestra existe para eso, y por eso `predictibilidad` no es
        una función sólo del QCD: con tres observaciones, un rango estrecho
        puede ser casualidad.
        """
        df = _items(_producto("guantes nitrilo", "guantes nitrilo", [100.0] * 4))
        b = _compute_bands(df, ["codigoProductoONU"], min_n=3, level=1)
        assert b["qcd"][0] == 0.0
        assert b["predictibilidad"][0] == "media"

    def test_qcd_esta_acotado_aunque_el_cv_se_dispare(self):
        """Un solo precio enorme multiplica el CV y deja el QCD casi intacto.

        Es la razón de cambiar de medida: sobre precios con cola larga, la
        desviación estándar mide el outlier que sobrevivió al filtro de Tukey,
        no lo que paga el mercado.
        """
        precios = [100.0] * 20 + [10_000_000.0]
        df = _items(_producto("reactivo", "reactivo generico", precios))
        b = _compute_bands(df, ["codigoProductoONU"], min_n=5, level=1)
        assert b["cv"][0] > 3.0
        assert b["qcd"][0] <= 0.05
        assert 0.0 <= b["qcd"][0] <= 1.0

    def test_la_categoria_heterogenea_se_marca_como_impredecible(self):
        """El caso real: dos artículos sin relación bajo la misma categoría."""
        df = _items(
            _producto("calibrador chagas", "calibrador chagas", [557_062.0] * 6)
            + _producto("criovial", "criovial almacenar", [1.0] * 6)
        )
        b = _compute_bands(df, ["codigoProductoONU"], min_n=5, level=1)
        assert b["predictibilidad"][0] == "baja"


class TestConfianza:
    def test_una_banda_apretada_con_muestra_normal_supera_el_medio_punto(self):
        """La calibración anterior lo hacía imposible.

        Saturaba en n = 100 mientras la mediana real de n es 10, así que con
        n = 10 el primer factor valía 0,5 y ninguna banda típica podía pasar de
        ahí **aunque su dispersión fuera nula**. El umbral de 0,5 que usa el
        resto del producto estaba calibrado contra sí mismo.
        """
        df = _items(_producto("guantes nitrilo", "guantes nitrilo", [100.0] * 12))
        b = _compute_bands(df, ["codigoProductoONU"], min_n=5, level=1)
        assert b["confianza"][0] > 0.5

    def test_sin_dispersion_util_la_confianza_es_cero(self):
        """La media geométrica sigue exigiendo las dos cosas: si la dispersión
        no aporta nada, no hay tamaño de muestra que lo compense."""
        precios = [10.0, 1_000.0] * 30
        df = _items(_producto("cosa", "cosa variada", precios))
        b = _compute_bands(df, ["codigoProductoONU"], min_n=5, level=1)
        assert b["qcd"][0] > 0.6
        assert b["confianza"][0] == 0.0

    def test_la_confianza_nunca_se_sale_de_cero_uno(self):
        df = _items(
            _producto("a", "producto a", [100.0] * 200) + _producto("b", "producto b", [5.0] * 3)
        )
        b = _compute_bands(df, ["codigoProductoONU"], min_n=3, level=1)
        assert b["confianza"].min() >= 0.0
        assert b["confianza"].max() <= 1.0


class TestNivelCero:
    def test_separa_los_productos_que_la_categoria_mezclaba(self):
        """El mismo dato, dos agrupaciones. Es toda la tesis del nivel 0."""
        df = _items(
            _producto("calibrador chagas", "calibrador chagas", [557_000.0, 558_000.0, 556_000.0])
            + _producto("criovial", "criovial almacenar", [1.0, 1.0, 1.0])
        )

        l1 = build_level_1(df)
        assert len(l1) == 1, "la categoría UNSPSC los mete en una sola banda"
        assert l1["predictibilidad"][0] == "baja"

        l0 = build_level_0(df)
        assert len(l0) == 2, "la firma los separa en los dos productos que son"
        assert set(l0["predictibilidad"].to_list()) == {"alta"} or all(
            q < QCD_ALTA for q in l0["qcd"].to_list()
        )

    def test_la_banda_del_producto_es_mas_estrecha_que_la_de_la_categoria(self):
        """Es la métrica que justifica el nivel entero.

        Sobre datos reales el QCD mediano pasa de 0,27–0,36 (categoría) a
        0,00 (producto). Aquí se fija la dirección: si un cambio en la
        firma hace que la categoría empiece a ganar, algo se rompió.
        """
        df = _items(
            _producto("reactivo caro", "reactivo caro", [500_000.0, 510_000.0, 505_000.0])
            + _producto("reactivo barato", "reactivo barato", [100.0, 102.0, 98.0])
        )
        qcd_categoria = _compute_bands(df, ["codigoProductoONU"], min_n=5, level=1)["qcd"][0]
        qcd_productos = build_level_0(df)["qcd"].max()
        assert qcd_productos < qcd_categoria / 2

    def test_la_banda_lleva_la_descripcion_mas_frecuente(self):
        """La firma es una bolsa de palabras ordenada: sirve para agrupar y no
        para enseñar. Lo que ve el usuario es cómo lo escribió quien más compró."""
        df = _items(
            _producto("GUANTES DE NITRILO TALLA M", "guantes nitrilo talla", [100.0] * 5)
            + _producto("guantes nitrilo m", "guantes nitrilo talla", [102.0])
        )
        l0 = build_level_0(df)
        assert len(l0) == 1
        assert l0["descripcion"][0] == "GUANTES DE NITRILO TALLA M"

    def test_la_banda_conserva_el_codigo_unspsc(self):
        """Sin él, `get_precio_producto(codigo, organismo)` —que recibe un código
        y no una firma— no podría encontrar estas bandas nunca."""
        df = _items(_producto("guantes nitrilo", "guantes nitrilo", [100.0] * 5))
        l0 = build_level_0(df)
        assert l0["codigoProductoONU"][0] == "41116000"
        assert l0["NombreroductoGenerico"][0] == "Reactivos o soluciones químicos"

    def test_una_firma_de_una_palabra_no_genera_banda(self):
        """«servicio» agruparía cosas sin relación alguna."""
        df = _items(_producto("Servicio", "servicio", [100.0] * 10))
        assert build_level_0(df).is_empty()

    def test_el_nivel_nacional_junta_compradores(self):
        df = _items(
            _producto("guantes nitrilo", "guantes nitrilo", [100.0] * 3)
            + [
                {
                    "firma_producto": "guantes nitrilo",
                    "EspecificacionComprador": "guantes nitrilo",
                    "pu": 105.0,
                    "CodigoOrganismoPublico": "9999",
                    "OrganismoPublico": "OTRO HOSPITAL",
                }
                for _ in range(3)
            ]
        )
        l0n = build_level_0_nacional(df)
        assert len(l0n) == 1
        assert l0n["n"][0] == 6
        assert "CodigoOrganismoPublico" not in l0n.columns

    def test_sin_datos_no_revienta(self):
        vacio = _items([]).clear()
        assert build_level_0(vacio).is_empty()
        assert build_level_0_nacional(vacio).is_empty()


class TestDeterminismo:
    def test_dos_corridas_sobre_el_mismo_dato_dan_el_mismo_parquet(self):
        """Sin desempate explícito, `first()` depende del orden de las filas y el
        parquet cambia sin que cambien los datos — lo que convierte cualquier
        comparación entre corridas en ruido."""
        df = _items(
            _producto("marca a", "guantes nitrilo", [100.0] * 4)
            + _producto("marca b", "guantes nitrilo", [100.0] * 4)
        )
        a = build_level_0(df)
        b = build_level_0(df.sample(fraction=1.0, shuffle=True, seed=7))
        assert a["descripcion"].to_list() == b["descripcion"].to_list()

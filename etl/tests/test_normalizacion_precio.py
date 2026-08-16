"""La firma del producto y la unidad canónica.

Estos tests fijan las decisiones que el código no explica solo: por qué se
ordenan los tokens, por qué se quitan los números y por qué una firma de un solo
token no vale. Cada una de las tres se puede "simplificar" en un refactor sin
que nada falle — salvo esto.
"""

from __future__ import annotations

import polars as pl
import pytest
from analytics.normalizacion import (
    UNIDAD_SIN_DECLARAR,
    canonizar_unidad,
    firma_es_utilizable,
    firma_producto,
)


def _firmar(textos: list[str]) -> list[str]:
    df = pl.DataFrame({"EspecificacionComprador": textos})
    return df.with_columns(firma_producto())["firma_producto"].to_list()


def _unidades(valores: list[str | None]) -> list[str]:
    df = pl.DataFrame({"UnidadMedida": valores}, schema={"UnidadMedida": pl.Utf8})
    return df.with_columns(canonizar_unidad())["unidad_norm"].to_list()


class TestFirmaProducto:
    def test_el_orden_de_las_palabras_no_cambia_la_firma(self):
        """Dos personas describen el mismo artículo en distinto orden.

        Sin ordenar los tokens, «guantes nitrilo» y «nitrilo guantes» son dos
        productos distintos y cada uno se queda sin muestra suficiente.
        """
        a, b = _firmar(["Guantes Nitrilo Talla Media", "nitrilo talla guantes media"])
        assert a == b

    def test_mayusculas_tildes_y_puntuacion_no_cambian_la_firma(self):
        a, b = _firmar(["ALCOHOL GEL, 500 ML.", "alcohol  gel 500 ml"])
        assert a == b

    def test_los_codigos_internos_no_entran(self):
        """Lo que lleva dígitos en los datos reales son códigos de orden, guía o
        lote — no el formato del producto. Cada uno parte el producto en un grupo
        de una sola observación.

        Se quita **cualquier token con un dígito**, no sólo los números puros:
        `CS80060` y `b553t` son exactamente el caso que hay que neutralizar.
        Medido sobre 2026-03, la regla amplia gana en las cuatro métricas.
        """
        a, b = _firmar(["Toner negro CS80060", "toner negro B553T"])
        assert a == b == "negro toner"

    def test_se_pierde_el_gramaje_y_es_el_precio_a_pagar(self):
        """Dicho explícitamente para que nadie lo descubra como un bug.

        «25 mg» y «50 mg» quedan con la misma firma. Lo asumimos porque el
        formato viaja en la unidad de medida y porque, medido, conservar los
        dígitos fragmenta mucho más de lo que distingue.
        """
        a, b = _firmar(["Levosulpirida 25mg comprimidos", "Levosulpirida 50mg comprimidos"])
        assert a == b

    def test_las_palabras_de_relleno_no_entran(self):
        """«según detalle adjunto» aparece en miles de líneas sin relación."""
        (firma,) = _firmar(["Sillas de oficina según detalle adjunto"])
        assert "segun" not in firma
        assert "detalle" not in firma
        assert "adjunto" not in firma
        assert "sillas" in firma and "oficina" in firma

    def test_los_tokens_no_se_repiten(self):
        (firma,) = _firmar(["papel papel papel higienico"])
        assert firma == "higienico papel"

    def test_una_especificacion_larguisima_se_recorta(self):
        """Sin tope, una especificación de sesenta palabras no coincide ni consigo
        misma escrita otro día: basta que cambie una palabra."""
        largo = " ".join(f"palabra{chr(97 + i)}" for i in range(30))
        (firma,) = _firmar([largo])
        assert len(firma.split(" ")) <= 8

    def test_texto_vacio_o_nulo_da_firma_vacia(self):
        df = pl.DataFrame(
            {"EspecificacionComprador": [None, "", "   ", "-"]},
            schema={"EspecificacionComprador": pl.Utf8},
        )
        firmas = df.with_columns(firma_producto())["firma_producto"].to_list()
        assert firmas == ["", "", "", ""]


class TestFirmaUtilizable:
    @pytest.mark.parametrize("texto", ["Servicio", "Insumos", "", "papel"])
    def test_una_sola_palabra_no_identifica_un_producto(self, texto):
        """«servicio» como firma completa agruparía cosas sin relación alguna."""
        df = pl.DataFrame({"EspecificacionComprador": [texto]}).with_columns(firma_producto())
        assert not df.filter(firma_es_utilizable()).height

    def test_dos_palabras_ya_describen_algo(self):
        df = pl.DataFrame({"EspecificacionComprador": ["papel higienico"]}).with_columns(
            firma_producto()
        )
        assert df.filter(firma_es_utilizable()).height == 1


class TestUnidadCanonica:
    def test_las_variantes_de_escritura_colapsan(self):
        """97 valores distintos en los datos reales, con variantes de caja y tildes.

        Dos escrituras de la misma unidad parten el grupo en dos, y cada mitad
        se queda por debajo del mínimo de muestra.
        """
        assert len(set(_unidades(["Unidad", "UNIDAD", "unidad", " Unidad "]))) == 1

    def test_las_formas_de_no_decir_nada_colapsan_en_una(self):
        """«NA», «Unidad no definida» y vacío son la misma ausencia escrita de
        tres formas. Como claves distintas, fragmentan los grupos sin aportar."""
        assert set(_unidades(["NA", "Unidad no definida", "", None, "null"])) == {
            UNIDAD_SIN_DECLARAR
        }

    def test_una_unidad_real_se_conserva(self):
        assert _unidades(["Kilogramo"]) == ["kilogramo"]

    def test_la_ausencia_no_es_cadena_vacia(self):
        """Una cadena vacía en una clave de agrupación es indistinguible de un
        fallo de lectura. El valor tiene que decir que es una ausencia."""
        assert UNIDAD_SIN_DECLARAR
        assert _unidades([None]) == [UNIDAD_SIN_DECLARAR]

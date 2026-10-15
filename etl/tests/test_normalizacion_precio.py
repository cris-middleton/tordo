"""La firma del producto y la unidad canónica.

Estos tests fijan las decisiones que el código no explica solo: por qué se
ordenan los tokens, por qué se quitan los números y por qué una firma de un solo
token no vale. Cada una de las tres se puede "simplificar" en un refactor sin
que nada falle — salvo esto.
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
from pathlib import Path

import polars as pl
import pytest
from analytics import normalizacion
from analytics.normalizacion import (
    UNIDAD_SIN_DECLARAR,
    canonizar_unidad,
    firma_es_utilizable,
    firma_producto,
)

from app.utils import firma


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


#: La firma de textos con todos los casos de la regla, capturada en `main`
#: (1a4c045) ANTES de mover la regla a `app/utils/firma.py`. Si cambia un byte,
#: cambian los grupos de precio y los slugs de las páginas de producto.
FIRMAS_FIJADAS = [
    ("GUANTES DE NITRILO TALLA M CAJA X 100", "caja guantes nitrilo talla"),
    ("Guante de nitrilo, talla L (caja 100 un.)", "caja guante nitrilo talla"),
    ("ARRIENDO DE VEHÍCULOS CON CONDUCTOR", "arriendo conductor vehículos"),
    ("Resma papel carta 75 grs según detalle adjunto", "carta grs papel resma"),
    ("Papel higiénico doble hoja 4 rollos", "doble higiénico hoja papel rollos"),
    ("Café en grano 1 kg", "café grano"),
    ("Jabón líquido 5 litros", "jabón litros líquido"),
    ("SERVICIO DE ASEO Y LIMPIEZA - CESFAM", "aseo cesfam limpieza servicio"),
    ("Toner HP CF258A negro", "negro toner"),
    ("Ítem 3: AGUA PURIFICADA EN BIDONES DE 20 LTS", "agua bidones lts purificada ítem"),
    ("Baño químico, arriendo mensual", "arriendo baño mensual químico"),
    ("Pingüino de peluche – juguete", "juguete peluche pingüino"),
    ("crème brûlée", "lée"),
    ("de la en con para por", ""),
    ("", ""),
    (
        "Sillas de oficina ergonómicas con apoyabrazos, respaldo alto, ruedas y base "
        "cromada según ficha técnica",
        "alto apoyabrazos base cromada ergonómicas oficina respaldo ruedas",
    ),
]


class TestFirmaFijada:
    def test_la_firma_no_cambia_byte_a_byte(self):
        """Mover la regla de sitio no puede cambiar ni un byte de ninguna firma.

        Casos que un refactor rompe sin querer: la tilde que se conserva
        («vehículos»), la que parte la palabra («crème» → «lée»), «Ítem» que no
        está en el ruido con tilde, y el tope de ocho que deja fuera «sillas»
        por orden alfabético.
        """
        textos = [texto for texto, _ in FIRMAS_FIJADAS]
        assert _firmar(textos) == [firma for _, firma in FIRMAS_FIJADAS]


class TestReglaCompartida:
    """La regla vive en `app/utils/firma.py` y el ETL la importa: no hay copia."""

    def test_el_etl_usa_la_regla_del_backend_no_una_copia(self):
        assert normalizacion.RUIDO is firma.RUIDO
        # Un entero o una cadena copiados podrían ser «el mismo objeto» por
        # casualidad del intérprete: lo que se mira es que el módulo no los asigne.
        arbol = ast.parse(Path(normalizacion.__file__).read_text(encoding="utf-8"))
        asignados = {
            destino.id
            for nodo in ast.walk(arbol)
            if isinstance(nodo, (ast.Assign, ast.AnnAssign))
            for destino in (nodo.targets if isinstance(nodo, ast.Assign) else [nodo.target])
            if isinstance(destino, ast.Name)
        }
        compartidas = {
            "RUIDO",
            "MIN_TOKEN",
            "MAX_TOKENS",
            "FUERA_DE_TOKEN",
            "_MIN_TOKEN",
            "_MAX_TOKENS",
        }
        assert not asignados & compartidas, asignados & compartidas

    @pytest.mark.parametrize(("texto", "esperada"), FIRMAS_FIJADAS)
    def test_la_regla_en_python_da_la_misma_firma_que_polars(self, texto, esperada):
        """`FIRMAS_FIJADAS` es la salida de Polars (lo fija `TestFirmaFijada`): lo
        que la API usa para buscar es exactamente lo que el ETL usó para agrupar."""
        tokens = sorted(firma.tokens_de_firma(texto))[: firma.MAX_TOKENS]
        assert " ".join(tokens) == esperada

    def test_normalizacion_se_importa_como_en_la_imagen_del_etl(self):
        """La imagen del ETL corre en /workspace/etl con PYTHONPATH=/workspace
        (`etl/Dockerfile`). `normalizacion` ahora importa `etl.shared_imports`:
        esto comprueba en un proceso limpio que esa ruta resuelve."""
        raiz = Path(__file__).resolve().parents[2]
        entorno = {**os.environ, "PYTHONPATH": str(raiz)}
        resultado = subprocess.run(
            [sys.executable, "-c", "import analytics.product_price_bands"],
            cwd=raiz / "etl",
            env=entorno,
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert resultado.returncode == 0, resultado.stderr[-2000:]


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

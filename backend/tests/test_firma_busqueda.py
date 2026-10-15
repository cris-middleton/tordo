"""La regla de la firma aplicada a una búsqueda (`app/utils/firma.py`).

La búsqueda de productos compara el término contra firmas que el ETL ya limpió:
sin artículos, sin ruido, sin palabras de menos de tres letras, sin dígitos.
Si el término no pasa por la MISMA regla, exige palabras que ninguna firma
tiene — «guantes de nitrilo» pedía un «de» y no encontraba
`guantes nitrilo talla` (n = 272). Lo que la regla hace con una firma lo fija
`etl/tests/test_normalizacion_precio.py`; aquí, lo que hace con un término.
"""

from __future__ import annotations

import unicodedata

import pytest

from app.utils.firma import MAX_TOKENS, MIN_TOKEN, RUIDO, terminos_de_busqueda


def test_la_regla_es_la_de_la_firma():
    # Guardas: si alguien vacía el ruido o baja el mínimo, el resto de los
    # tests seguiría pasando con una regla distinta de la que agrupó los datos.
    assert MIN_TOKEN == 3
    assert MAX_TOKENS == 8
    assert {"de", "la", "en", "segun", "según", "detalle", "adjunto"} <= RUIDO


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("guantes de nitrilo", ["guantes", "nitrilo"]),
        ("arriendo de vehículos", ["arriendo", "vehiculos"]),
        ("ARRIENDO DE VEHICULOS", ["arriendo", "vehiculos"]),
        ("resma de papel carta", ["carta", "papel", "resma"]),
        ("agua purificada en bidones", ["agua", "bidones", "purificada"]),
        ("Baño químico", ["bano", "quimico"]),
    ],
)
def test_quita_lo_que_la_firma_quita_y_las_tildes(texto, esperado):
    assert terminos_de_busqueda(texto) == esperado


def test_tildes_en_los_dos_sentidos():
    assert terminos_de_busqueda("vehículos") == terminos_de_busqueda("vehiculos") == ["vehiculos"]
    assert terminos_de_busqueda("vehículos vehiculos") == ["vehiculos"]


def test_una_tilde_combinante_no_parte_la_palabra():
    """«vehi» + U+0301 + «culos» (NFD), como lo manda algún teclado. Sin NFC la
    tilde suelta se trataba como puntuación y salían «vehi» y «culos»."""
    nfd = unicodedata.normalize("NFD", "vehículos")
    assert "\u0301" in nfd  # la entrada es de verdad NFD, aunque un editor normalice este fichero
    assert terminos_de_busqueda(nfd) == ["vehiculos"]


def test_los_tokens_con_digitos_no_cuentan():
    """La firma los quitó: exigirlos no encontraría nunca nada."""
    assert terminos_de_busqueda("toner 85A negro") == ["negro", "toner"]
    assert terminos_de_busqueda("resma 500 hojas") == ["hojas", "resma"]


@pytest.mark.parametrize("texto", ["de la", "pc", "tv", "según detalle adjunto", "500", "  ", ""])
def test_sin_ninguna_palabra_util_no_hay_terminos(texto):
    """«pc» y «tv» no están en ninguna firma (menos de tres letras): hoy sólo
    encontraban «concepcion» o «cctv» por accidente."""
    assert terminos_de_busqueda(texto) == []


def test_con_mas_de_ocho_palabras_se_queda_con_las_de_la_firma():
    """Pegar una especificación entera encuentra su firma: la firma de este
    texto deja fuera «sillas» (novena por orden alfabético), y el término también."""
    texto = (
        "Sillas de oficina ergonómicas con apoyabrazos, respaldo alto, ruedas y base "
        "cromada según ficha técnica"
    )
    assert terminos_de_busqueda(texto) == [
        "alto",
        "apoyabrazos",
        "base",
        "cromada",
        "ergonomicas",
        "oficina",
        "respaldo",
        "ruedas",
    ]

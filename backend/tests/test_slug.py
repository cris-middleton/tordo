"""El slug de las páginas públicas (`app/utils/slug.py`).

Una sola función, porque el sitemap y la resolución slug → nombre tienen que
coincidir carácter a carácter: si discrepan en una tilde, el sitemap anuncia una
página que da 404.
"""

from __future__ import annotations

import pytest

from app.utils.slug import LARGO_MAXIMO, slug


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Equipos médicos", "equipos-medicos"),
        ("Servicios legales", "servicios-legales"),
        ("Servicios Legales", "servicios-legales"),
        ("Pañales y apósitos", "panales-y-apositos"),
        ("Aseo / Limpieza, insumos & más", "aseo-limpieza-insumos-mas"),
        ("  --hola--  ", "hola"),
        ("café–bar", "cafe-bar"),  # una raya es un separador, no se borra
        ("guante látex nitrilo", "guante-latex-nitrilo"),
    ],
)
def test_reglas(texto: str, esperado: str):
    assert slug(texto) == esperado


@pytest.mark.parametrize("texto", [None, "", "  ", "¿?¡!", "—"])
def test_sin_nada_alfanumerico_da_vacio(texto):
    assert slug(texto) == ""


def test_respeta_el_largo_sin_guion_colgando():
    texto = "a" * (LARGO_MAXIMO - 1) + " bbbbbb"
    s = slug(texto)
    assert len(s) <= LARGO_MAXIMO
    assert not s.endswith("-")


def test_es_idempotente():
    """Un slug ya hecho no cambia al volver a pasarlo: el frontend puede
    reenviar lo que recibió sin que la ruta se mueva."""
    for texto in ("Equipos médicos / Insumos", "guante látex nitrilo", "x" * 200):
        assert slug(slug(texto)) == slug(texto)

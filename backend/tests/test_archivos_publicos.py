"""Los archivos que hacen público el repositorio (spec del rediseño §7.1 y §7.2).

Un archivo de licencia editado a mano deja de ser la licencia; un código de conducta con
«[INSERTAR MÉTODO DE CONTACTO]» no dice a quién escribir. Ninguna de las dos cosas rompe
nada visible, así que lo fija un test.
"""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]

#: sha256 de https://www.gnu.org/licenses/agpl-3.0.txt, medido el 2026-10-15.
#: Si GNU cambia el fichero, se vuelve a descargar y a medir: nunca se edita a mano.
SHA256_AGPL = "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0"

#: La misma cadena en los dos manifiestos (decisión D5 del plan del PR 7).
LICENCIA_SPDX = "AGPL-3.0-or-later"

PUBLICOS = ["README.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md"]
HUECOS = [r"\[INSERTAR", r"\[INSERT", r"\bTODO\b", r"\bTBD\b", r"<usuario>"]

#: Ningún correo personal ni laboral del autor en un archivo público: el contacto del
#: proyecto es hola@tordo.cl (`frontend/lib/responsable.ts`). Es una lista de dominios
#: PERMITIDOS y no de prohibidos: una lista de prohibidos publicaría justo lo que esconde.
DOMINIOS_DE_CORREO_PERMITIDOS = {"tordo.cl"}
CORREO = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")


def _leer(nombre: str) -> str:
    return (RAIZ / nombre).read_text(encoding="utf-8")


def test_la_licencia_es_el_texto_oficial_de_la_agpl():
    datos = (RAIZ / "LICENSE").read_bytes()
    assert hashlib.sha256(datos).hexdigest() == SHA256_AGPL


@pytest.mark.parametrize("nombre", PUBLICOS)
def test_cada_archivo_publico_existe_y_no_tiene_huecos(nombre: str):
    texto = _leer(nombre)
    assert len(texto) > 300, f"{nombre} está casi vacío"
    for hueco in HUECOS:
        assert not re.search(hueco, texto), f"{nombre} tiene el hueco «{hueco}»"


@pytest.mark.parametrize("nombre", PUBLICOS)
def test_ningun_archivo_publico_lleva_un_correo_del_autor(nombre: str):
    dominios = {d.lower() for d in CORREO.findall(_leer(nombre))}
    ajenos = dominios - DOMINIOS_DE_CORREO_PERMITIDOS
    assert not ajenos, f"{nombre} tiene correos de {sorted(ajenos)}"


def test_el_detector_de_correos_ve_un_dominio_ajeno():
    assert CORREO.findall("escribe a alguien@ejemplo.com o a hola@tordo.cl") == [
        "ejemplo.com",
        "tordo.cl",
    ]


def test_el_readme_nombra_las_tres_licencias_y_la_historia_saas():
    texto = _leer("README.md")
    for debe in ("AGPL-3.0", "CC BY 4.0", "ChileCompra", "saas-v1", "make ci"):
        assert debe in texto, f"el README no menciona «{debe}»"


def test_el_readme_dice_que_vale_cualquier_version_posterior():
    """`-or-later` (D5) sólo vale si el aviso lo dice: el texto de la licencia es el mismo
    para las dos variantes, y lo que las distingue es la frase del aviso."""
    texto = " ".join(_leer("README.md").split())  # el Markdown parte las líneas
    assert LICENCIA_SPDX in texto
    assert "versión 3 o (a tu elección) cualquier versión posterior" in texto


def test_security_apunta_al_reporte_privado_y_al_correo():
    texto = _leer("SECURITY.md")
    assert "security/advisories/new" in texto
    assert "hola@tordo.cl" in texto


def test_contributing_pide_ci_en_verde_y_dco():
    texto = _leer("CONTRIBUTING.md")
    for debe in ("make ci", "git commit -s", "Signed-off-by", "developercertificate.org"):
        assert debe in texto, f"CONTRIBUTING.md no menciona «{debe}»"


def test_el_codigo_de_conducta_tiene_contacto():
    texto = _leer("CODE_OF_CONDUCT.md")
    assert "hola@tordo.cl" in texto
    assert "Contributor Covenant" in texto


def test_los_manifiestos_declaran_la_misma_licencia():
    pyproject = tomllib.loads(_leer("pyproject.toml"))
    paquete = json.loads(_leer("frontend/package.json"))
    assert pyproject["project"]["license"] == LICENCIA_SPDX
    assert paquete["license"] == LICENCIA_SPDX


def test_el_sitio_publica_la_misma_licencia():
    """`/abierto` y los términos leen `LICENCIA_CODIGO` de `frontend/lib/abierto.ts`."""
    abierto = _leer("frontend/lib/abierto.ts")
    assert f"spdx: '{LICENCIA_SPDX}'" in abierto
    assert "nombre: 'AGPL-3.0 o posterior'" in abierto

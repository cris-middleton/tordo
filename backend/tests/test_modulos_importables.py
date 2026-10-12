"""Cada módulo se puede importar solo, sin depender de quién importó antes.

Por qué existe
--------------
`core/versionado.py` estuvo un rato en `app/api/`. Importarlo desde
`core/security.py` ejecutaba `app/api/__init__.py`, que importa los catorce
routers, que a su vez importan `core.security`: **importación circular**.

Lo peligroso no fue el ciclo, fue que **no fallaba siempre**. Importando
`app.main` primero, Python lo resolvía por orden y todo funcionaba; el `import`
de un script que empezaba por `app.core.security` reventaba. `make ci` estaba en
verde mientras el sembrador de datos no arrancaba.

Un fallo que depende del orden de importación es de los que aparecen en
producción —en un cron, en un script de operaciones— y no en CI.
Este test importa cada módulo **en un proceso limpio**, uno por uno, que es la
única forma de comprobarlo.
"""

from __future__ import annotations

import pathlib
import subprocess
import sys

import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[1]
APP = BACKEND / "app"

# Módulos que no se importan sueltos a propósito.
SALTADOS = {
    # Arranca la app entera; ya lo cubre el resto de la suite.
    "app.main",
}


def _modulos() -> list[str]:
    nombres = []
    for fichero in sorted(APP.rglob("*.py")):
        relativo = fichero.relative_to(BACKEND).with_suffix("")
        partes = list(relativo.parts)
        if partes[-1] == "__init__":
            partes = partes[:-1]
        nombre = ".".join(partes)
        if nombre and nombre not in SALTADOS:
            nombres.append(nombre)
    return nombres


def test_hay_modulos_que_revisar():
    """Guarda: con pocos módulos, el test estaría comprobando el vacío."""
    assert len(_modulos()) >= 40, f"se esperaban ≥40 módulos, hay {len(_modulos())}"


@pytest.mark.parametrize("modulo", _modulos())
def test_el_modulo_se_importa_solo(modulo: str):
    # Proceso aparte: dentro de la misma sesión de pytest, media aplicación ya
    # está importada y el ciclo se resolvería por casualidad — que es justo el
    # fallo que este test persigue.
    resultado = subprocess.run(
        [sys.executable, "-c", f"import {modulo}"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )
    assert resultado.returncode == 0, (
        f"`import {modulo}` falla en un proceso limpio:\n{resultado.stderr[-1500:]}"
    )

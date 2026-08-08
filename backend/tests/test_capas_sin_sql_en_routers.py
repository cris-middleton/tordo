"""Los routers no arman consultas. Para eso está `repositories/`.

Por qué hay un test y no sólo una regla escrita
-----------------------------------------------
La regla llevaba escrita desde F3 y el código la incumplía en once routers: 120
consultas repartidas entre los handlers. Una convención que nada comprueba es
una convención que se cumple mientras alguien se acuerda.

Y no es cosmética. Cada uno de estos casos apareció al mover las consultas:

- El filtro `Alert.user_id == current_user.id` estaba escrito **seis veces**. Es
  la garantía de que nadie lee la alerta de otro, y una garantía repetida seis
  veces es una que un día se escribe cinco.
- `DocumentoEmpresa.eliminado.is_(False)` estaba en cuatro sitios. Olvidarlo no
  rompe nada: reaparecen documentos que el usuario creía borrados, con su enlace
  de descarga.
- `Licitacion.activo` estaba en cuatro routers, y **faltaba** en el que crea
  postulaciones: se podía abrir una sobre algo ya retirado de Mercado Público.

Las dos excepciones
-------------------
`deps.py` — las dependencias de tenancy SON acceso a datos, y concentrarlas ahí
es justo el patrón que el repositorio persigue. Moverlas a otro fichero sólo
alejaría la comprobación del sitio donde se declara.

`data_inspection.py` — es un explorador genérico de tablas: construir la
consulta a partir de los parámetros **es** la funcionalidad. Un repositorio ahí
sería un fichero con la misma consulta y otro nombre.
"""

from __future__ import annotations

import pathlib
import re

import pytest

API = pathlib.Path(__file__).resolve().parents[1] / "app" / "api"

EXCEPCIONES = {
    "deps.py": "las dependencias de tenancy SON el acceso a datos, y viven juntas a propósito",
    "data_inspection.py": "explorador genérico de tablas: construir la consulta es la feature",
    "health.py": "`SELECT 1` es una prueba de conectividad, no una consulta de dominio",
}

# `select(`, `db.query(`, `db.execute(` — las tres formas de armar una consulta.
CONSTRUCTORES = re.compile(r"\b(select\(|db\.query\(|db\.execute\(|session\.query\()")


def _routers() -> list[pathlib.Path]:
    return sorted(f for f in API.glob("*.py") if f.name not in {"__init__.py", "versionado.py"})


def test_hay_routers_que_revisar():
    """Guarda: si el recorrido encuentra pocos ficheros, no está comprobando nada."""
    assert len(_routers()) >= 10, f"se esperaban ≥10 routers, hay {len(_routers())}"


@pytest.mark.parametrize("router", _routers(), ids=lambda f: f.name)
def test_el_router_no_arma_consultas(router: pathlib.Path):
    if router.name in EXCEPCIONES:
        pytest.skip(EXCEPCIONES[router.name])

    culpables = [
        f"{router.name}:{numero}: {linea.strip()[:80]}"
        for numero, linea in enumerate(router.read_text().splitlines(), 1)
        if CONSTRUCTORES.search(linea.split("#", 1)[0])
    ]
    assert not culpables, (
        "Consultas dentro del router:\n  "
        + "\n  ".join(culpables)
        + "\n\nMuévelas a `app/repositories/`. Si de verdad es una excepción, añádela a "
        "EXCEPCIONES con el motivo escrito."
    )


def test_las_excepciones_siguen_existiendo():
    """Una excepción a un fichero borrado esconde que la regla dejó de cubrirlo."""
    fantasmas = [nombre for nombre in EXCEPCIONES if not (API / nombre).exists()]
    assert not fantasmas, f"EXCEPCIONES menciona ficheros que ya no existen: {fantasmas}"

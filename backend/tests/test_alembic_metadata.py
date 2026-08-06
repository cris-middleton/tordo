"""Guarda que `alembic/env.py` vea los modelos.

Por qué existe
--------------
`Base.metadata` se puebla cuando se importan los módulos de modelos, no al
importar `Base`. `env.py` tenía el comentario "Import all models so Alembic can
detect them" **sin nada debajo**, así que `target_metadata` tenía CERO tablas y
autogenerate concluía —correctamente, dado lo que veía— que sobraban las 26
tablas de la base: 52 `remove_table` y 128 `remove_index`.

De ahí salieron los esqueletos destructivos que `make migrate-create` generó dos
veces, con drops de las restricciones únicas de `licitaciones.codigo_externo`,
`ordenes_compra.codigo_oc` y `empresas.rut_empresa`. Se detectaron a mano las dos
veces. La tercera podía colarse.

El fallo es silencioso por naturaleza: autogenerate no avisa de que su metadata
está vacía, produce una migración que *parece* legítima. Por eso se comprueba
aquí y no se confía en revisarlo a ojo.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from app.db import Base

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
BACKEND = Path(__file__).resolve().parents[1]


def test_los_modelos_se_registran_en_la_metadata():
    """Sin DB: el import de `app.models` puebla `Base.metadata`."""
    import app.models  # noqa: F401

    assert len(Base.metadata.tables) > 20, (
        "Base.metadata está casi vacía. Si `app/models/__init__.py` dejó de "
        "reexportar los modelos, autogenerate propondrá borrar la base entera."
    )


def test_env_py_importa_los_modelos():
    """`env.py` debe importarlos: es lo único que puebla su `target_metadata`.

    Se mira el fuente porque `env.py` no es importable fuera de una corrida de
    Alembic — su cuerpo hace `context.config`, que sin contexto revienta.
    """
    fuente = (BACKEND / "alembic" / "env.py").read_text()
    assert "import app.models" in fuente, (
        "alembic/env.py no importa los modelos, así que target_metadata queda "
        "vacío y `make migrate-create` generará una migración que borra todo."
    )


def test_autogenerate_no_propone_borrar_tablas():
    """La comprobación que de verdad importa, contra la base.

    Da igual *cómo* se pueble la metadata: si autogenerate quiere eliminar una
    tabla que las migraciones acaban de crear, algo está mal en `env.py`.

    Desde la migración `da5fb1e45066` no queda deriva y `alembic check` es
    bloqueante en CI, así que este test es la red de abajo: comprueba lo único
    que nunca puede pasar desapercibido, aunque alguien vuelva a poner el check
    en `continue-on-error`.
    """
    url = os.getenv("DATABASE_URL", "")
    if not url:
        pytest.skip("sin DATABASE_URL")

    entorno = {**os.environ, "SECRET_KEY": os.getenv("SECRET_KEY", "test")}
    try:
        resultado = subprocess.run(
            ["alembic", "check"],
            cwd=BACKEND,
            env=entorno,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        if IN_CI:
            raise
        pytest.skip(f"no se pudo correr alembic check ({type(exc).__name__})")

    salida = resultado.stdout + resultado.stderr
    if "Can't locate revision" in salida or "does not exist" in salida:
        if IN_CI:
            raise RuntimeError(f"alembic check no pudo correr:\n{salida[-800:]}")
        pytest.skip("la base no tiene las migraciones aplicadas")

    # Se busca la tupla exacta: `remove_table` a secas también casa con
    # `remove_table_comment`, que es cosmético y sí aparece hoy.
    assert "('remove_table'" not in salida, (
        "autogenerate quiere ELIMINAR tablas que las migraciones crean. "
        "Casi siempre significa que env.py no está viendo los modelos.\n"
        f"{salida[-1500:]}"
    )

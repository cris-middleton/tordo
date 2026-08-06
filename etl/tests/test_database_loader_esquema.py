"""El ETL comprueba el esquema; ya no lo crea.

Aquí había un `Base.metadata.create_all()` en cada conexión del loader. El ETL
corre cada hora, así que **creaba en producción cualquier tabla que faltara, sin
migración y sin dejar rastro en `alembic_version`**. Un modelo nuevo sin su
migración llegaba a la base por esa puerta, y el esquema quedaba en un estado que
ninguna migración sabe reproducir.

Estos tests no necesitan base: sustituyen la conexión.
"""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from etl.loaders.database_loader_v2 import Base, DatabaseLoaderV2


def _loader_con_tablas(tablas_en_la_base: set[str]) -> DatabaseLoaderV2:
    """Loader cuyo motor responde que existen exactamente esas tablas."""

    @contextmanager
    def _connect():
        yield SimpleNamespace(execute=lambda _sql: [(t,) for t in tablas_en_la_base])

    loader = DatabaseLoaderV2({"DATABASE_URL": "postgresql://x/y"})
    loader.engine = SimpleNamespace(connect=_connect)
    return loader


def test_con_el_esquema_completo_no_protesta():
    _loader_con_tablas(set(Base.metadata.tables))._verificar_esquema()


def test_si_falta_una_tabla_falla_y_dice_como_arreglarlo():
    todas = set(Base.metadata.tables)
    faltante = sorted(todas)[0]
    loader = _loader_con_tablas(todas - {faltante})

    with pytest.raises(RuntimeError) as exc:
        loader._verificar_esquema()

    mensaje = str(exc.value)
    assert faltante in mensaje
    # Un error que no dice qué hacer obliga a leer el código para entenderlo.
    assert "make migrate" in mensaje


def test_una_base_vacia_no_se_provisiona_sola():
    """La regresión que importa.

    Antes, conectar contra una base vacía la llenaba de tablas sin migración.
    Ahora tiene que fallar.
    """
    loader = _loader_con_tablas(set())
    with pytest.raises(RuntimeError, match="Faltan"):
        loader._verificar_esquema()


def test_no_molesta_por_tablas_de_mas():
    """La base tiene cosas que los modelos no declaran: `alembic_version`, el
    esquema `analytics` materializado por el pipeline. No son un problema."""
    loader = _loader_con_tablas(set(Base.metadata.tables) | {"alembic_version", "otra_cosa"})
    loader._verificar_esquema()

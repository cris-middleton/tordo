"""Un doble de `services/bi/_base._load` con las tablas en memoria.

Hace falta para lo que el fixture del golden master no trae: las bandas por
producto (L0/L0N) y la historia de Compra Ágil. Añadirlas al fixture cambiaría
la cascada de `/bi/precio` y con ella el golden, que se capturó sin esos niveles.

Respeta `filtros`, `columnas`, `orden` y `limite` como el SQL de verdad
(`repositories/_analytics_sql.py`). **Respetar `columnas` es lo importante**:
es lo que permite comprobar que una columna que no se pide —un RUT— no puede
acabar en una respuesta.
"""

from __future__ import annotations

from typing import Any

import polars as pl


class AnalyticsEnMemoria:
    def __init__(self) -> None:
        self.tablas: dict[str, pl.DataFrame] = {}

    def __setitem__(self, parquet: str, filas: list[dict]) -> None:
        self.tablas[parquet] = pl.DataFrame(filas)

    def _load(
        self,
        filename: str,
        *,
        filtros: dict[str, Any] | None = None,
        columnas: list[str] | None = None,
        orden: str | None = None,
        descendente: bool = True,
        limite: int | None = None,
    ) -> pl.DataFrame | None:
        df = self.tablas.get(filename)
        if df is None:
            return None
        for col, valor in (filtros or {}).items():
            if col not in df.columns:
                # Postgres levanta «column does not exist»; aquí, lo mismo.
                raise KeyError(col)
            if valor is None:
                df = df.filter(pl.col(col).is_null())
            elif isinstance(valor, (list, tuple, set)):
                df = df.filter(pl.col(col).is_in(list(valor)))
            else:
                df = df.filter(pl.col(col) == valor)
        if orden:
            df = df.sort(orden, descending=descendente, nulls_last=True)
        if limite:
            df = df.head(limite)
        if columnas:
            df = df.select(columnas)
        return df

    def instalar(self, monkeypatch, *modulos) -> None:
        for modulo in modulos:
            monkeypatch.setattr(modulo, "_load", self._load)

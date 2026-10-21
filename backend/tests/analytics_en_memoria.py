"""Un doble de `services/bi/_base._load` con las tablas en memoria.

Hace falta para lo que el fixture del golden master no trae: las bandas por
producto (L0/L0N) y la historia de Compra Ágil. Añadirlas al fixture cambiaría
la cascada de `/bi/precio` y con ella el golden, que se capturó sin esos niveles.

Respeta `filtros`, `minimos`, `columnas`, `orden`, `desempate_texto` y `limite`
como el SQL de verdad (`repositories/_analytics_sql.py`). También dobla
`_distintos`, `_contar`, `_contar_filas`, `_agregado`, `_totales`, `_columnas`,
`_columna_presente` y `_buscar`. **Respetar `columnas` es lo importante**:
es lo que permite comprobar que una columna que no se pide —un RUT— no puede
acabar en una respuesta.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

import polars as pl

from app.repositories.busqueda import fragmento
from app.services.bi._base import MAX_FILAS_BUSQUEDA


def _sin_tildes(texto: str | None) -> str | None:
    """Como `lower(inmutable_unaccent(...))` para las letras del castellano."""
    if texto is None:
        return None
    descompuesto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in descompuesto if not unicodedata.combining(c)).lower()


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
        minimos: dict[str, float] | None = None,
        columnas: list[str] | None = None,
        orden: str | None = None,
        descendente: bool = True,
        desempate_texto: str | None = None,
        limite: int | None = None,
    ) -> pl.DataFrame | None:
        df = self.tablas.get(filename)
        if df is None:
            return None
        df = self._filtrar(df, filtros)
        for col, minimo in (minimos or {}).items():
            if col not in df.columns:
                raise KeyError(col)
            # Como en SQL: un NULL no pasa un mínimo.
            df = df.filter(pl.col(col) >= minimo)
        if orden and desempate_texto:
            # Estable: el orden de carga desempata después, como `ctid`.
            df = df.sort(
                [orden, desempate_texto],
                descending=[descendente, False],
                nulls_last=True,
                maintain_order=True,
            )
        elif orden:
            # Estable, como el desempate por `ctid` del SQL: el orden de carga.
            df = df.sort(orden, descending=descendente, nulls_last=True, maintain_order=True)
        if limite:
            df = df.head(limite)
        if columnas:
            df = df.select(columnas)
        return df

    @staticmethod
    def _filtrar(df: pl.DataFrame, filtros: dict[str, Any] | None) -> pl.DataFrame:
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
        return df

    def _distintos(
        self, filename: str, columna: str, *, filtros: dict[str, Any] | None = None
    ) -> list[Any] | None:
        df = self.tablas.get(filename)
        if df is None:
            return None
        df = self._filtrar(df, filtros)
        return df.get_column(columna).drop_nulls().unique().to_list()

    def _contar_filas(self, filename: str, *, filtros: dict[str, Any] | None = None) -> int | None:
        df = self.tablas.get(filename)
        if df is None:
            return None
        return self._filtrar(df, filtros).height

    def _grupos(self, df, clave, sumas, distintos=(), primeros=()) -> pl.DataFrame:
        return df.group_by(clave, maintain_order=True).agg(
            *[pl.col(c).sum().cast(pl.Float64) for c in sumas],
            *[pl.col(c).drop_nulls().n_unique().alias(f"distintos_{c}") for c in distintos],
            *[pl.col(c).first() for c in primeros],
        )

    def _agregado(
        self,
        filename: str,
        clave: str,
        *,
        filtros: dict[str, Any] | None = None,
        sumas: list[str],
        distintos: list[str] = (),
        primeros: list[str] = (),
        limite: int,
    ) -> pl.DataFrame | None:
        """Como `sql_agregado`: grupos por `sumas[0]` descendente, empate por la
        clave (bytes), con tope."""
        df = self.tablas.get(filename)
        if df is None:
            return None
        grupos = self._grupos(self._filtrar(df, filtros), clave, sumas, distintos, primeros)
        return grupos.sort([sumas[0], clave], descending=[True, False], nulls_last=True).head(
            limite
        )

    def _totales(
        self,
        filename: str,
        clave: str,
        *,
        filtros: dict[str, Any] | None = None,
        sumas: list[str],
        distintos: list[str] = (),
    ) -> dict[str, Any] | None:
        df = self.tablas.get(filename)
        if df is None:
            return None
        df = self._filtrar(df, filtros)
        grupos = self._grupos(df, clave, sumas)
        # Como SQL: la suma de ninguna fila es NULL, no 0.
        vacio = grupos.is_empty()
        fila: dict[str, Any] = {"grupos": grupos.height}
        for c in sumas:
            fila[c] = None if vacio else grupos[c].sum()
        fila["cuadrados"] = None if vacio else (grupos[sumas[0]] ** 2).sum()
        for c in distintos:
            fila[f"distintos_{c}"] = df[c].drop_nulls().n_unique()
        return fila

    def _contar(
        self,
        filename: str,
        columna: str,
        *,
        excluir: list[str] | None = None,
        limite: int,
    ) -> list[tuple[Any, int]] | None:
        df = self.tablas.get(filename)
        if df is None:
            return None
        df = df.filter(pl.col(columna).is_not_null())
        if excluir:
            df = df.filter(~pl.col(columna).is_in(excluir))
        conteo = (
            df.group_by(columna).len().sort(["len", columna], descending=[True, False]).head(limite)
        )
        return [(fila[columna], int(fila["len"])) for fila in conteo.to_dicts()]

    def _columnas(self, filename: str) -> set[str]:
        df = self.tablas.get(filename)
        return set(df.columns) if df is not None else set()

    def _columna_presente(self, filename: str, *candidatas: str) -> str | None:
        columnas = self._columnas(filename)
        return next((c for c in candidatas if c in columnas), None)

    def _buscar(
        self,
        filename: str,
        columna: str,
        texto: str,
        *,
        columnas: list[str] | None = None,
        orden: str | None = None,
    ) -> pl.DataFrame | None:
        """Como `_base._buscar`: el término al comienzo de una palabra, sin
        tildes ni mayúsculas, orden descendente, con tope (`repositories/busqueda.py`)."""
        df = self.tablas.get(filename)
        if df is None:
            return None
        trozo = _sin_tildes(fragmento(texto.strip()))
        if not trozo:
            return df.clear().select(columnas) if columnas else df.clear()
        normalizada = pl.col(columna).map_elements(_sin_tildes, return_dtype=pl.Utf8)
        df = df.filter(normalizada.str.contains(rf"\b{re.escape(trozo)}"))
        if orden:
            df = df.sort(orden, descending=True, nulls_last=True, maintain_order=True)
        df = df.head(MAX_FILAS_BUSQUEDA)
        return df.select(columnas) if columnas else df

    def instalar(self, monkeypatch, *modulos) -> None:
        for modulo in modulos:
            monkeypatch.setattr(modulo, "_load", self._load)
            for nombre in (
                "_distintos",
                "_contar",
                "_contar_filas",
                "_agregado",
                "_totales",
                "_columnas",
                "_columna_presente",
                "_buscar",
            ):
                if hasattr(modulo, nombre):
                    monkeypatch.setattr(modulo, nombre, getattr(self, nombre))

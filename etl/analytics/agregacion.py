"""Contar entidades distintas cuando el dato llega por tandas.

**El problema.** Los módulos de analytics recorren los parquets mes a mes, y
varios contaban entidades distintas así:

    # por tanda
    pl.col("CodigoProveedor").n_unique().alias("n_proveedores")
    # al combinar
    pl.col("n_proveedores").max()

`max()` no es la unión de los conjuntos: es el tamaño del mayor. Un sector con
20.000 proveedores en enero y otros 20.000 distintos en febrero sale con 20.000,
no con 40.000. Es un techo, y con diecinueve años de historia el techo es «el
mes más movido», no «la historia».

Medido sobre los datos reales: `sector_dashboard` —que **sí** se materializa y
pinta la pantalla de BI— declaraba **49.116 proveedores** sumando todos los
sectores, contra **313.129** distintos en el histórico. `n_organismos` en cambio
salía casi bien (1.155 contra 1.186), porque los mismos compradores aparecen
todos los meses y ahí el máximo sí se acerca al total. Por eso no se notó: el
número plausible tapaba al que no lo era.

**La solución.** Acumular los pares distintos y deduplicar en cada vuelta, en vez
de guardar la lista de cada tanda y aplanar al final. Así la memoria queda
acotada por el conjunto distinto —cientos de miles de filas— y no por
`tandas × distintos`, que con 228 meses se iba a millones.
"""

from __future__ import annotations

import polars as pl


class ContadorDistintos:
    """Acumula pares *(grupo, entidad)* distintos a lo largo de varias tandas.

    Uso:

        contador = ContadorDistintos("sector", "CodigoProveedor")
        for _, df in iter_oc_parquets(...):
            contador.añadir(df)
        conteos = contador.conteos("n_proveedores")   # DataFrame(sector, n_proveedores)
    """

    def __init__(self, grupo: str | list[str], entidad: str) -> None:
        self.grupo = [grupo] if isinstance(grupo, str) else list(grupo)
        self.entidad = entidad
        self._pares: pl.DataFrame | None = None

    def añadir(self, df: pl.DataFrame) -> None:
        columnas = [*self.grupo, self.entidad]
        if any(c not in df.columns for c in columnas):
            return
        nuevos = df.select(columnas).drop_nulls().unique()
        # Deduplicar EN CADA VUELTA. Concatenar todo y deduplicar al final daría
        # el mismo resultado con un pico de memoria proporcional al número de
        # tandas, que es justo lo que hay que evitar en un contenedor.
        self._pares = nuevos if self._pares is None else pl.concat([self._pares, nuevos]).unique()

    def conteos(self, alias: str) -> pl.DataFrame:
        """Una fila por grupo con el número de entidades distintas."""
        if self._pares is None:
            return pl.DataFrame()
        return self._pares.group_by(self.grupo).agg(pl.col(self.entidad).n_unique().alias(alias))

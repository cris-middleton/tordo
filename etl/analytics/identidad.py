"""La identidad de un comprador es su código. El nombre es un atributo.

**Por qué existe este módulo.** Cuatro módulos de analytics agrupaban por
*(código, nombre, rubro)*. El nombre no identifica: un mismo organismo aparece
escrito de varias formas en el histórico de ChileCompra —los cambios de nombre
de 2021 dejaron a la misma repartición como «GOBERNACION PROVINCIAL DE LIMARI»
y «DELEGACIÓN PRESIDENCIAL PROVINCIAL DE LIMARÍ»— y meterlo en la clave parte
un mercado real en varios mercados de mentira.

Medido sobre los datos reales: **145 de 1.186 compradores (12,2 %) tienen más de
un nombre**, y el código 6941 tiene cuatro. Consecuencias que se veían en
pantalla:

- `market_concentration` calculaba el HHI sobre las cuotas de **un trozo** del
  mercado mientras las cuotas venían del mercado entero, así que el índice salía
  muy por debajo de lo posible: **23.010 filas (13,6 %) tenían un HHI
  aritméticamente imposible** — menor que 10.000/n_proveedores, que es el mínimo
  con n proveedores repartidos.
- De los 5.675 mercados con **un solo proveedor**, 2.700 quedaban etiquetados
  como el tramo más abierto del HHI. Un monopolio se le ofrecía al usuario como
  el mercado con más espacio para entrar.
- `opportunity_scores` salía con 237.946 filas para 148.966 mercados, porque el
  join cruzaba los trozos de una tabla con los de la otra.
- `buyer_scores` daba dos scores distintos al mismo comprador (0,8749 y 0,8651),
  y la API se quedaba con el primero que llegara.

La regla, entonces: **agrupar por código; el nombre se arrastra con
`nombre_vigente()`**, que se queda con el más reciente. El más reciente y no el
más frecuente porque un organismo renombrado debe aparecer con su nombre de hoy:
el histórico largo haría ganar siempre al nombre viejo.
"""

from __future__ import annotations

import polars as pl

#: Columna de período que traen todos los parquets de ChileCompra ("2026-01").
#: Ordena lexicográficamente igual que cronológicamente, así que sirve de reloj
#: sin parsearla.
PERIODO = "_periodo_archivo"


def nombre_vigente(columna: str, periodo: str = PERIODO) -> pl.Expr:
    """El último nombre conocido de la entidad, para usar dentro de un `agg`.

    Descarta los nulos antes de ordenar: si el registro más reciente vino sin
    nombre, lo correcto es el último nombre que sí existió, no `None`.

    Las dos columnas se filtran con la **misma** máscara, no cada una por su
    lado: `drop_nulls()` independiente en cada una las deja de distinto largo y
    Polars rechaza el `sort_by`. Además emparejaría el nombre de una fila con el
    período de otra, que es peor que fallar.
    """
    hay_nombre = pl.col(columna).is_not_null()
    return (
        pl.col(columna)
        .filter(hay_nombre)
        .sort_by(pl.col(periodo).filter(hay_nombre))
        .last()
        .alias(columna)
    )


def periodo_maximo(periodo: str = PERIODO) -> pl.Expr:
    """El período más reciente del grupo, para poder volver a elegir el nombre
    tras concatenar varias tandas."""
    return pl.col(periodo).max().alias(periodo)

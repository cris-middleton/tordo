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

#: Columna de período que traen todos los parquets de ChileCompra: el nombre del
#: ZIP, «2026-3», **sin cero a la izquierda**. Como texto no ordena por fecha
#: («2025-9» > «2025-12»), así que se ordena siempre por `clave_periodo`. Hasta
#: octubre de 2026 se ordenaba como texto: en una ventana que cruzaba
#: septiembre y diciembre, el «nombre vigente» era el de septiembre.
PERIODO = "_periodo_archivo"


def clave_periodo(periodo: str = PERIODO) -> pl.Expr:
    """«2026-3» → 2026·12 + 3: un entero que ordena como el calendario.

    Lee también «2026-03». Un período ilegible o nulo vale -1: el más antiguo.
    """
    texto = pl.col(periodo).cast(pl.Utf8)
    anio = texto.str.extract(r"^(\d{4})-", 1).cast(pl.Int32, strict=False)
    mes = texto.str.extract(r"-(\d{1,2})$", 1).cast(pl.Int32, strict=False)
    return (anio * 12 + mes).fill_null(-1)


def _extremo(periodo: str, ultimo: bool) -> pl.Expr:
    ordenado = pl.col(periodo).sort_by(clave_periodo(periodo)).drop_nulls()
    return (ordenado.last() if ultimo else ordenado.first()).alias(periodo)


def nombre_vigente(columna: str, periodo: str = PERIODO) -> pl.Expr:
    """El último nombre conocido de la entidad, para usar dentro de un `agg`.

    Ordena primero y descarta los nulos después: si el registro más reciente
    vino sin nombre, lo correcto es el último nombre que sí existió, no `None`.

    No se filtra cada columna por su lado antes del `sort_by`: las dejaría de
    distinto largo y emparejaría el nombre de una fila con el período de otra.
    Y filtrar las dos con la misma máscara rompe en Polars 0.20 cuando un grupo
    se queda vacío (un comprador sin ningún nombre en la tanda):
    «expressions in 'sort_by' produced a different number of groups».
    """
    # A igualdad de período (770 códigos de producto traen dos nombres genéricos en
    # el mismo mes) desempata el propio texto: la misma entrada da la misma salida.
    return (
        pl.col(columna)
        .sort_by([clave_periodo(periodo), pl.col(columna)])
        .drop_nulls()
        .last()
        .alias(columna)
    )


def periodo_maximo(periodo: str = PERIODO) -> pl.Expr:
    """El período más reciente del grupo, para poder volver a elegir el nombre
    tras concatenar varias tandas. En el formato original, ordenado por fecha."""
    return _extremo(periodo, ultimo=True)


def periodo_minimo(periodo: str = PERIODO) -> pl.Expr:
    """El período más antiguo del grupo, ordenado por fecha."""
    return _extremo(periodo, ultimo=False)

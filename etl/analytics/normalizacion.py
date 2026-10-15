"""Normalización del producto y de la unidad de medida para las bandas de precio.

**Por qué existe este módulo.** `codigoProductoONU` no identifica un producto:
identifica una *categoría* del catálogo UNSPSC. Medido sobre los datos reales de
2026-03, dentro de «Reactivos o soluciones químicos» comprados por un mismo
hospital, en el mismo mes y con la misma unidad, conviven un calibrador de Chagas
a $557.062 y un criovial a $1. La banda que sale de ahí no describe un mercado,
describe una categoría — y su dispersión no es información, es ruido.

Lo que sí identifica al producto es `EspecificacionComprador`, el texto libre que
el comprador escribe en la línea de la orden. El problema del texto libre es que
«guantes nitrilo talla M caja 100» y «GUANTE DE NITRILO M X100» son el mismo
producto y dos cadenas distintas. De ahí la *firma*: una forma canónica que hace
que las dos caigan en el mismo grupo.

Medido con el pipeline real sobre 1, 2 y 3 meses consecutivos de 2026, la banda
que sale de agrupar por firma es **más de dos veces más estrecha** que la que
sale de agrupar por categoría:

    meses   ítems       QCD mediano firma   QCD mediano categoría   cobertura firma
      1     332.765           0,250                 0,589                22,1 %
      2     672.279           0,244                 0,575                25,2 %
      3   1.067.551           0,210                 0,572                28,9 %

Dos lecturas que conviene tener claras antes de tocar esto:

- **La mejora de dispersión es estable y grande**, y no depende de cuánta
  historia haya: es una propiedad de agrupar el mismo producto.
- **La cobertura sí crece con la historia** (22 % → 29 % en tres meses), pero la
  muestra *mediana* por grupo se queda en 3, porque cada mes nuevo trae
  productos nuevos casi al mismo ritmo al que profundiza los que ya estaban. Es
  decir: con más corpus se cubren más productos, no se conocen mucho mejor los
  que ya se cubrían. **No supongas que la cola larga se cierra sola.**

**La regla de qué palabras cuentan** —`RUIDO`, el mínimo de letras, el tope de
tokens y los caracteres válidos— **vive en `backend/app/utils/firma.py`** y se
importa por `etl/shared_imports.py`: la búsqueda de productos de la API la usa
con el término, y una copia aquí se desincronizaría sin que nada fallara.
"""

from __future__ import annotations

import polars as pl

from etl.shared_imports import FUERA_DE_TOKEN, MAX_TOKENS, MIN_TOKEN, RUIDO

#: Unidades que no dicen nada. Se colapsan todas a un único valor para que no
#: se fragmenten los grupos: hoy conviven «NA», «Unidad no definida» y vacío,
#: que son la misma ausencia escrita de tres formas.
_UNIDADES_SIN_VALOR: frozenset[str] = frozenset(
    {"", "na", "n a", "null", "none", "otro", "otros", "unidad no definida", "no definida"}
)

#: Valor canónico para la unidad ausente. Explícito y no vacío: una cadena vacía
#: en una clave de agrupación es indistinguible de un fallo de lectura.
UNIDAD_SIN_DECLARAR = "sin unidad declarada"


def canonizar_unidad(columna: str = "UnidadMedida") -> pl.Expr:
    """Unidad de medida en forma canónica.

    Los datos traen 97 valores distintos con variantes de mayúsculas y tildes.
    Dos escrituras de la misma unidad parten el grupo en dos, y cada mitad se
    queda por debajo del mínimo de muestra.
    """
    limpia = (
        pl.col(columna)
        .fill_null("")
        .str.to_lowercase()
        .str.replace_all(r"[^a-z0-9áéíóúñü ]", " ")
        .str.replace_all(r"\s+", " ")
        .str.strip_chars()
    )
    return (
        pl.when(limpia.is_in(list(_UNIDADES_SIN_VALOR)))
        .then(pl.lit(UNIDAD_SIN_DECLARAR))
        .otherwise(limpia)
        .alias("unidad_norm")
    )


def firma_producto(columna: str = "EspecificacionComprador") -> pl.Expr:
    """Forma canónica de la especificación del ítem.

    Minúsculas, sin puntuación (las tildes se conservan: las quita el slug), sin palabras de relleno, sin tokens
    cortos, **sin números** y con los tokens **únicos y ordenados**.

    Dos decisiones que no son obvias:

    - **Se ordenan los tokens.** El orden de las palabras no cambia el producto,
      y sí cambia la cadena: «nitrilo guantes M» y «guantes nitrilo M» son el
      mismo artículo escrito por dos personas.
    - **Se quita cualquier token que contenga un dígito**, no sólo los números
      puros. Contraintuitivo, porque «caja 100» y «caja 50» sí son productos
      distintos, y porque se pierde «25mg» o «11mm». Pero en los datos reales
      lo que llevan dígitos son códigos internos —`CS80060`, `B04D0061`,
      `40-025-105-389-00`, `b553t`—, y cada uno de ellos parte el producto en
      un grupo de una sola observación.

      Medido sobre 2026-03, contra la alternativa de quitar sólo los números
      puros: 13.377 bandas en vez de 11.802, misma dispersión mediana
      (QCD 0,200) y la cobertura útil sube del 7,7 % al 8,5 %. Gana en las
      cuatro métricas a la vez, que es lo que convierte una intuición discutible
      en una decisión. El formato, cuando de verdad importa, viaja en la unidad
      de medida.
    """
    tokens = (
        pl.col(columna)
        .fill_null("")
        .str.to_lowercase()
        .str.replace_all(FUERA_DE_TOKEN, " ")
        .str.replace_all(r"\s+", " ")
        .str.strip_chars()
        .str.split(" ")
        .list.eval(
            pl.element().filter(
                ~pl.element().is_in(list(RUIDO))
                & (pl.element().str.len_chars() >= MIN_TOKEN)
                & ~pl.element().str.contains(r"\d")
            )
        )
        .list.unique()
        .list.sort()
        .list.head(MAX_TOKENS)
    )
    return tokens.list.join(" ").alias("firma_producto")


def firma_es_utilizable(columna: str = "firma_producto") -> pl.Expr:
    """Una firma con uno o cero tokens no identifica nada.

    «servicio» o «insumo» como firma completa agrupa cosas sin relación. El
    mínimo de dos tokens es lo que separa una descripción de una etiqueta.
    """
    return pl.col(columna).str.count_matches(" ") >= 1

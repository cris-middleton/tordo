r"""Cuándo un texto contiene un término: al COMIENZO de una palabra.

Las búsquedas por fragmento eran `ILIKE '%t%'`, y un fragmento encontraba
cualquier palabra que lo llevara dentro: «bus» traía «combustible» y «mesa»,
«parmesano». La regla de ahora ancla el término al comienzo de una palabra con
`\m`, el «comienzo de palabra» de las expresiones regulares de Postgres:

- «valvul» sigue encontrando «válvula» (y «guante», «guantes»): se puede
  escribir el principio de una palabra.
- «bus» encuentra «bus» y «buses», no «combustible».
- «ospital» ya no encuentra «hospital».

El índice de trigramas (`gin_trgm_ops`) sirve `~*` igual que servía `ILIKE`:
saca los trigramas de la parte literal del patrón. Medido con `EXPLAIN ANALYZE`
sobre 100.000 nombres: «bus» usa `ix_licitaciones_nombre_trgm`, toma 400
candidatas y el recheck descarta las 200 de «combustible».

**Lo que escribe el usuario se busca literal.** Todo carácter que no sea letra,
dígito o espacio se escapa con «\»: en una regex de Postgres (ARE), «\» seguido
de algo que no es alfanumérico es ese carácter tal cual. El escape lo hace
Postgres, DESPUÉS de quitar las tildes: `unaccent` convierte «©» en «(C)», y un
escape hecho antes en Python dejaría un paréntesis suelto, que es un error de
sintaxis y no un «no encontré nada».

Una sola regla para todas las búsquedas por fragmento de la API: el catálogo y
«Lo mejor de hoy» (`coincide_termino`) y los productos de `/bi/productos`
(`_analytics_sql.sql_busqueda_texto`). La búsqueda de `/publico/productos` compara
contra slugs en Polars y usa la misma idea con el guion como separador
(`services/publico/paginas.buscar_productos`).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import String, func, literal
from sqlalchemy.sql.elements import ColumnElement

#: Comienzo de palabra en las regex de Postgres.
COMIENZO_DE_PALABRA = r"\m"
#: Lo que se escapa: todo lo que no es letra, dígito o espacio.
NO_ALFANUMERICO = r"([^[:alnum:][:space:]])"
#: El reemplazo de `regexp_replace`: una «\» literal y el carácter capturado.
ESCAPE = r"\\\1"


def fragmento(termino: str) -> str:
    r"""El término desde su primera letra o dígito.

    `\m` sólo casa delante de una letra o un dígito: «(bus» o «.net» no
    encontrarían nada nunca. Se recorta el principio —«(bus» busca «bus»— y lo
    demás («c++», «3/4») se busca literal. Vacío si no queda nada («&»): quien
    llama decide que eso no coincide con ninguna fila.
    """
    for posicion, caracter in enumerate(termino):
        if caracter.isalnum():
            return termino[posicion:]
    return ""


def patron(termino_sql: Any) -> ColumnElement:
    r"""El patrón `\m<término escapado>`, armado en SQL a partir de una expresión."""
    return literal(COMIENZO_DE_PALABRA, String) + func.regexp_replace(
        termino_sql, NO_ALFANUMERICO, ESCAPE, "g"
    )


def comienza_palabra(columna: Any, termino_sql: Any) -> ColumnElement:
    """`columna ~* patron(termino)`: el término al comienzo de alguna palabra.

    `termino_sql` es una expresión, no un `str`, para que quien llama pueda
    pasarlo antes por `inmutable_unaccent` y el escape ocurra después.
    """
    # Entre paréntesis: en Postgres `~*` y `||` tienen la misma precedencia y se
    # asocian por la izquierda, así que sin ellos se leería `(col ~* '\m') || t`.
    return columna.op("~*", is_comparison=True)(patron(termino_sql).self_group())


def sql_comienza_palabra(columna_sql: str) -> str:
    """La misma condición para SQL textual, con los parámetros de `parametros`."""
    return (
        f"{columna_sql} ~* (:comienzo_de_palabra || "
        "regexp_replace(:termino, :no_alfanumerico, :escape, 'g'))"
    )


def parametros(termino: str) -> dict[str, str]:
    """Los parámetros ligados de `sql_comienza_palabra`."""
    return {
        "comienzo_de_palabra": COMIENZO_DE_PALABRA,
        "termino": termino,
        "no_alfanumerico": NO_ALFANUMERICO,
        "escape": ESCAPE,
    }

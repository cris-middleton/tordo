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
(`_analytics_sql.sql_busqueda_texto`, sobre la columna generada `COLUMNA_BUSCABLE`). La búsqueda de `/publico/productos` compara
contra slugs en Polars y usa la misma idea con el guion como separador
(`services/publico/paginas.buscar_productos`).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, func, literal
from sqlalchemy.sql.elements import ColumnElement

from app.utils.firma import terminos_de_busqueda
from app.utils.sinonimos import SOLO_CLAVE, alternativas, formas

#: La columna generada (`sql_normalizado` del nombre) que el ETL añade a las
#: tablas de analytics donde se busca texto, con su índice de trigramas. Hoy,
#: `product_price_bands_l3` (`/bi/productos?q=`).
COLUMNA_BUSCABLE = "texto_buscable"

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


#: Una palabra que se corrige: sólo letras. El stemmer sólo confunde palabras
#: («mesa» con «meses»); con dígitos o signos («covid-19», «2.500», «1/2») el
#: parser de Postgres corta distinto que Python, y exigirlas aquí las dejaba sin
#: ninguna coincidencia.
_PALABRA = re.compile(r"[a-z]+")


def palabras(termino: str) -> list[str]:
    """Las palabras de sólo letras del término, en minúsculas y sin tildes.

    «Válvulas covid-19» → `["valvulas"]`. Es lo que hace `inmutable_unaccent` +
    la configuración `simple` con el texto indexado en
    `licitaciones.busqueda_palabras`: los dos lados igual. Lo demás queda sólo
    con el stemmer, como antes.
    """
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", termino.lower()) if not unicodedata.combining(c)
    )
    return [w for w in sin_tildes.split() if _PALABRA.fullmatch(w)]


def consulta_prefijos(palabra: str) -> str:
    """Un `tsquery` (`simple`): alguna palabra con una de las `formas` de esta.

    El stemmer español junta «mesa» con «meses» (raíz `mes`); esto es lo que los
    separa: «mesa» exige una palabra que empiece por `mesa`. Y no se pierde lo
    que el stemmer sí acertaba (`app/utils/sinonimos.formas`):

    - el singular, exacto: «servicios» encuentra «servicio» y «camiones»,
      «camión». Exacto y no como prefijo: con `mes:*`, «meses» volvería a
      encontrar «mesas»;
    - el otro género, como prefijo: «clínica» encuentra «clínico» y «clínicos»,
      «eléctrico», «eléctrica». Sin esto «clínica» bajaba de 108 coincidencias a
      20 en la copia local. «mesa» pide además `meso:*`, que no es «meses»;
    - «-ora» sin la «a»: «computadora» encuentra «computador». El stemmer los
      junta (`comput`) y esta corrección los separaba: 0 de 7 en la copia local.

    Una palabra de `palabras` sólo trae `[a-z]`, así que no hay nada que escapar.
    """
    return " | ".join(f"{f.texto}:*" if f.prefijo else f.texto for f in formas(palabra))


def sql_normalizado(expresion_sql: str) -> str:
    """Un texto como se compara en analytics: sin tildes y en minúsculas.

    Es la expresión de la columna generada `COLUMNA_BUSCABLE` que el ETL añade a
    las tablas donde se busca texto (`etl/loaders/analytics_loader.py`, que la
    importa de aquí) y la que se aplica al término: los dos lados igual.
    """
    return f"lower(inmutable_unaccent({expresion_sql}))"


def sql_comienza_palabra(columna_sql: str) -> str:
    """La misma condición para SQL textual, con los parámetros de `parametros`.

    El término se normaliza con `sql_normalizado` antes de escaparlo, así que
    `columna_sql` tiene que venir normalizada igual: la columna generada
    `COLUMNA_BUSCABLE` o `sql_normalizado(columna)`.
    """
    return (
        f"{columna_sql} ~* (:comienzo_de_palabra || "
        f"regexp_replace({sql_normalizado(':termino')}, :no_alfanumerico, :escape, 'g'))"
    )


def parametros(termino: str) -> dict[str, str]:
    """Los parámetros ligados de `sql_comienza_palabra`."""
    return {
        "comienzo_de_palabra": COMIENZO_DE_PALABRA,
        "termino": termino,
        "no_alfanumerico": NO_ALFANUMERICO,
        "escape": ESCAPE,
    }


#: Fin de palabra en las regex de Postgres: una forma que tiene que ser la
#: palabra entera (el singular) termina ahí.
FIN_DE_PALABRA = r"\M"


def patron_de_palabra(palabra: str, *, con_alternativas: bool = True) -> str:
    r"""`\m(?:…)`: alguna forma de la palabra —o de sus alternativas— al comienzo de una palabra.

    Las formas que son la palabra entera (el singular) llevan `\M` detrás:
    «guantes» → `\m(?:guantes|guante\M|guant\M)`. Sólo para palabras de `[a-z]`
    (las de `terminos_de_busqueda`), así que no hay nada que escapar.
    """
    trozos: list[str] = []
    for otra in alternativas(palabra) if con_alternativas else [palabra]:
        for forma in formas(otra):
            trozos.append(forma.texto if forma.prefijo else forma.texto + FIN_DE_PALABRA)
    return COMIENZO_DE_PALABRA + "(?:" + "|".join(dict.fromkeys(trozos)) + ")"


@dataclass(frozen=True)
class CondicionTexto:
    """Una búsqueda de texto lista para un `WHERE`, con sus parámetros ligados."""

    donde: str
    #: Una expresión booleana para ordenar primero lo que coincide sin
    #: sinónimos, o None si no hay sinónimos que separar.
    directa: str | None
    parametros: dict[str, str]


_SOLO_LETRAS = re.compile(r"[a-z]+")


def condicion_por_palabras(columna_sql: str, consulta: str) -> CondicionTexto | None:
    """Cada palabra útil de la consulta, con sus formas y alternativas, en `columna_sql`.

    Las palabras son las de la firma (`terminos_de_busqueda`: sin artículos ni
    ruido, de tres letras o más, sin dígitos) más las claves cortas que llevan a
    otra («pc»). Todas tienen que estar (AND), en cualquier orden: «guantes de
    nitrilo» encuentra «Guantes de examen de nitrilo». Antes se buscaba la
    consulta entera como un solo comienzo de palabra, y ese mismo texto no
    encontraba nada.

    Sin ninguna palabra útil («A4», «3/4», «c++») queda la regla de siempre: la
    consulta entera desde su primera letra o dígito, escapada en Postgres
    (`sql_comienza_palabra`). None si ni eso («%», «&»).

    `columna_sql` tiene que venir normalizada (`sql_normalizado` o la columna
    generada `COLUMNA_BUSCABLE`): los patrones son de `[a-z]`.
    """
    utiles = terminos_de_busqueda(consulta)
    utiles += [p for p in palabras(consulta) if p in SOLO_CLAVE and p not in utiles]
    utiles = [p for p in utiles if _SOLO_LETRAS.fullmatch(p)]
    if utiles:
        ligados: dict[str, str] = {}
        donde, directa = [], []
        for i, palabra in enumerate(utiles):
            ligados[f"patron_{i}"] = patron_de_palabra(palabra)
            ligados[f"directo_{i}"] = patron_de_palabra(palabra, con_alternativas=False)
            donde.append(f"{columna_sql} ~* :patron_{i}")
            directa.append(f"{columna_sql} ~* :directo_{i}")
        return CondicionTexto(
            donde=" AND ".join(donde), directa=" AND ".join(directa), parametros=ligados
        )
    trozo = fragmento(consulta.strip())
    if not trozo:
        return None
    return CondicionTexto(
        donde=sql_comienza_palabra(columna_sql), directa=None, parametros=parametros(trozo)
    )

"""El slug de las páginas públicas: UNA función, usada en todas partes.

Los rubros (RubroN2) no traen código y las firmas de producto son texto, así que
la URL de su página sale de su nombre. Si el slug se calculara en dos sitios —el
sitemap y la resolución, o el backend y el frontend— bastaría con que uno
tratara distinto una tilde para que el sitemap anunciara páginas que dan 404.
Por eso **el frontend nunca des-slugifica**: recibe el slug hecho y el backend
resuelve slug → nombre.

Regla: sin tildes, minúsculas, todo lo que no sea `[a-z0-9]` pasa a `-`, sin
guiones repetidos ni en los bordes, y como mucho `LARGO_MAXIMO` caracteres.
"""

from __future__ import annotations

import re
import unicodedata

#: Tope de largo. Las firmas de producto llegan a ~110 caracteres; una URL más
#: larga no ayuda a nadie y se recorta en los resultados de búsqueda.
LARGO_MAXIMO = 80

_NO_ALFANUMERICO = re.compile(r"[^a-z0-9]+")


def slug(texto: str | None, largo: int | None = LARGO_MAXIMO) -> str:
    """`"Equipos médicos / Insumos"` → `"equipos-medicos-insumos"`.

    La «ñ» pasa a «n» (se descompone como n + virgulilla). Un texto sin ningún
    carácter alfanumérico devuelve cadena vacía: quien llame decide qué hacer
    con eso (no tiene página).

    `largo=None` no recorta: es para comparar un nombre entero (la búsqueda de
    compradores), no para una URL.
    """
    if not texto:
        return ""
    # Se quitan SÓLO las marcas diacríticas. Un `encode("ascii", "ignore")`
    # borraría también una raya o un símbolo en vez de convertirlo en guion, y
    # pegaría las dos palabras de alrededor.
    descompuesto = unicodedata.normalize("NFKD", texto)
    sin_tildes = "".join(c for c in descompuesto if not unicodedata.combining(c)).lower()
    limpio = _NO_ALFANUMERICO.sub("-", sin_tildes).strip("-")
    # Recortar puede dejar un guion colgando al final: se vuelve a limpiar.
    return limpio if largo is None else limpio[:largo].rstrip("-")

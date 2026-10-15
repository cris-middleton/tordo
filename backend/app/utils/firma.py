"""La regla de la firma de producto: qué palabras cuentan y cuáles no.

La usan dos lados que no pueden divergir:

- el ETL, que agrupa las órdenes de compra por la firma de su
  `EspecificacionComprador` (`etl/analytics/normalizacion.py`, `firma_producto`);
- la búsqueda de productos de la API (`services/publico/paginas.buscar_productos`),
  que busca esas firmas.

La regla vivía sólo en el ETL, dentro de un módulo de Polars que la API no puede
importar (su imagen no lleva `etl/`), y la búsqueda exigía cada palabra del
término tal cual: «guantes de nitrilo» pedía un «de» que la firma ya había
quitado. Por eso vive aquí, en Python puro, y el ETL la importa por
`etl/shared_imports.py`. **No se copia**, igual que `models/convocatoria.py`.

La regla, en el orden en que se aplica:

1. minúsculas;
2. todo lo que no sea `[a-z0-9áéíóúñü ]` pasa a espacio (`FUERA_DE_TOKEN`);
3. fuera los tokens de `RUIDO`, los de menos de `MIN_TOKEN` letras y los que
   lleven un dígito.

La firma, además, deja los tokens únicos y ordenados y se queda con los
`MAX_TOKENS` primeros. Por qué cada decisión, con sus números, está en
`etl/analytics/normalizacion.py`.

**Las tildes NO se quitan en la firma** («vehículos» queda «vehículos»): las quita
el slug. Por eso `terminos_de_busqueda` devuelve slugs, que es contra lo que se busca.
"""

from __future__ import annotations

import re
import unicodedata

from app.utils.slug import slug

#: Palabras que aparecen en casi cualquier especificación y no distinguen producto.
#: Sin quitarlas, «según detalle adjunto» hace que dos productos sin nada que ver
#: compartan la mitad de sus tokens. Van con y sin tilde porque la firma conserva
#: las tildes: «según» y «segun» son dos tokens distintos.
RUIDO: frozenset[str] = frozenset(
    {
        "de",
        "del",
        "la",
        "el",
        "los",
        "las",
        "un",
        "una",
        "unos",
        "unas",
        "y",
        "o",
        "a",
        "en",
        "con",
        "para",
        "por",
        "al",
        "se",
        "su",
        "sus",
        "segun",
        "según",
        "detalle",
        "detalles",
        "adjunto",
        "adjunta",
        "adjuntos",
        "solicitud",
        "solicita",
        "solicitado",
        "compra",
        "item",
        "items",
        "nro",
        "numero",
        "número",
        "cotizacion",
        "cotización",
        "oc",
        "favor",
        "enviar",
        "indicar",
        "ficha",
        "tecnica",
        "técnica",
        "ref",
        "referencia",
        "codigo",
        "código",
        "cod",
        "sku",
        "acuerdo",
        "conforme",
        "correspondiente",
        "respectivo",
    }
)

#: Longitud mínima de un token para que cuente. Por debajo son casi siempre
#: letras sueltas de códigos internos — y artículos: «de», «la», «en».
MIN_TOKEN = 3

#: Tope de tokens de la firma. Sin tope, una especificación de sesenta palabras
#: («…según bases administrativas del proceso 1234-56-LP25…») no coincide nunca
#: con nada, ni siquiera consigo misma escrita otro día.
MAX_TOKENS = 8

#: Lo que no puede formar parte de un token. Es una expresión regular que entienden
#: igual `re` y Polars (Rust): la usan los dos lados.
FUERA_DE_TOKEN = r"[^a-z0-9áéíóúñü ]"

_FUERA_DE_TOKEN = re.compile(FUERA_DE_TOKEN)
_DIGITO = re.compile(r"\d")


def tokens_de_firma(texto: str | None) -> list[str]:
    """Los tokens que la firma conserva de `texto`, sin repetir, en el orden del texto.

    Es `firma_producto` escrita en Python: ordenarlos y quedarse con los
    `MAX_TOKENS` primeros da la firma byte a byte. Lo comprueba
    `etl/tests/test_normalizacion_precio.py` (y, medido el 2026-10-14, coincide
    en las 331.741 especificaciones distintas de 2026-03).
    """
    limpio = _FUERA_DE_TOKEN.sub(" ", (texto or "").lower())
    tokens: list[str] = []
    for token in limpio.split():
        if token in RUIDO or len(token) < MIN_TOKEN or _DIGITO.search(token):
            continue
        if token not in tokens:
            tokens.append(token)
    return tokens


def terminos_de_busqueda(texto: str | None) -> list[str]:
    """Las palabras de una búsqueda que una firma puede contener, como slugs.

    `"Guantes de nitrilo"` → `["guantes", "nitrilo"]`;
    `"ARRIENDO DE VEHÍCULOS"` → `["arriendo", "vehiculos"]`.

    - **Es la firma del término**: fuera las mismas palabras y con el mismo tope.
      Con más de `MAX_TOKENS` palabras útiles se queda con las mismas que la
      firma de ese texto. Pegar una especificación corta o mediana encuentra su
      firma; con una firma larga no siempre, porque la búsqueda compara contra
      el `slug`, que `slug()` corta en `LARGO_MAXIMO` (80) caracteres.
      Salen en el orden de la firma (alfabético).
    - **Sin tildes**: cada token pasa por `slug()`, porque la búsqueda compara
      contra el slug de la firma. «vehiculos» y «vehículos» buscan lo mismo.
    - **NFC antes que nada.** Un término con la tilde como carácter aparte (lo
      mandan algunos teclados) partiría la palabra en dos al tratar la tilde
      suelta como puntuación. La firma no lo necesita: el texto de ChileCompra
      llega compuesto.
    - **Puede devolver `[]`** («de la», «pc», «500»): ninguna firma tiene esas
      palabras. Quien llama decide qué hacer.
    """
    compuesto = unicodedata.normalize("NFC", texto or "")
    terminos: list[str] = []
    for token in sorted(tokens_de_firma(compuesto))[:MAX_TOKENS]:
        termino = slug(token)
        if termino not in terminos:
            terminos.append(termino)
    return terminos

"""«¿Quisiste decir…?»: la búsqueda corregida cuando no encontró nada.

Una palabra mal escrita («computdor», «guantez») no encuentra nada en ninguna de
las tres búsquedas de `/buscar`, y la página sólo podía decir «no encontramos».
Aquí se propone la misma búsqueda con cada palabra desconocida cambiada por la
palabra conocida más parecida.

**El vocabulario es el de los productos**: las palabras de las firmas del índice
de páginas públicas (`indexables.indice().productos`), que ya vive en memoria.
Son las palabras con que los compradores del Estado escriben lo que compran
—decenas de miles—, pesadas por cuántas compras las usan. No se pregunta nada a
la base: con el índice en caché, sugerir no lee ninguna tabla.

Qué es «conocida»: que la palabra, o alguna de sus formas
(`app/utils/sinonimos.formas`: «guante» empieza «guantes»), encuentre alguna
palabra del vocabulario. Una conocida no se toca aunque la búsqueda entera no
encuentre nada: el problema es otro (una combinación que no existe).

Qué es «parecida»: `difflib`, con una razón de al menos `RAZON_MINIMA`, entre
las palabras que empiezan con la misma letra y miden casi lo mismo. Las de
menos de `LARGO_MINIMO` letras no se corrigen: con tres letras hay demasiadas
parecidas para elegir una con sentido.
"""

from __future__ import annotations

import bisect
import difflib
import re
import threading
import weakref
from dataclasses import dataclass

import polars as pl

from app.repositories.busqueda import palabras
from app.services.publico import indexables
from app.utils import sinonimos

#: Desde cuántas letras se corrige una palabra.
LARGO_MINIMO = 4
#: Cuánto se tiene que parecer la sugerida (`SequenceMatcher.ratio`). «computdor»
#: y «computador» dan 0,95; «silal» y «silla», 0,80.
RAZON_MINIMA = 0.8
#: Cuántas letras de más o de menos puede tener la sugerida.
DIFERENCIA_DE_LARGO = 2

_PALABRA = re.compile(r"[a-z]{3,}")


@dataclass(frozen=True)
class Vocabulario:
    #: Palabra → cuántas compras la usan (suma de `n` de las firmas que la llevan).
    peso: dict[str, int]
    #: Las mismas, ordenadas, para buscar por comienzo con `bisect`.
    ordenadas: list[str]

    def alguna_empieza(self, prefijo: str) -> bool:
        i = bisect.bisect_left(self.ordenadas, prefijo)
        return i < len(self.ordenadas) and self.ordenadas[i].startswith(prefijo)


def vocabulario_de(productos: pl.DataFrame) -> Vocabulario:
    """Las palabras de los slugs, con las compras de las firmas que las llevan."""
    if productos.is_empty():
        return Vocabulario(peso={}, ordenadas=[])
    filas = (
        productos.select(pl.col("slug").str.split("-").alias("palabra"), pl.col("n"))
        .explode("palabra")
        .filter(pl.col("palabra").str.contains(r"^[a-z]{3,}$"))
        .group_by("palabra")
        .agg(pl.col("n").sum())
    )
    peso = dict(
        zip(filas.get_column("palabra").to_list(), filas.get_column("n").to_list(), strict=True)
    )
    return Vocabulario(peso=peso, ordenadas=sorted(peso))


_cerrojo = threading.Lock()
#: El vocabulario y el índice del que salió: se rehace cuando el índice cambia. Una
#: referencia débil y no `id()`, que Python reusa cuando el índice viejo se libera.
_cache: tuple[weakref.ref, Vocabulario] | None = None


def vocabulario() -> Vocabulario:
    global _cache
    actual = indexables.indice()
    with _cerrojo:
        if _cache is None or _cache[0]() is not actual:
            _cache = (weakref.ref(actual), vocabulario_de(actual.productos))
        return _cache[1]


def es_conocida(palabra: str, vocab: Vocabulario) -> bool:
    """Alguna forma de la palabra encuentra alguna palabra del vocabulario."""
    for forma in sinonimos.formas(palabra):
        if forma.prefijo and vocab.alguna_empieza(forma.texto):
            return True
        if not forma.prefijo and forma.texto in vocab.peso:
            return True
    return False


def mas_parecida(palabra: str, vocab: Vocabulario) -> str | None:
    """La palabra del vocabulario más parecida, o None si ninguna lo es bastante.

    Entre las que empiezan con la misma letra y miden casi lo mismo; a igual
    parecido, la de más compras, y luego la primera en orden alfabético, para
    que la misma búsqueda sugiera siempre lo mismo.
    """
    inicio = bisect.bisect_left(vocab.ordenadas, palabra[0])
    fin = bisect.bisect_left(vocab.ordenadas, chr(ord(palabra[0]) + 1))
    mejor: tuple[float, int, str] | None = None
    comparador = difflib.SequenceMatcher(b=palabra, autojunk=False)
    for candidata in vocab.ordenadas[inicio:fin]:
        if abs(len(candidata) - len(palabra)) > DIFERENCIA_DE_LARGO:
            continue
        comparador.set_seq1(candidata)
        if comparador.real_quick_ratio() < RAZON_MINIMA or comparador.quick_ratio() < RAZON_MINIMA:
            continue
        razon = comparador.ratio()
        if razon < RAZON_MINIMA:
            continue
        clave = (razon, vocab.peso[candidata], candidata)
        if mejor is None or (clave[0], clave[1]) > (mejor[0], mejor[1]):
            mejor = clave
    return mejor[2] if mejor else None


def sugerencia(q: str) -> str | None:
    """La búsqueda con cada palabra desconocida corregida, o None si no hay nada que corregir.

    Las palabras que no se corrigen —conocidas, cortas, con dígitos o signos,
    sin ninguna parecida— salen tal cual las escribió quien buscó.
    """
    vocab = vocabulario()
    if not vocab.peso:
        return None
    salida: list[str] = []
    cambio = False
    for token in q.split():
        normal = palabras(token)
        palabra = normal[0] if len(normal) == 1 else None
        if (
            palabra is None
            or not _PALABRA.fullmatch(palabra)
            or len(palabra) < LARGO_MINIMO
            or palabra in sinonimos.SINONIMOS
            or es_conocida(palabra, vocab)
        ):
            salida.append(token)
            continue
        parecida = mas_parecida(palabra, vocab)
        if parecida is None:
            salida.append(token)
            continue
        salida.append(parecida)
        cambio = True
    return " ".join(salida) if cambio else None

"""Las otras formas de una palabra buscada: plural, género y sinónimos.

Quien busca escribe una palabra y espera encontrar sus otras formas. Medido en
la copia local el 2026-10-22, antes de esto:

- «lápices» encontraba 20 productos y dejaba fuera los 165 de «lápiz»: el plural
  en «-ces» no empieza por el singular en «-z»;
- «guantes» encontraba 190 y dejaba fuera los 385 de «guante»;
- «computadora» no encontraba ninguna de las 7 licitaciones de «computador»: el
  stemmer las junta (`comput`), pero la corrección que separa «mesa» de «meses»
  pedía una palabra que empezara por «computadora» o «computadoro».

Dos cosas distintas, en dos funciones:

- `formas`: cómo puede aparecer ESA palabra en un texto (como comienzo de una
  palabra, o como la palabra entera). Es morfología, sin diccionario.
- `alternativas`: OTRAS palabras que también responden a la búsqueda, cada una
  con sus formas: «lápiz» → «lápices», «lapicera», «bolígrafo». El plural en
  «-ces» va aquí y no en `formas` porque el stemmer los separa (`lapiz` y
  `lapic`): para la búsqueda por palabras son dos palabras.

Todo sobre palabras ya normalizadas: minúsculas, sin tildes, sólo `[a-z]`. Es
Python puro, sin dependencias, para que lo usen el catálogo (`repositories/
licitaciones.py`) y la búsqueda de productos (`services/publico/paginas.py`)
con la misma regla.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Forma:
    texto: str
    #: True: basta con que una palabra del texto EMPIECE así. False: tiene que
    #: SER esa palabra. El singular va exacto: con «mes» como prefijo, «meses»
    #: volvería a encontrar «mesas».
    prefijo: bool


#: El otro género de una terminación: «clínica» tiene que encontrar «clínico».
_GENERO = {"a": "o", "o": "a"}


def singulares(palabra: str) -> list[str]:
    """Los singulares posibles de una palabra que termina como un plural.

    «servicios» → «servicio»; «camiones» → «camione», «camion»; «lapices» →
    «lapice», «lapic» y «lapiz». Se proponen todos y no se elige: cada uno se
    busca como palabra entera, y el que no existe no encuentra nada.
    """
    resultado: list[str] = []
    if len(palabra) > 3 and palabra.endswith("s"):
        resultado.append(palabra[:-1])
    if len(palabra) > 4 and palabra.endswith("es"):
        resultado.append(palabra[:-2])
    if len(palabra) > 4 and palabra.endswith("ces"):
        resultado.append(palabra[:-3] + "z")
    return resultado


def formas(palabra: str) -> list[Forma]:
    """Cómo puede aparecer `palabra` en un texto.

    - Como comienzo de palabra: «guante» encuentra «guantes».
    - Su singular, entero: «guantes» encuentra «guante».
    - El otro género, como comienzo: «clínica» encuentra «clínico».
    - «-ora» sin la «a», como comienzo: «computadora» encuentra «computador» e
      «impresora», «impresor». Con más de cinco letras: «hora» no busca «hor».
    """
    resultado = [Forma(palabra, prefijo=True)]
    bases = [palabra, *singulares(palabra)]
    resultado.extend(Forma(s, prefijo=False) for s in bases[1:])
    for base in bases:
        if len(base) > 3 and base[-1] in _GENERO:
            resultado.append(Forma(base[:-1] + _GENERO[base[-1]], prefijo=True))
        if len(base) > 5 and base.endswith("ora"):
            resultado.append(Forma(base[:-1], prefijo=True))
    return _sin_repetir(resultado)


# ── Sinónimos ────────────────────────────────────────────────────────────────
#
# Grupos de palabras que en una compra pública piden lo mismo, en singular,
# normalizadas. Cada una encuentra a todas las de su grupo. Sólo palabras sin
# otro sentido en este contexto: «auto» no entra (empieza «autorización»), ni
# «taller», ni «vestuario» (también es el camarín).
_GRUPOS: tuple[tuple[str, ...], ...] = (
    ("computador", "computadora", "notebook", "laptop"),
    ("impresora", "multifuncional"),
    ("lapiz", "lapicera", "lapicero", "boligrafo"),
    ("celular", "smartphone"),
    ("tablet", "tableta"),
    ("vehiculo", "automovil"),
    ("medicamento", "farmaco", "remedio"),
    ("aseo", "limpieza"),
    ("mantencion", "mantenimiento"),
    ("mascarilla", "tapaboca", "cubreboca"),
    ("polera", "camiseta"),
    ("arriendo", "arrendamiento", "alquiler"),
    ("asesoria", "consultoria"),
    ("vigilancia", "guardia"),
    ("desinfectante", "sanitizante"),
    ("luminaria", "lampara"),
    ("ampolleta", "bombilla"),
    ("bencina", "gasolina"),
    ("petroleo", "diesel"),
)

#: Una palabra que lleva a otras sin que ellas lleven de vuelta. Lo que alguien
#: escribe y casi nunca aparece en el texto de una compra: el inglés, la sigla,
#: la marca que en Chile nombra al producto. «pc» lleva a «computador» pero no
#: se busca nunca como prefijo: encontraría «PCR».
_HACIA: dict[str, tuple[str, ...]] = {
    "pc": ("computador",),
    "computer": ("computador",),
    "printer": ("impresora",),
    "chair": ("silla",),
    "desk": ("escritorio",),
    "cleaning": ("limpieza",),
    "confort": ("higienico",),
    "bencina": ("combustible",),
    "gasolina": ("combustible",),
    "petroleo": ("combustible",),
    "diesel": ("combustible",),
}


def _construir() -> dict[str, tuple[str, ...]]:
    sinonimos: dict[str, list[str]] = {}
    for grupo in _GRUPOS:
        for palabra in grupo:
            sinonimos.setdefault(palabra, []).extend(p for p in grupo if p != palabra)
    grupos = {p: list(otras) for p, otras in sinonimos.items()}
    for palabra, destinos in _HACIA.items():
        # Con el grupo del destino: «pc» lleva a «computador» y a «notebook».
        for destino in destinos:
            sinonimos.setdefault(palabra, []).extend([destino, *grupos.get(destino, [])])
    return {p: tuple(dict.fromkeys(otras)) for p, otras in sinonimos.items()}


#: Palabra → las otras que también responden a ella.
SINONIMOS: dict[str, tuple[str, ...]] = _construir()

#: Las que sólo llevan a otras: tienen sinónimos pero no se buscan ellas mismas,
#: porque son cortas o no aparecen en el texto de las compras.
SOLO_CLAVE = frozenset({"pc"})


def plural_en_ces(palabra: str) -> str | None:
    """«lapiz» → «lapices», «luz» → «luces». None si no termina en «z»."""
    return palabra[:-1] + "ces" if len(palabra) >= 3 and palabra.endswith("z") else None


def alternativas(palabra: str) -> list[str]:
    """La palabra y las OTRAS que también responden a ella, sin repetir.

    El primer elemento es siempre la palabra (salvo una de `SOLO_CLAVE`, que no
    se busca). Después, el plural o el singular en «-z»/«-ces», que el stemmer
    trata como otra palabra, y los sinónimos de la palabra o de su singular, con
    su propio plural en «-ces».
    """
    resultado = [] if palabra in SOLO_CLAVE else [palabra]
    bases = [palabra, *singulares(palabra)]
    for base in bases:
        plural = plural_en_ces(base)
        if plural:
            resultado.append(plural)
        if base.endswith("z") and base != palabra:
            resultado.append(base)
    for base in bases:
        for otra in SINONIMOS.get(base, ()):
            resultado.append(otra)
            plural = plural_en_ces(otra)
            if plural:
                resultado.append(plural)
    return list(dict.fromkeys(resultado))


def _sin_repetir(formas_: list[Forma]) -> list[Forma]:
    vistas: set[tuple[str, bool]] = set()
    resultado: list[Forma] = []
    for forma in formas_:
        clave = (forma.texto, forma.prefijo)
        if clave not in vistas:
            vistas.add(clave)
            resultado.append(forma)
    return resultado

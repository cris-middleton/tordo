"""Personas naturales: se enmascaran al LEER, antes de que ningún módulo agregue.

Ver §8 de `docs/PIVOTE_PUBLICO_2026-10.md`. Un proveedor con RUT bajo 50.000.000
es una persona natural, y TORDO es un sitio público: su nombre, su código y su
RUT no salen en ninguna tabla, CSV, MCP ni artefacto.

**Se hace aquí, en `data_loader`, y en ningún otro sitio.** Es el único camino
hacia los parquets consolidados, así que cada módulo —y cada columna derivada
que aún no existe, como `top_proveedor`— recibe ya los datos tapados. Enmascarar
cada salida exigiría acordarse de la próxima.

Tres decisiones:

- **Por código, no por fila.** Un código es persona natural si CUALQUIERA de sus
  RUT, en toda la historia de OC y LIC, está bajo 50M — **o si no tiene ningún
  RUT legible**. Medido: 62 filas de marzo de 2026 traen `RutSucursal = "NA"`, y
  varias son personas («JUAN RODRIGO HUERTA MALLEA»). Tapar alguna «TRANSPORTES
  RIAH SPA» sin RUT es el error barato; publicar a una persona, el caro.
- **Seudónimo, no un único «Persona natural».** Si todas colapsaran en un código,
  `competitors_by_market` las sumaría en un proveedor gigante y el HHI y las
  cuotas mentirían. Cada una recibe `PN-` + HMAC-SHA256 de su código con una
  **sal aleatoria del proceso**, que no se guarda en ninguna parte: dentro de
  una corrida es estable (los módulos cruzan bien entre sí), entre corridas
  cambia (nadie sigue a «PN-3fa2…» semana a semana) y sin la sal no se invierte.
  Contrapartida: `run_all --modulo X` suelto da seudónimos distintos de los del
  resto de tablas. El cron semanal corre todo en un proceso.
- **Todas las columnas de identidad**, no sólo nombre y código: la OC también
  trae `RutSucursal`, `CodigoSucursal`, `Sucursal` (nombre de fantasía, a veces
  el de la persona) y `EspecificacionProveedor` (texto libre).
"""

from __future__ import annotations

import functools
import hashlib
import hmac
import re
import secrets
import unicodedata
from pathlib import Path
from typing import Any

import polars as pl

#: Bajo este número, el RUT es de una persona natural (§8.1, verificado sobre
#: las OC de marzo de 2026: 0,14 % de falsos positivos por nombre).
UMBRAL_RUT_PERSONA_JURIDICA = 50_000_000

NOMBRE_ENMASCARADO = "Persona natural"

COLUMNA_CODIGO = "CodigoProveedor"
#: El RUT del proveedor: `RutSucursal` en las OC masivas, `RutProveedor` en LIC.
COLUMNAS_RUT = ("RutSucursal", "RutProveedor")
#: Se sustituyen por `NOMBRE_ENMASCARADO`.
COLUMNAS_NOMBRE = ("NombreProveedor", "Sucursal")
#: Se vacían: identifican por sí solas y ningún módulo las necesita con valor.
COLUMNAS_A_VACIAR = ("RutSucursal", "RutProveedor", "CodigoSucursal", "EspecificacionProveedor")

COLUMNAS_IDENTIDAD = frozenset(
    {COLUMNA_CODIGO, *COLUMNAS_RUT, *COLUMNAS_NOMBRE, *COLUMNAS_A_VACIAR}
)

#: Texto libre que escribe el COMPRADOR y que llega a una salida: la
#: `descripcion` y la `firma_producto` de las bandas L0/L0N salen de
#: `EspecificacionComprador`, y `window_classified` publica el `Nombre` de la
#: licitación. Un «honorarios Juan Pérez» publicaría al proveedor, así que en
#: las filas de una persona natural se borra SU nombre, palabra a palabra.
#: Límite conocido: una mención en una fila que no es suya no se detecta.
COLUMNAS_TEXTO_LIBRE = (
    "Nombre",
    "Descripcion",
    "Descripcion/Obervaciones",
    "EspecificacionComprador",
)

#: Leer cualquiera de éstas obliga a pasar por `enmascarar`.
COLUMNAS_SENSIBLES = COLUMNAS_IDENTIDAD | frozenset(COLUMNAS_TEXTO_LIBRE)

#: Palabras de un nombre que no se borran: demasiado cortas para identificar y
#: demasiado comunes para no romper el texto («DE», «LA», «Y»).
LARGO_MINIMO_PALABRA = 3

_VARIANTES = {
    "a": "aáàä",
    "e": "eéèë",
    "i": "iíìï",
    "o": "oóòö",
    "u": "uúùü",
    "n": "nñ",
}

_VACIOS = ("", "NA", "null")

#: Sal del proceso. Nunca se escribe: es lo que hace irreversible el seudónimo.
_SAL = secrets.token_bytes(32)


def rut_numero(texto: str | None) -> int | None:
    """«12.708.987-6» → 12708987; `None` si no es legible. La versión escalar de
    `numero_rut`, para quien no trabaja con frames (el loader del catálogo)."""
    if texto is None:
        return None
    cuerpo = re.sub(r"[.\s]", "", str(texto)).split("-")[0]
    return int(cuerpo) if cuerpo.isdigit() else None


def es_persona_natural(rut: int | None) -> bool:
    """LA regla, en un solo sitio: bajo el umbral, o sin RUT legible."""
    return rut is None or rut < UMBRAL_RUT_PERSONA_JURIDICA


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


@functools.lru_cache(maxsize=65536)
def _patron_nombre(nombre: str) -> re.Pattern | None:
    palabras = {
        p
        for p in re.findall(r"\w+", _sin_tildes(nombre).lower())
        if len(p) >= LARGO_MINIMO_PALABRA and not p.isdigit()
    }
    if not palabras:
        return None
    alternativas = [
        "".join(f"[{_VARIANTES[c]}]" if c in _VARIANTES else re.escape(c) for c in p)
        for p in sorted(palabras, key=len, reverse=True)
    ]
    return re.compile(r"\b(?:" + "|".join(alternativas) + r")\b", re.IGNORECASE)


def borrar_nombre(texto: str | None, nombre: str | None) -> str | None:
    """Quita de `texto` cada palabra de `nombre`, sin mirar tildes ni mayúsculas."""
    if not texto or not nombre:
        return texto
    patron = _patron_nombre(nombre)
    if patron is None:
        return texto
    return re.sub(r"\s{2,}", " ", patron.sub("", texto)).strip()


def numero_rut(columna: str) -> pl.Expr:
    """«12.708.987-6» → 12708987. Nulo si no es legible («NA», vacío, basura)."""
    return (
        pl.col(columna)
        .cast(pl.Utf8)
        .str.replace_all(r"[.\s]", "")
        .str.split("-")
        .list.first()
        .cast(pl.Int64, strict=False)
    )


def _codigo_limpio() -> pl.Expr:
    codigo = pl.col(COLUMNA_CODIGO).cast(pl.Utf8).str.strip_chars()
    return pl.when(codigo.is_in(_VACIOS)).then(None).otherwise(codigo)


def seudonimo(codigo: str, sal: bytes = _SAL) -> str:
    return "PN-" + hmac.new(sal, codigo.encode(), hashlib.sha256).hexdigest()[:12]


def clasificar(pares: pl.DataFrame) -> frozenset[str]:
    """Códigos de persona natural, dado un frame `(CodigoProveedor, rut)`.

    `rut` es ya el número (ver `numero_rut`). Persona natural si algún RUT está
    bajo el umbral o si ninguno es legible.
    """
    por_codigo = (
        pares.filter(pl.col(COLUMNA_CODIGO).is_not_null())
        .group_by(COLUMNA_CODIGO)
        .agg(
            (pl.col("rut") < UMBRAL_RUT_PERSONA_JURIDICA).any().alias("bajo_umbral"),
            pl.col("rut").is_not_null().any().alias("alguno_legible"),
        )
        .filter(pl.col("bajo_umbral") | ~pl.col("alguno_legible"))
    )
    return frozenset(por_codigo[COLUMNA_CODIGO].to_list())


def _pares(parquet: Path) -> pl.DataFrame | None:
    esquema = pl.read_parquet_schema(parquet)
    columna_rut = next((c for c in COLUMNAS_RUT if c in esquema), None)
    if COLUMNA_CODIGO not in esquema:
        return None
    columnas = [COLUMNA_CODIGO] + ([columna_rut] if columna_rut else [])
    df = pl.read_parquet(parquet, columns=columnas)
    rut = numero_rut(columna_rut) if columna_rut else pl.lit(None, dtype=pl.Int64)
    return df.select(_codigo_limpio().alias(COLUMNA_CODIGO), rut.alias("rut")).unique()


@functools.cache
def codigos_persona_natural(*directorios: Path) -> frozenset[str]:
    """Clasifica con TODA la historia de esos directorios. Una vez por proceso."""
    pares = [
        p for d in directorios for f in sorted(d.glob("*.parquet")) if (p := _pares(f)) is not None
    ]
    if not pares:
        return frozenset()
    return clasificar(pl.concat(pares).unique())


def columnas_para_enmascarar(pedidas: list[str], esquema) -> list[str]:
    """Las columnas a leer: las pedidas más lo necesario para decidir."""
    if not COLUMNAS_SENSIBLES & set(pedidas):
        return list(pedidas)
    extra = [c for c in (COLUMNA_CODIGO, *COLUMNAS_RUT, "NombreProveedor") if c in esquema]
    return list(dict.fromkeys([*pedidas, *extra]))


def enmascarar(frame, codigos: frozenset[str], sal: bytes = _SAL):
    """Tapa a las personas naturales. Acepta DataFrame o LazyFrame.

    Una fila es de persona natural si su código está en `codigos`, si su RUT
    está bajo el umbral o si no tiene código (sin código no hay a quién mostrar).
    """
    columnas = frame.columns
    if not COLUMNAS_SENSIBLES & set(columnas):
        return frame

    condiciones = []
    if COLUMNA_CODIGO in columnas:
        condiciones += [_codigo_limpio().is_in(list(codigos)), _codigo_limpio().is_null()]
    for columna in COLUMNAS_RUT:
        if columna in columnas:
            condiciones.append(numero_rut(columna) < UMBRAL_RUT_PERSONA_JURIDICA)
    if not condiciones:
        # Identidad sin código ni RUT con que decidir: se tapa entera.
        es_persona = pl.lit(True)
    else:
        es_persona = pl.any_horizontal(condiciones).fill_null(False)

    # El texto libre primero: necesita el nombre ANTES de taparlo.
    if "NombreProveedor" in columnas:
        frame = frame.with_columns(
            [
                pl.when(es_persona)
                .then(
                    pl.struct(
                        [pl.col(c).alias("texto"), pl.col("NombreProveedor").alias("nombre")]
                    ).map_elements(
                        lambda f: borrar_nombre(f["texto"], f["nombre"]), return_dtype=pl.Utf8
                    )
                )
                .otherwise(pl.col(c))
                .alias(c)
                for c in COLUMNAS_TEXTO_LIBRE
                if c in columnas
            ]
        )

    reemplazos = []
    if COLUMNA_CODIGO in columnas:
        mapa = {c: seudonimo(c, sal) for c in codigos}
        reemplazos.append(
            pl.when(es_persona)
            .then(_codigo_limpio().replace(mapa, default=None))
            .otherwise(pl.col(COLUMNA_CODIGO))
            .alias(COLUMNA_CODIGO)
        )
    for columna in COLUMNAS_NOMBRE:
        if columna in columnas:
            reemplazos.append(
                pl.when(es_persona)
                .then(pl.lit(NOMBRE_ENMASCARADO))
                .otherwise(pl.col(columna))
                .alias(columna)
            )
    for columna in COLUMNAS_A_VACIAR:
        if columna in columnas:
            reemplazos.append(
                pl.when(es_persona).then(None).otherwise(pl.col(columna)).alias(columna)
            )
    return frame.with_columns(reemplazos)


# ── Payloads de la API ───────────────────────────────────────────────────────
#
# Lo que entra por la API de Mercado Público (listado, detalle, Compra Ágil) se
# guarda en JSON —`datos_completos`, `items`, `participantes`,
# `informacion_adicional`— y parte se sirve tal cual en el catálogo. Se limpia
# UNA vez, al entrar: todo lo que se guarda o se deriva después (el historial de
# cambios, `proveedor_adjudicado`) sale ya limpio.
#
# La forma de esos payloads no está verificada contra producción (ver
# `etl/utils/adjudicacion.py`), así que no se busca una ruta concreta: se recorre
# el JSON entero y se reconoce un bloque de proveedor por el NOMBRE de sus
# claves, o por estar dentro de uno de estos contextos.

#: Dentro de una clave que contenga alguna de éstas, `Rut`, `Nombre` o
#: `RazonSocial` a secas son de un proveedor u oferente.
_CONTEXTOS_PROVEEDOR = ("participante", "oferente", "proveedor", "adjudicacion", "cotizacion")
#: Fuera de contexto, la clave misma tiene que decir de quién es.
_CALIFICADORES = ("proveedor", "oferente", "participante", "sucursal")
#: Nunca: el lado del comprador es un organismo público y se publica.
_DEL_COMPRADOR = ("comprador", "organismo", "unidad", "usuario", "responsable")


def _clave_norm(clave: Any) -> str:
    return _sin_tildes(str(clave)).lower().replace("_", "")


#: Claves que NOMBRAN a la parte: con un texto como valor, ese texto es su
#: nombre («proveedor_seleccionado»: «JUAN PÉREZ»).
_CLAVES_PARTE = frozenset(
    {"proveedor", "oferente", "participante", "proveedorseleccionado", "proveedoradjudicado"}
)


def _tipo_de_clave(clave: Any, en_contexto: bool, valor: Any = None) -> str | None:
    """'rut', 'nombre', 'codigo' si la clave identifica a un proveedor; si no, None."""
    n = _clave_norm(clave)
    if any(c in n for c in _DEL_COMPRADOR):
        return None
    if n in _CLAVES_PARTE and isinstance(valor, str):
        return "nombre"
    calificada = any(c in n for c in _CALIFICADORES)
    if n.startswith("rut") and (calificada or en_contexto):
        return "rut"
    if ("nombre" in n or "razonsocial" in n) and (calificada or en_contexto):
        return "nombre"
    if n.startswith("codigo") and calificada:
        return "codigo"
    return None


def enmascarar_payload(dato: Any, *, en_contexto: bool = False) -> Any:
    """Copia de `dato` con las personas naturales tapadas, a cualquier profundidad.

    En cada diccionario con claves de identidad de proveedor se decide con
    `es_persona_natural` sobre el RUT de ESE diccionario (sin RUT legible,
    persona natural): el nombre pasa a «Persona natural» y RUT y código a nulo.
    Una empresa queda intacta.

    `en_contexto=True` cuando `dato` YA es un bloque de proveedores sin la clave
    que lo dice —la columna `participantes`, que es la lista de oferentes a
    secas—: así `Rut` y `Nombre` genéricos se reconocen igual.
    """
    if isinstance(dato, list):
        return [enmascarar_payload(v, en_contexto=en_contexto) for v in dato]
    if not isinstance(dato, dict):
        return dato

    tipos = {k: _tipo_de_clave(k, en_contexto, v) for k, v in dato.items()}
    ruts = [dato[k] for k, t in tipos.items() if t == "rut"]
    tiene_identidad = any(t is not None and dato[k] not in (None, "") for k, t in tipos.items())
    persona = tiene_identidad and es_persona_natural(
        next((n for n in map(rut_numero, ruts) if n is not None), None)
    )

    salida = {}
    for clave, valor in dato.items():
        tipo = tipos[clave]
        if persona and tipo == "nombre" and valor not in (None, ""):
            salida[clave] = NOMBRE_ENMASCARADO
        elif persona and tipo in ("rut", "codigo"):
            salida[clave] = None
        else:
            contexto = en_contexto or any(c in _clave_norm(clave) for c in _CONTEXTOS_PROVEEDOR)
            salida[clave] = enmascarar_payload(valor, en_contexto=contexto)
    return salida

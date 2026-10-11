"""Trinquete sobre las convenciones del modelo de datos.

CLAUDE.md dice desde hace tiempo que **toda tabla y columna nueva lleva
`comment=`**. Estaba escrito y nadie lo comprobaba: hoy hay comentario en 2 de 26
tablas y en 9 de 311 columnas. Una regla que no se verifica no es una regla.

Por qué un trinquete y no una prohibición
-----------------------------------------
Un test que exija comentarios en todo fallaría con 302 violaciones. Eso no se
arregla en un PR, así que lo que pasaría es que alguien lo marcaría como
`xfail` y la regla volvería a no existir.

En vez de eso se guarda la deuda actual en `convenciones_baseline.json` y el test
falla si aparece deuda **nueva**. También falla si la línea base tiene entradas
que ya se arreglaron: así el archivo sólo puede encoger, y no se queda mintiendo
sobre el estado real.

Se comprueba contra `Base.metadata`, no contra la base: no hace falta Postgres,
corre en cualquier entorno, y los modelos son la fuente de la que salen los
comentarios (`Column(..., comment=...)`).

Cómo se regenera
----------------
Cuando arregles deuda —o cuando el fallo diga que la línea base está desfasada—:

    cd backend && uv run --project .. python tests/regenerar_baseline.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import BigInteger, Integer

import app.models  # noqa: F401  # puebla Base.metadata
from app.db import Base

BASELINE = Path(__file__).parent / "convenciones_baseline.json"
REGENERAR = "cd backend && uv run --project .. python tests/regenerar_baseline.py"


def _baseline() -> dict[str, set[str]]:
    datos = json.loads(BASELINE.read_text())
    return {clave: set(valores) for clave, valores in datos.items()}


def _tablas_sin_comentario() -> set[str]:
    return {n for n, t in Base.metadata.tables.items() if not (t.comment or "").strip()}


def _columnas_sin_comentario() -> set[str]:
    return {
        f"{n}.{c.name}"
        for n, t in Base.metadata.tables.items()
        for c in t.columns
        if not (c.comment or "").strip()
    }


def _pk_entera() -> set[str]:
    """Tablas cuya clave primaria es `integer` a secas.

    La convención es UUID para entidades de negocio y BigInteger para las de
    ingesta, que crecen sin techo. `integer` se queda corto en las segundas y no
    da la opacidad que se quiere en las primeras.
    """
    fuera = set()
    for nombre, tabla in Base.metadata.tables.items():
        columnas = list(tabla.primary_key.columns)
        if len(columnas) != 1:
            continue
        tipo = columnas[0].type
        if isinstance(tipo, Integer) and not isinstance(tipo, BigInteger):
            fuera.add(nombre)
    return fuera


CASOS = [
    ("tablas_sin_comentario", _tablas_sin_comentario, "tabla sin `comment=`"),
    ("columnas_sin_comentario", _columnas_sin_comentario, "columna sin `comment=`"),
    ("pk_entera", _pk_entera, "clave primaria `integer` (usa UUID o BigInteger)"),
]


@pytest.mark.parametrize("clave,detectar,que_es", CASOS, ids=[c[0] for c in CASOS])
def test_no_hay_deuda_nueva(clave, detectar, que_es):
    actual = detectar()
    nuevas = actual - _baseline()[clave]
    assert not nuevas, (
        f"{len(nuevas)} {que_es} que no estaban antes:\n  "
        + "\n  ".join(sorted(nuevas))
        + "\n\nAñade el comentario (o el tipo correcto) — no amplíes la línea base."
    )


@pytest.mark.parametrize("clave,detectar,que_es", CASOS, ids=[c[0] for c in CASOS])
def test_la_linea_base_no_miente(clave, detectar, que_es):
    """Si algo de la línea base ya está arreglado, hay que sacarlo.

    Sin esto el archivo se queda con entradas muertas y deja de reflejar la deuda
    real, que es justo lo que hace inútil a un trinquete.
    """
    resueltas = _baseline()[clave] - detectar()
    assert not resueltas, (
        f"{len(resueltas)} entradas de la línea base ya están resueltas ({que_es}):\n  "
        + "\n  ".join(sorted(resueltas))
        + f"\n\nRegenera la línea base:\n  {REGENERAR}"
    )


def test_la_linea_base_solo_puede_encoger():
    """Guarda de la guarda: fija los totales de hoy.

    Si alguien regenera la línea base para tapar deuda nueva en vez de
    arreglarla, estos números suben y el test lo dice. Bajarlos al arreglar cosas
    es parte del trabajo.
    """
    # Antes 24 / 302 / 16. El pivote público retiró las cuentas y con sus tablas
    # se fueron 123 columnas sin comentario y 4 PK enteras; los topes bajan a lo
    # que queda para que no vuelva a crecer hasta ahí.
    topes = {"tablas_sin_comentario": 0, "columnas_sin_comentario": 172, "pk_entera": 12}
    base = _baseline()
    excedidos = {
        clave: (len(base[clave]), tope) for clave, tope in topes.items() if len(base[clave]) > tope
    }
    assert not excedidos, (
        f"La línea base creció: {excedidos} (actual, tope). "
        "Se regeneró para tapar deuda nueva en vez de arreglarla. "
        "Si de verdad hacía falta, baja el tope en este test con una explicación."
    )

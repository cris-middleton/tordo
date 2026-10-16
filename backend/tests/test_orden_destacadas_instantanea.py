"""El criterio de orden de «Lo mejor de hoy» (rediseño §8.1.4 y §8.1.6).

`tiempo` depende del reloj, así que la medición fija uno: el de la instantánea.
Se cargan sus candidatas y la historia de sus unidades en la base de pruebas
(dentro de la transacción del test, que se revierte), se corre la consulta REAL
de `repositories/compra_agil.py` y se cuenta, entre las 50 primeras:

- el mayor grupo de empate (objetivo: ≤ 5), y
- cuántos puntajes distintos hay (objetivo: ≥ 30),

redondeando a 4 decimales, como la API.

Con el tope de Compra Ágil en el neutro (2026-10-16) la medición no cambia: 2 y
49 con historia, 2 y 49 sin ella (1 y 50 antes). La instantánea es el top 50 del
orden VIEJO y casi no trae el tope (dos de 50, ninguna entre las 10 primeras), así
que no reproduce las cinco primeras a $7,2 millones que se vieron en producción:
dice que la regla no rompe el criterio, no cuánto cambia el orden de hoy.

La instantánea por defecto es la respuesta de producción del 2026-10-14, antes
del cambio (26 empatadas en 0,5; 8 puntajes distintos). Sus RUT son sintéticos
y `percentil_ordenes` se calculó contra las OC locales 2025-10..2026-03 (ver su
`_origen`). `INSTANTANEA_DESTACADAS=/ruta.json` mide otra con la misma forma sin
tocar el código.

Límites de la medición (no es una prueba para producción): `historia_rut` es la
historia por ORGANISMO con RUT sintéticos de una sola clave (aproxima la de cada
unidad), y la instantánea es el top 50 VIEJO, una selección ya moldeada por el
puntaje anterior. «2 y 49» dice que el criterio se cumple en esta muestra.

**Nunca se mide contra producción**: la API es de 512 MB y un barrido de
consultas a este endpoint la tumbó el 2026-10-14.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from app.models.licitacion import Licitacion
from app.repositories import compra_agil as repo

RUTA_POR_DEFECTO = Path(__file__).parent / "fixtures" / "destacadas_2026-10-14.json"
#: Aísla las candidatas de cualquier otro dato de la base de pruebas.
MARCA = "zzinstantanea"
PREFIJO = "SNAP-"
TOP = 50
MAYOR_EMPATE_MAXIMO = 5
DISTINTOS_MINIMOS = 30
CAMPOS = (
    "rut",
    "ordenes",
    "proveedores_distintos",
    "cuota_lider_pct",
    "monto_p25",
    "monto_mediana",
    "monto_p75",
    "percentil_ordenes",
)


def metricas(puntajes: list[float]) -> tuple[int, int]:
    """(mayor grupo de empate, puntajes distintos), a 4 decimales como la API."""
    if not puntajes:
        return 0, 0
    conteo = Counter(round(p, 4) for p in puntajes)
    return max(conteo.values()), len(conteo)


def _instantanea() -> dict:
    ruta = Path(os.getenv("INSTANTANEA_DESTACADAS", str(RUTA_POR_DEFECTO)))
    return json.loads(ruta.read_text(encoding="utf-8"))


def _fecha(valor: str) -> datetime:
    return datetime.fromisoformat(valor.replace("Z", "+00:00"))


def _dia(valor: str | None) -> date | None:
    return date.fromisoformat(valor) if valor else None


async def _tabla_unidad(db, filas: list[dict], desde: date | None, hasta: date | None) -> None:
    await db.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.compra_agil_unidad"))
    await db.execute(
        text(
            "CREATE TABLE analytics.compra_agil_unidad (rut TEXT, ordenes BIGINT, "
            "proveedores_distintos BIGINT, cuota_lider_pct DOUBLE PRECISION, "
            "monto_p25 DOUBLE PRECISION, monto_mediana DOUBLE PRECISION, "
            "monto_p75 DOUBLE PRECISION, percentil_ordenes DOUBLE PRECISION, "
            "ventana_desde DATE, ventana_hasta DATE)"
        )
    )
    for fila in filas:
        await db.execute(
            text(
                "INSERT INTO analytics.compra_agil_unidad VALUES (:rut, :ordenes, "
                ":proveedores_distintos, :cuota_lider_pct, :monto_p25, :monto_mediana, "
                ":monto_p75, :percentil_ordenes, :vd, :vh)"
            ),
            {**{c: fila.get(c) for c in CAMPOS}, "vd": desde, "vh": hasta},
        )


def _candidata(c: dict) -> Licitacion:
    return Licitacion(
        codigo_externo=f"{PREFIJO}{c['codigo_externo']}",
        nombre=f"{c['nombre']} {MARCA}",
        nombre_organismo=c["nombre_organismo"],
        rut_organismo=c["rut_organismo"],
        region=c["region"],
        tipo_convocatoria="compra_agil",
        estado="Publicada",
        monto_estimado=c["monto_estimado"],
        fecha_publicacion=_fecha(c["fecha_publicacion"]),
        fecha_cierre=_fecha(c["fecha_cierre"]),
        activo=True,
        informacion_adicional={"total_ofertas_recibidas": c["ofertas_recibidas"]},
    )


async def _medir(db, datos: dict) -> list[dict]:
    db.add_all([_candidata(c) for c in datos["candidatas"]])
    await db.flush()
    await _tabla_unidad(
        db,
        datos["historia_rut"],
        _dia(datos.get("ventana_desde")),
        _dia(datos.get("ventana_hasta")),
    )
    return await repo.destacadas(db, limite=TOP, terminos=[MARCA], ahora=_fecha(datos["reloj"]))


def test_antes_del_cambio_no_ordenaba():
    """Lo que motivó §8.1: la respuesta de producción del 2026-10-14."""
    if os.getenv("INSTANTANEA_DESTACADAS"):
        pytest.skip("otra instantánea: el «antes» sólo está fijado para la del 2026-10-14")
    anteriores = [c["puntaje_anterior"] for c in _instantanea()["candidatas"]]
    assert metricas(anteriores[:TOP]) == (26, 8)


@pytest.mark.asyncio
async def test_el_orden_nuevo_cumple_el_criterio(async_db):
    datos = _instantanea()
    filas = await _medir(async_db, datos)
    assert len(filas) == min(TOP, len(datos["candidatas"])), (
        "la marca o el reloj dejaron candidatas fuera: la medición no valdría"
    )
    mayor, distintos = metricas([f["puntaje"] for f in filas])
    print(f"\nmedición: mayor empate {mayor}, puntajes distintos {distintos} de {len(filas)}")
    assert mayor <= MAYOR_EMPATE_MAXIMO
    assert distintos >= DISTINTOS_MINIMOS


@pytest.mark.asyncio
async def test_el_criterio_vale_sin_la_competencia(async_db):
    """La competencia NO pesa (compuerta G1 del plan 0a: el conteo de cotizaciones
    puede estar congelado, rediseño §8.1.2): el monto, la historia y el tiempo
    bastan por sí solos. Es el puntaje de producción, sin monkeypatch."""
    assert "competencia" not in repo.EN_EL_PUNTAJE
    filas = await _medir(async_db, _instantanea())
    mayor, distintos = metricas([f["puntaje"] for f in filas])
    print(f"\nmedición sin competencia: mayor empate {mayor}, puntajes distintos {distintos}")
    assert mayor <= MAYOR_EMPATE_MAXIMO
    assert distintos >= DISTINTOS_MINIMOS


@pytest.mark.asyncio
async def test_sin_el_monto_no_alcanza(async_db, monkeypatch):
    """Por qué el monto es un factor (compuerta G2): sin él, seis Compras Ágiles
    del mismo comprador, mismo cierre y sin cotizaciones empatan (6 y 37)."""
    if os.getenv("INSTANTANEA_DESTACADAS"):
        pytest.skip("otra instantánea: el «sin monto» sólo está fijado para la del 2026-10-14")
    monkeypatch.setattr(repo, "EN_EL_PUNTAJE", tuple(f for f in repo.FACTORES if f != "monto"))
    filas = await _medir(async_db, _instantanea())
    assert metricas([f["puntaje"] for f in filas]) == (6, 37)


async def _medir_sin_historia(db, datos: dict) -> list[dict]:
    """Como `_medir`, con la tabla de unidades vacía: `historia_disponible` falso."""
    db.add_all([_candidata(c) for c in datos["candidatas"]])
    await db.flush()
    await _tabla_unidad(db, [], None, None)
    return await repo.destacadas(db, limite=TOP, terminos=[MARCA], ahora=_fecha(datos["reloj"]))


@pytest.mark.asyncio
async def test_el_criterio_vale_sin_historia_de_unidades(async_db):
    """Producción hoy (2026-10-16): sin historia por unidad el orden es sólo
    tiempo × monto, con el tope de Compra Ágil en el neutro. 2 y 49."""
    filas = await _medir_sin_historia(async_db, _instantanea())
    mayor, distintos = metricas([f["puntaje"] for f in filas])
    print(f"\nmedición sin historia: mayor empate {mayor}, puntajes distintos {distintos}")
    assert mayor <= MAYOR_EMPATE_MAXIMO
    assert distintos >= DISTINTOS_MINIMOS


@pytest.mark.asyncio
async def test_el_tope_de_la_instantanea_vale_el_neutro(async_db):
    """La instantánea trae el tope de octubre (7.215.100) y un redondeo (7.200.000):
    los dos valen lo que «sin monto». 7.000.000 y 6.999.000, a un 3 %, no."""
    if os.getenv("INSTANTANEA_DESTACADAS"):
        pytest.skip("otra instantánea: sus montos son otros")
    filas = await _medir(async_db, _instantanea())
    tope = {f["monto_estimado"] for f in filas if f["monto_es_tope"]}
    assert tope == {7_215_100, 7_200_000}
    assert all(f["f_monto"] == repo.NEUTRO_POR_FACTOR["monto"] for f in filas if f["monto_es_tope"])


def _puntaje_paso_9(ofertas: int, publicadas: int | None, ordenes: int, horas: float) -> float:
    """La fórmula vieja, copiada para el catálogo de juguete de §8.1.6."""
    competencia = 1 / (1 + ofertas)
    comprador = min(1, ordenes / publicadas) if publicadas and publicadas >= 5 else 0.5
    return competencia * comprador * min(1, horas / 24)


@pytest.mark.asyncio
async def test_catalogo_de_juguete_la_version_vieja_empata_y_la_nueva_ordena(async_db):
    """Tres unidades distintas, cero cotizaciones, el mismo cierre a 30 h y
    `publicadas` bajo 5 (lo normal hoy): el paso 9 las empataba a todas en 0,5."""
    reloj = datetime(2031, 3, 3, 12, 0, tzinfo=UTC)
    unidades = [("900000011", 0.9), ("900000022", 0.5), ("900000033", 0.1)]
    datos = {
        "reloj": reloj.isoformat(),
        "ventana_desde": "2030-09-01",
        "ventana_hasta": "2031-02-28",
        "candidatas": [
            {
                "codigo_externo": f"JUGUETE-{i}",
                "nombre": f"Juguete {i}",
                "nombre_organismo": f"Unidad {i}",
                "rut_organismo": rut,
                "region": "Región de Valparaíso",
                "monto_estimado": 500_000,
                "fecha_publicacion": (reloj - timedelta(hours=3)).isoformat(),
                "fecha_cierre": (reloj + timedelta(hours=30)).isoformat(),
                "ofertas_recibidas": 0,
            }
            for i, (rut, _) in enumerate(unidades)
        ],
        "historia_rut": [
            {"rut": rut, "ordenes": 10, "proveedores_distintos": 3, "percentil_ordenes": p}
            for rut, p in unidades
        ],
    }
    viejos = [_puntaje_paso_9(0, 3, 10, 30) for _ in unidades]
    assert metricas(viejos) == (3, 1)

    filas = await _medir(async_db, datos)
    assert [f["codigo_externo"] for f in filas] == [
        f"{PREFIJO}JUGUETE-0",
        f"{PREFIJO}JUGUETE-1",
        f"{PREFIJO}JUGUETE-2",
    ]
    assert metricas([f["puntaje"] for f in filas]) == (1, 3)

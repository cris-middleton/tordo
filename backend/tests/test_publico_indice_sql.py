"""El índice de páginas públicas agregado en SQL da lo mismo que leyendo filas.

Hasta el 2026-10-21 `indexables.construir` leía `market_concentration` entera y
las bandas L0N enteras con cinco columnas, y agrupaba en Polars: +79–97 MiB de
RSS por construcción con los datos locales, +207–248 a tres veces esa escala.
Ahora agrega en Postgres (`_agregado(limite=None)`, que viaja por trozos) y
filtra las bandas en SQL antes de aplicar `de_mercado()`.

Aquí se compara contra el cálculo de antes, copiado tal cual en
`_indice_de_antes`:

- con tablas aleatorias en el doble en memoria —nulos, «NA», colisiones de slug,
  nombres que cambian entre filas, bandas sin columnas de compradores—, sin base;
- con el fixture del golden materializado en Postgres, que es el SQL de verdad.

Y que construir el DataFrame por columnas, y por trozos, da el mismo que por filas,
tabla a tabla del fixture.
"""

from __future__ import annotations

import os
import random
from pathlib import Path

import polars as pl
import pytest
from polars.testing import assert_frame_equal
from sqlalchemy import text

from app.repositories import _analytics_sql as sql
from app.repositories import analytics_sync as repo
from app.services.bi._base import periodo_de
from app.services.publico import indexables
from tests.analytics_en_memoria import AnalyticsEnMemoria

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
FIXTURE = Path(__file__).parent / "golden" / "fixture_analytics"

MC = "market_concentration.parquet"
L0N = "product_price_bands_L0N.parquet"
SCORES = "buyer_scores.parquet"
CBM = "competitors_by_market.parquet"


# ── El cálculo de antes, sobre las tablas leídas enteras ─────────────────────


def _indice_de_antes(tablas: dict[str, pl.DataFrame]) -> indexables.Indice:
    """`indexables.construir` antes del 2026-10-21, sin más cambio que leer de
    `tablas` en vez de `_load` (que traía las columnas pedidas, en orden de carga)."""

    def cargar(nombre, columnas=None):
        df = tablas.get(nombre)
        if df is None:
            return None
        return df.select(columnas) if columnas else df

    mercados = cargar(
        MC, ["CodigoOrganismoPublico", "OrganismoPublico", "RubroN2", "n_transacciones"]
    )
    primera = cargar(MC)
    primera = primera.head(1) if primera is not None else None
    competidores = tablas.get(CBM)
    con_competencia = (
        {str(r) for r in competidores.get_column("RubroN2").drop_nulls().unique().to_list()}
        if competidores is not None
        else set()
    )

    # _compradores
    vacio = pl.DataFrame(schema={"codigo": pl.Utf8, "nombre": pl.Utf8, "indexable": pl.Boolean})
    scores = cargar(SCORES, ["CodigoOrganismoPublico", "NombreOrganismo", "n_oc_total"])
    partes = []
    if scores is not None and not scores.is_empty():
        partes.append(
            scores.sort("n_oc_total", descending=True, nulls_last=True)
            .unique(subset="CodigoOrganismoPublico", keep="first")
            .select(
                pl.col("CodigoOrganismoPublico").cast(pl.Utf8).alias("codigo"),
                pl.col("NombreOrganismo").cast(pl.Utf8).alias("nombre"),
                (pl.col("n_oc_total").fill_null(0) >= indexables.MIN_ORDENES_COMPRADOR).alias(
                    "con_volumen"
                ),
            )
        )
    if mercados is not None and not mercados.is_empty():
        partes.append(
            mercados.unique(subset="CodigoOrganismoPublico", keep="first").select(
                pl.col("CodigoOrganismoPublico").cast(pl.Utf8).alias("codigo"),
                pl.col("OrganismoPublico").cast(pl.Utf8).alias("nombre"),
                pl.lit(None, dtype=pl.Boolean).alias("con_volumen"),
            )
        )
    if not partes:
        compradores = vacio
    else:
        con_mercado = (
            set(mercados.get_column("CodigoOrganismoPublico").cast(pl.Utf8).to_list())
            if mercados is not None
            else set()
        )
        # Un nombre en blanco del perfil cede al de sus mercados (como `_compradores`).
        nombre = pl.col("nombre").str.strip_chars()
        compradores = (
            pl.concat(partes)
            .with_columns(pl.when(nombre != "").then(nombre).alias("nombre"))
            .group_by("codigo", maintain_order=True)
            .agg(
                pl.col("nombre").drop_nulls().first(),
                pl.col("con_volumen").drop_nulls().first(),
            )
            .with_columns(
                (
                    pl.col("con_volumen").fill_null(False)
                    & pl.col("codigo").is_in(list(con_mercado))
                ).alias("indexable")
            )
            .select("codigo", "nombre", "indexable")
            .sort("codigo")
        )

    # _rubros
    if mercados is None or mercados.is_empty():
        rubros = pl.DataFrame(
            schema={"slug": pl.Utf8, "nombre": pl.Utf8, "n": pl.Int64, "indexable": pl.Boolean}
        )
    else:
        por_rubro = (
            mercados.filter(pl.col("RubroN2").is_not_null() & ~pl.col("RubroN2").is_in(["", "NA"]))
            .group_by("RubroN2")
            .agg(pl.col("n_transacciones").cast(pl.Int64).sum().alias("n"))
            .rename({"RubroN2": "nombre"})
        )
        rubros = indexables._ganador_por_slug(por_rubro, "nombre").select(
            "slug", "nombre", "n", pl.col("nombre").is_in(list(con_competencia)).alias("indexable")
        )

    # _productos
    vacio_p = pl.DataFrame(
        schema={"slug": pl.Utf8, "firma": pl.Utf8, "n": pl.Int64, "indexable": pl.Boolean}
    )
    bandas_tabla = tablas.get(L0N)
    sin_compradores = bandas_tabla is None or not set(indexables.COLUMNAS_COMPRADORES) <= set(
        bandas_tabla.columns
    )
    columnas = ["firma_producto", "n", "predictibilidad"]
    if not sin_compradores:
        columnas += list(indexables.COLUMNAS_COMPRADORES)
    bandas = cargar(L0N, columnas)
    if bandas is None or bandas.is_empty():
        productos = vacio_p
    else:
        por_firma = (
            indexables.con_de_mercado(bandas.filter(pl.col("firma_producto").is_not_null()))
            .group_by("firma_producto")
            .agg(
                pl.col("n").cast(pl.Int64).sum().alias("n"),
                (
                    (pl.col("n") >= indexables.MIN_COMPRAS_PRODUCTO)
                    & pl.col("predictibilidad").is_in(list(indexables.PREDICTIBILIDAD_INDEXABLE))
                    & pl.col("de_mercado")
                )
                .any()
                .alias("indexable"),
            )
            .rename({"firma_producto": "firma"})
        )
        productos = indexables._ganador_por_slug(por_firma, "firma").select(
            "slug", "firma", "n", "indexable"
        )

    return indexables.Indice(
        compradores=compradores, rubros=rubros, productos=productos, periodo=periodo_de(primera)
    )


def _iguales(nuevo: indexables.Indice, antes: indexables.Indice) -> None:
    assert_frame_equal(nuevo.compradores, antes.compradores)
    assert_frame_equal(nuevo.rubros, antes.rubros)
    assert_frame_equal(nuevo.productos, antes.productos)
    assert nuevo.periodo == antes.periodo


# ── Tablas aleatorias en el doble ────────────────────────────────────────────

RUBROS = ["Aseo", "Servicios Legales", "Servicios legales", "Árboles", "NA", "", None]
FIRMAS = [
    "guante latex",
    "guante látex",
    "jabon liquido",
    "jabón líquido",
    "papel resma",
    "cloro",
    "-- --",
    None,
]


def _tablas_aleatorias(semilla: int, con_compradores: bool = True) -> dict[str, pl.DataFrame]:
    rnd = random.Random(semilla)

    def quizas(valor, p=0.1):
        return None if rnd.random() < p else valor

    codigos = [str(c) for c in range(1, 15)] + [None]
    mercados = [
        {
            "CodigoOrganismoPublico": rnd.choice(codigos),
            # El nombre cambia entre filas: gana el de la primera en orden de carga.
            "OrganismoPublico": quizas(f"ORG {rnd.randint(1, 4)}"),
            "RubroN2": rnd.choice(RUBROS),
            "n_transacciones": quizas(rnd.randint(0, 60)),
            "monto_total_mercado": rnd.random() * 1e6,
            "ventana_desde": "2023-10-01",
            "ventana_hasta": "2026-09-30",
        }
        for _ in range(rnd.randint(1, 80))
    ]
    scores = [
        {
            "CodigoOrganismoPublico": str(rnd.randint(1, 20)),
            "NombreOrganismo": f"PERFIL {rnd.randint(1, 3)}",
            "n_oc_total": quizas(rnd.choice([10, 49, 50, 51, 900])),
        }
        for _ in range(rnd.randint(1, 30))
    ]
    competidores = [
        {"CodigoOrganismoPublico": "1", "RubroN2": rnd.choice(RUBROS), "CodigoProveedor": "9"}
        for _ in range(rnd.randint(1, 6))
    ]
    bandas = []
    for _ in range(rnd.randint(1, 60)):
        fila = {
            "firma_producto": rnd.choice(FIRMAS),
            "UnidadMedida": rnd.choice(["unidad", "caja", "litro"]),
            "n": quizas(rnd.choice([1, 9, 10, 11, 40])),
            "predictibilidad": quizas(rnd.choice(["alta", "media", "baja"])),
        }
        if con_compradores:
            fila["compradores"] = quizas(rnd.choice([1, 2, 3, 9]))
            fila["cuota_mayor"] = quizas(rnd.choice([0.2, 0.5, 0.51, 1.0]))
        bandas.append(fila)
    tablas = {
        MC: pl.DataFrame(mercados, infer_schema_length=None),
        SCORES: pl.DataFrame(scores, infer_schema_length=None),
        CBM: pl.DataFrame(competidores, infer_schema_length=None),
        L0N: pl.DataFrame(bandas, infer_schema_length=None),
    }
    # A veces falta alguna tabla: un despliegue antes de la primera semanal.
    for nombre in (SCORES, CBM, L0N):
        if rnd.random() < 0.1:
            del tablas[nombre]
    return tablas


@pytest.fixture
def doble(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos.instalar(monkeypatch, indexables)
    indexables.invalidar()
    yield datos
    indexables.invalidar()


@pytest.mark.parametrize("semilla", range(60))
def test_el_indice_es_el_de_antes_con_tablas_aleatorias(doble, semilla):
    tablas = _tablas_aleatorias(semilla, con_compradores=semilla % 5 != 0)
    doble.tablas.update(tablas)

    _iguales(indexables.construir(), _indice_de_antes(tablas))


def test_las_tablas_aleatorias_cubren_lo_que_importa():
    # Guarda: si el generador dejara de producir esto, las 60 semillas
    # comprobarían casos sin colisiones ni indexables.
    indices = []
    for semilla in range(60):
        tablas = _tablas_aleatorias(semilla, con_compradores=semilla % 5 != 0)
        indices.append(_indice_de_antes(tablas))
    assert any(i.productos["indexable"].any() for i in indices)
    assert any(not i.productos["indexable"].all() for i in indices if not i.productos.is_empty())
    assert any(i.compradores["indexable"].any() for i in indices)
    assert any(i.rubros["indexable"].any() for i in indices)
    assert any(i.productos.is_empty() for i in indices)


# ── Contra Postgres, con el fixture del golden materializado ─────────────────


@pytest.fixture(scope="module")
def base():
    try:
        repo.invalidar_cache_existencia()
        hay = repo.existe_tabla("market_concentration", usar_cache=False)
    except Exception as exc:  # noqa: BLE001
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__}) — usa `make dev-up-d`")
    if not hay:
        mensaje = "el esquema analytics no está materializado — ver test_bi_service_equivalencia"
        if IN_CI:
            raise AssertionError(mensaje)
        pytest.skip(mensaje)


def test_el_indice_en_postgres_es_el_de_antes(base):
    indexables.invalidar()
    tablas = {
        nombre: pl.read_parquet(FIXTURE / nombre)
        for nombre in (MC, SCORES, CBM, L0N)
        if (FIXTURE / nombre).exists()
    }
    nuevo = indexables.construir()

    # Guardas: un índice vacío compararía el vacío.
    assert nuevo.compradores["indexable"].sum() >= 10
    assert nuevo.rubros["indexable"].sum() >= 50
    assert nuevo.productos["indexable"].sum() >= 1
    _iguales(nuevo, _indice_de_antes(tablas))


def test_por_columnas_es_igual_que_por_filas(base):
    """`_resultado_a_polars` (por columnas) contra `_a_polars` (por filas), con
    cada tabla de analytics materializada: mismos tipos, mismos valores."""
    with repo._engine().connect() as conn:
        tablas = [
            fila[0]
            for fila in conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = :s ORDER BY table_name"
                ),
                {"s": sql.SCHEMA},
            )
        ]
        con_filas = 0
        for tabla in tablas:
            consulta = f"SELECT * FROM {sql.tabla_calificada(tabla)} ORDER BY ctid"
            por_filas = repo._a_polars([dict(f) for f in conn.execute(text(consulta)).mappings()])
            por_columnas = repo._resultado_a_polars(conn.execute(text(consulta)))
            try:
                assert_frame_equal(por_columnas, por_filas)
            except AssertionError as error:
                raise AssertionError(f"{tabla}: {error}") from error
            con_filas += bool(por_filas.height)
    # Guarda: el fixture materializa ~25 tablas; con menos, no se comparó casi nada.
    assert con_filas >= 15, con_filas


@pytest.mark.parametrize(
    ("tabla", "clave", "sumas", "primeros"),
    [
        ("product_price_bands_l0n", "firma_producto", ["n"], []),
        (
            "market_concentration",
            "CodigoOrganismoPublico",
            ["n_transacciones"],
            ["OrganismoPublico"],
        ),
        ("market_concentration", "RubroN2", ["n_transacciones"], []),
        ("competitors_by_market", "CodigoProveedor", ["monto_total"], ["NombreProveedor"]),
    ],
)
def test_el_agregado_sin_limite_por_trozos_es_igual_que_de_una_vez(
    base, monkeypatch, tabla, clave, sumas, primeros
):
    """Todos los grupos, y los mismos, que con un `LIMIT` que no corta nada."""
    monkeypatch.setattr(repo, "FILAS_POR_TROZO", 2)
    por_trozos = repo.agregado(tabla, clave, sumas=sumas, primeros=primeros, limite=None)
    de_una_vez = repo.agregado(tabla, clave, sumas=sumas, primeros=primeros, limite=10**9)

    assert por_trozos.height > 2, "con un solo trozo no se prueban los trozos"
    assert por_trozos.height == len(repo.distintos(tabla, clave)) + (
        1 if por_trozos[clave].null_count() else 0
    )
    assert_frame_equal(por_trozos, de_una_vez)


def test_una_suma_sql_toda_nula_cuenta_cero(base):
    """`sum()` de SQL es NULL si todas las filas del grupo lo son; Polars daba 0.
    El doble en memoria suma como Polars, así que esto sólo se ve contra Postgres."""
    tabla = "indice_publico_prueba_suma_nula"
    with repo._engine().begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {sql.tabla_calificada(tabla)}"))
        conn.execute(
            text(f"CREATE TABLE {sql.tabla_calificada(tabla)} (firma_producto TEXT, n BIGINT)")
        )
        conn.execute(
            text(
                f"INSERT INTO {sql.tabla_calificada(tabla)} VALUES "
                "('sin compras', NULL), ('sin compras', NULL), ('con compras', 3), ('con compras', NULL)"
            )
        )
    try:
        df = repo.agregado(tabla, "firma_producto", sumas=["n"], limite=None)
        assert df.sort("firma_producto")["n"].to_list() == [3.0, None]
        enteros = df.sort("firma_producto").select(indexables._entero("n"))["n"].to_list()
        assert enteros == [3, 0]
    finally:
        repo.invalidar_cache_existencia()
        with repo._engine().begin() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS {sql.tabla_calificada(tabla)}"))

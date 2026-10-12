"""La retención del catálogo, contra Postgres de verdad (`etl/retencion.py`).

Lo que se fija: qué se va y qué se queda, que el detalle se va con su
licitación (su FK no es `ON DELETE CASCADE`), y que un código purgado responde
404 en el catálogo —como uno que nunca existió—, no un 500.

**Las fechas viven en 1990**, a propósito: la purga borra TODO lo anterior a su
corte en la base a la que apunte `DATABASE_URL`, y con un «ahora» de 1990 el
corte cae antes de cualquier dato real. Con uno futuro, este test vaciaría la
base de desarrollo.
"""

from __future__ import annotations

import os
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import polars as pl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.main import app
from etl import retencion
from etl.analytics import compra_agil_mensual
from etl.loaders.database_loader_v2 import DatabaseLoaderV2

IN_CI = os.getenv("CI", "").lower() in ("1", "true")

PREFIJO = "TEST-RETENCION-"
AHORA = datetime(1990, 6, 15, 12, 0, tzinfo=UTC)


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _borrar(sesion) -> None:
    sesion.execute(
        text(
            "DELETE FROM licitaciones_detalle WHERE licitacion_id IN "
            "(SELECT id FROM licitaciones WHERE codigo_externo LIKE :p)"
        ),
        {"p": f"{PREFIJO}%"},
    )
    sesion.execute(
        text("DELETE FROM licitaciones WHERE codigo_externo LIKE :p"), {"p": f"{PREFIJO}%"}
    )
    sesion.commit()


@pytest.fixture
def loader():
    try:
        engine = create_engine(_url(), pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(text("SELECT 1 FROM licitaciones LIMIT 1"))
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos migrada ({type(exc).__name__}) — usa `make dev-up-d`")

    cargador = DatabaseLoaderV2({"DATABASE_URL": _url()})
    cargador.connect()
    _borrar(cargador.session)
    try:
        yield cargador
    finally:
        _borrar(cargador.session)
        cargador.disconnect()
        engine.dispose()


def _licitacion(
    loader,
    codigo: str,
    *,
    tipo: str = "licitacion",
    publicada_hace: timedelta,
    cierra_en: timedelta | None,
    con_detalle: bool = True,
) -> None:
    publicacion = AHORA - publicada_hace
    loader.load_licitaciones(
        [
            {
                "codigo_externo": f"{PREFIJO}{codigo}",
                "nombre": f"Licitación {codigo}",
                "fecha_publicacion": publicacion,
                "fecha_cierre": AHORA + cierra_en if cierra_en is not None else None,
                "estado": "Publicada",
                "tipo_convocatoria": tipo,
                "activo": True,
            }
        ]
    )
    if con_detalle:
        licitacion_id = loader.session.execute(
            text("SELECT id FROM licitaciones WHERE codigo_externo = :c"),
            {"c": f"{PREFIJO}{codigo}"},
        ).scalar_one()
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}{codigo}", {"Listado": [{"Estado": "Publicada"}]}
        )
    loader.session.commit()


def _quedan(loader) -> list[str]:
    filas = loader.session.execute(
        text("SELECT codigo_externo FROM licitaciones WHERE codigo_externo LIKE :p"),
        {"p": f"{PREFIJO}%"},
    ).scalars()
    return sorted(c.removeprefix(PREFIJO) for c in filas)


def _sembrar(loader) -> None:
    dia = timedelta(days=1)
    # Compra Ágil: 30 días desde la publicación, esté abierta o no, y nunca del
    # mes anterior. AHORA es el 15 de junio: mayo entero se queda.
    _licitacion(
        loader, "CA-VIEJA", tipo="compra_agil", publicada_hace=50 * dia, cierra_en=-48 * dia
    )
    _licitacion(
        loader, "CA-MES-ANTERIOR", tipo="compra_agil", publicada_hace=40 * dia, cierra_en=-38 * dia
    )
    _licitacion(
        loader, "CA-RECIENTE", tipo="compra_agil", publicada_hace=10 * dia, cierra_en=-8 * dia
    )
    # Licitaciones: 90 días desde el cierre.
    _licitacion(loader, "CERRADA-HACE-100", publicada_hace=130 * dia, cierra_en=-100 * dia)
    _licitacion(loader, "CERRADA-HACE-60", publicada_hace=90 * dia, cierra_en=-60 * dia)
    _licitacion(loader, "ABIERTA", publicada_hace=200 * dia, cierra_en=5 * dia)
    # Sin cierre cuenta desde la publicación, o no se iría nunca.
    _licitacion(loader, "SIN-CIERRE-VIEJA", publicada_hace=120 * dia, cierra_en=None)
    _licitacion(loader, "SIN-CIERRE-RECIENTE", publicada_hace=20 * dia, cierra_en=None)


def test_se_va_lo_que_ya_no_se_sirve_y_se_queda_lo_demas(loader):
    _sembrar(loader)
    purgado = retencion.purgar_catalogo(AHORA, _url())
    assert _quedan(loader) == [
        "ABIERTA",
        "CA-MES-ANTERIOR",
        "CA-RECIENTE",
        "CERRADA-HACE-60",
        "SIN-CIERRE-RECIENTE",
    ]
    assert purgado.licitaciones == 3
    # Su detalle se fue con ellas: la FK no es en cascada, y sin borrarlo antes
    # la purga entera fallaría por la restricción.
    assert purgado.detalles == 3
    huerfanos = loader.session.execute(
        text("SELECT count(*) FROM licitaciones_detalle WHERE codigo_externo LIKE :p"),
        {"p": f"{PREFIJO}%"},
    ).scalar_one()
    assert huerfanos == 5


def test_repetir_la_purga_no_borra_nada_mas(loader):
    _sembrar(loader)
    retencion.purgar_catalogo(AHORA, _url())
    assert retencion.purgar_catalogo(AHORA, _url()).licitaciones == 0


def test_un_codigo_purgado_da_404_y_no_500(loader):
    _sembrar(loader)
    vieja_id = loader.session.execute(
        text("SELECT id FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}CERRADA-HACE-100"},
    ).scalar_one()
    retencion.purgar_catalogo(AHORA, _url())

    with TestClient(app) as cliente:
        purgada = cliente.get(f"/api/v1/tenders/codigo/{PREFIJO}CERRADA-HACE-100")
        assert purgada.status_code == 404, purgada.text
        assert cliente.get(f"/api/v1/tenders/{vieja_id}").status_code == 404
        # Y la que se quedó se sigue sirviendo, con su detalle.
        viva = cliente.get(f"/api/v1/tenders/codigo/{PREFIJO}ABIERTA")
        assert viva.status_code == 200, viva.text
        assert viva.json()["detalle"] is not None


# ── El corte de Compra Ágil y `compra_agil_mensual` ──────────────────────────

CHILE = ZoneInfo("America/Santiago")


@pytest.mark.parametrize(
    "ahora,corte",
    [
        # 30 días caerían el 5 de septiembre, a mitad de mes: manda el mes anterior.
        (datetime(2026, 10, 5, 3, tzinfo=CHILE), datetime(2026, 9, 1, tzinfo=CHILE)),
        # El 1 de marzo, 30 días atrás ya es enero: ahí manda el plazo.
        (datetime(2027, 3, 1, 3, tzinfo=CHILE), datetime(2027, 1, 30, 3, tzinfo=CHILE)),
        # Enero mira a diciembre del año anterior.
        (datetime(2027, 1, 10, 3, tzinfo=CHILE), datetime(2026, 12, 1, tzinfo=CHILE)),
        # El mes es el de CHILE: el 1 de octubre a las 02:00 UTC aún es septiembre allí.
        (datetime(2026, 10, 1, 2, tzinfo=UTC), datetime(2026, 8, 1, tzinfo=CHILE)),
    ],
)
def test_el_corte_de_compra_agil_nunca_entra_en_el_mes_anterior(ahora, corte):
    assert retencion.cortes(ahora)[0] == corte


RUT_SIMULADO = "77.777.777-7"


def _compra_agil_del_dia(loader, dia: date) -> None:
    loader.load_licitaciones(
        [
            {
                "codigo_externo": f"{PREFIJO}CA-{dia.isoformat()}",
                "nombre": f"Compra Ágil {dia}",
                "fecha_publicacion": datetime(dia.year, dia.month, dia.day, 12, tzinfo=CHILE),
                "fecha_cierre": datetime(dia.year, dia.month, dia.day, 18, tzinfo=CHILE),
                "estado": "Publicada",
                "tipo_convocatoria": "compra_agil",
                "rut_organismo": RUT_SIMULADO,
                "activo": True,
            }
        ]
    )
    loader.session.commit()


def test_semanas_de_purga_no_le_quitan_dias_a_ningun_mes(loader, tmp_path):
    """Lo que hace el cron semanal, domingo a domingo, cruzando dos fronteras de mes.

    Cada semana: se ingiere lo publicado, `compra_agil_mensual` cuenta (con el
    máximo acumulado de la tabla anterior) y DESPUÉS se purga. Con 30 días móviles
    a secas, ninguna corrida veía septiembre entero y la cuenta final se quedaba
    corta en hasta una semana.
    """
    engine = create_engine(_url())
    primero, ultimo = date(1990, 8, 1), date(1990, 10, 31)
    ingerido = primero
    domingo = date(1990, 8, 5)
    try:
        while domingo <= date(1990, 12, 30):
            while ingerido <= min(domingo, ultimo):
                _compra_agil_del_dia(loader, ingerido)
                ingerido += timedelta(days=1)
            # Sólo las de este test: la base puede tener otras Compras Ágiles.
            publicadas = compra_agil_mensual.leer_publicadas(engine).filter(
                pl.col("rut") == pl.lit(RUT_SIMULADO).str.replace_all(r"[^0-9K]", "")
            )
            compra_agil_mensual.run_compra_agil_mensual(tmp_path, frames=[], publicadas=publicadas)
            retencion.purgar_catalogo(
                datetime(domingo.year, domingo.month, domingo.day, 3, tzinfo=CHILE), _url()
            )
            domingo += timedelta(days=7)
    finally:
        engine.dispose()

    tabla = pl.read_parquet(tmp_path / compra_agil_mensual.SALIDA)
    por_mes = dict(zip(tabla["mes"].to_list(), tabla["publicadas"].to_list(), strict=True))
    assert por_mes == {date(1990, 8, 1): 31, date(1990, 9, 1): 30, date(1990, 10, 1): 31}
    # Y de verdad se purgó: a fin de diciembre no queda nada de esos tres meses.
    assert _quedan(loader) == []

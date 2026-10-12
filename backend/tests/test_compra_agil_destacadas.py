"""`GET /compra-agil/destacadas`: candidatas, puntaje y lo que nunca sale.

Contra Postgres real, como `test_abiertas_primero.py`. Las tablas de analytics
se crean dentro de la transacción del test, así que se revierten con ella.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.versionado import PREFIJO_API
from app.db import get_db
from app.main import app
from app.models.licitacion import Licitacion
from app.repositories import compra_agil as repo

AHORA = datetime.now(UTC)
RUTA = f"{PREFIJO_API}/compra-agil/destacadas"
TERMINO = "zzcotizable"

RUT_PERSONA = "12.708.987-6"
NOMBRE_PERSONA = "RAUL MAURICIO HERNANDEZ"


def _ca(codigo: str, *, horas: float, ofertas=None, rut="61.608.700-2", **extra) -> Licitacion:
    campos = {
        "codigo_externo": codigo,
        "nombre": f"Compra de {TERMINO} {codigo}",
        "nombre_organismo": "HOSPITAL DE PRUEBA",
        "rut_organismo": rut,
        "region": "Región de Valparaíso",
        "tipo_convocatoria": "compra_agil",
        "estado": "Publicada",
        "monto_estimado": 1_500_000,
        "fecha_publicacion": AHORA - timedelta(hours=3),
        "fecha_cierre": AHORA + timedelta(hours=horas),
        "activo": True,
        "informacion_adicional": {
            "total_ofertas_recibidas": ofertas,
            # Lo que nunca puede salir por esta superficie.
            "proveedor": {"RutProveedor": RUT_PERSONA, "NombreProveedor": NOMBRE_PERSONA},
        },
    }
    campos.update(extra)
    return Licitacion(**campos)


async def _crear_analytics(db, *, historia: list[tuple], ruts: list[tuple]) -> None:
    await db.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.compra_agil_comprador"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.comprador_rut"))
    await db.execute(
        text(
            'CREATE TABLE analytics.compra_agil_comprador ("CodigoOrganismoPublico" TEXT, '
            "ordenes BIGINT, publicadas BIGINT, proveedores_distintos BIGINT, "
            "cuota_lider_pct DOUBLE PRECISION, monto_p25 DOUBLE PRECISION, "
            "monto_mediana DOUBLE PRECISION, monto_p75 DOUBLE PRECISION, "
            "ventana_desde DATE, ventana_hasta DATE)"
        )
    )
    await db.execute(
        text('CREATE TABLE analytics.comprador_rut (rut TEXT, "CodigoOrganismoPublico" TEXT)')
    )
    for fila in historia:
        await db.execute(
            text(
                "INSERT INTO analytics.compra_agil_comprador VALUES "
                "(:c, :o, :p, :d, :l, 400000, 850000, 1500000, :vd, :vh)"
            ),
            {
                "c": fila[0],
                "o": fila[1],
                "p": fila[2],
                "d": fila[3],
                "l": fila[4],
                "vd": date(2026, 4, 1),
                "vh": date(2026, 9, 30),
            },
        )
    for rut, codigo in ruts:
        await db.execute(
            text("INSERT INTO analytics.comprador_rut VALUES (:r, :c)"), {"r": rut, "c": codigo}
        )


async def _sin_analytics(db) -> None:
    await db.execute(text("DROP TABLE IF EXISTS analytics.compra_agil_comprador"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.comprador_rut"))


@pytest_asyncio.fixture
async def mercado(async_db):
    async_db.add_all(
        [
            # Ninguna cotización, comprador que adjudica 8 de 10, 2 días: 1 × 0,8 × 1.
            _ca("CA-BUENA", horas=48, ofertas=0),
            # Tres cotizaciones, comprador sin historia: 0,25 × 0,5 × 1.
            _ca("CA-COMPETIDA", horas=30, ofertas=3, rut="99.999.999-9"),
            # Sin dato de cotizaciones; comprador con 3 publicadas (< 5): 0,5 × 0,5 × ~0,25.
            _ca("CA-POCO-DATO", horas=6, ofertas=None, rut="69.255.600-3"),
            # Fuera: cierra en menos de 2 h.
            _ca("CA-APURADA", horas=1, ofertas=0),
            # Fuera: inactiva, cerrada, vencida, y una licitación que no es Compra Ágil.
            _ca("CA-INACTIVA", horas=48, ofertas=0, activo=False),
            _ca("CA-CERRADA", horas=48, ofertas=0, estado="Cerrada"),
            _ca("CA-VENCIDA", horas=-5, ofertas=0),
            _ca("LIC-NO-CA", horas=48, ofertas=0, tipo_convocatoria="licitacion"),
            # Otra región y otro texto.
            _ca(
                "CA-SUR",
                horas=40,
                ofertas=1,
                region="Región de Los Lagos ",
                nombre="Arriendo de bodega en Puerto Montt",
            ),
        ]
    )
    await async_db.flush()
    await _crear_analytics(
        async_db,
        historia=[("7084", 8, 10, 5, 40.0), ("115167", 2, 3, 2, 50.0)],
        ruts=[("616087002", "7084"), ("692556003", "115167")],
    )
    return async_db


@pytest_asyncio.fixture
async def cliente(async_db):
    """Cliente async sobre la app real, como `test_bi_precio_http.py`."""

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _codigos(respuesta) -> list[str]:
    return [i["codigo_externo"] for i in respuesta.json()["items"]]


@pytest.mark.asyncio
async def test_ordena_por_puntaje_y_excluye_lo_que_no_se_puede_cotizar(mercado):
    filas = await repo.destacadas(mercado, limite=50)
    codigos = [f["codigo_externo"] for f in filas]

    # 0,8 · 0,5 × 0,8 × 1 = 0,4 · 0,125 · ~0,0625
    assert codigos == ["CA-BUENA", "CA-SUR", "CA-COMPETIDA", "CA-POCO-DATO"]
    puntajes = [f["puntaje"] for f in filas]
    assert puntajes == sorted(puntajes, reverse=True)


async def test_la_respuesta_trae_puntaje_factores_e_historia(cliente, mercado):
    r = await cliente.get(RUTA)
    assert r.status_code == 200
    cuerpo = r.json()
    por_codigo = {i["codigo_externo"]: i for i in cuerpo["items"]}

    buena = por_codigo["CA-BUENA"]
    assert buena["factores"] == {"competencia": 1.0, "comprador": 0.8, "tiempo": 1.0}
    assert buena["puntaje"] == pytest.approx(0.8)
    assert buena["ofertas_recibidas"] == 0
    assert buena["comprador"]["ordenes"] == 8 and buena["comprador"]["publicadas"] == 10
    assert buena["comprador"]["monto_mediana"] == 850000.0
    assert 47 < buena["horas_restantes"] <= 48

    # Comprador sin historia: comprador nulo y factor neutro.
    competida = por_codigo["CA-COMPETIDA"]
    assert competida["comprador"] is None
    assert competida["factores"]["comprador"] == 0.5
    assert competida["factores"]["competencia"] == 0.25

    # Con menos de 5 publicadas el cociente es ruido: neutro, aunque haya historia.
    poco = por_codigo["CA-POCO-DATO"]
    assert poco["comprador"]["publicadas"] == 3
    assert poco["factores"]["comprador"] == 0.5
    assert poco["ofertas_recibidas"] is None
    assert poco["factores"]["competencia"] == 0.5
    assert poco["factores"]["tiempo"] == pytest.approx(0.25, abs=0.01)

    assert cuerpo["ventana_desde"] == "2026-04-01"
    assert cuerpo["ventana_hasta"] == "2026-09-30"
    # Hora de Chile, con su desfase.
    assert cuerpo["actualizado_en"] and cuerpo["actualizado_en"][-6:] in ("-03:00", "-04:00")


@pytest.mark.asyncio
async def test_sin_analytics_comprador_nulo_y_neutro(mercado):
    await _sin_analytics(mercado)
    filas = await repo.destacadas(mercado, limite=50)

    assert {f["codigo_externo"] for f in filas} == {
        "CA-BUENA",
        "CA-COMPETIDA",
        "CA-POCO-DATO",
        "CA-SUR",
    }
    assert all(not f["tiene_historia"] for f in filas)
    assert all(f["f_comprador"] == 0.5 for f in filas)
    assert await repo.ventana(mercado) == (None, None)


async def test_sin_analytics_por_http(cliente, mercado):
    await _sin_analytics(mercado)
    r = await cliente.get(RUTA)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ventana_desde"] is None and cuerpo["ventana_hasta"] is None
    assert len(cuerpo["items"]) == 4
    assert all(i["comprador"] is None for i in cuerpo["items"])
    assert all(i["factores"]["comprador"] == 0.5 for i in cuerpo["items"])


@pytest.mark.parametrize("limite", [0, 51, -1])
async def test_limite_fuera_de_rango_es_422(cliente, limite):
    assert (await cliente.get(RUTA, params={"limite": limite})).status_code == 422


async def test_limite_acota(cliente, mercado):
    assert len((await cliente.get(RUTA, params={"limite": 2})).json()["items"]) == 2


async def test_region_filtra_aunque_venga_con_espacios(cliente, mercado):
    r = await cliente.get(RUTA, params={"region": "Región de Los Lagos"})
    assert _codigos(r) == ["CA-SUR"]
    assert r.json()["items"][0]["region"] == "Región de Los Lagos"


async def test_search_filtra(cliente, mercado):
    assert _codigos(await cliente.get(RUTA, params={"search": "bodega montt"})) == ["CA-SUR"]


async def test_es_publica_sin_authorization(cliente, mercado):
    r = await cliente.get(RUTA)
    assert r.status_code == 200
    assert "authorization" not in {k.lower() for k in r.request.headers}


async def test_ningun_dato_de_proveedor_sale(cliente, mercado):
    texto = (await cliente.get(RUTA, params={"limite": 50})).text
    for aguja in (RUT_PERSONA, "12708987", NOMBRE_PERSONA, "HERNANDEZ", "Proveedor"):
        assert aguja not in texto


async def test_sin_compras_agiles_la_lista_va_vacia(cliente, async_db):
    r = await cliente.get(RUTA, params={"search": "zzzznoexiste"})
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_filtra_por_comprador_a_traves_del_rut(cliente, mercado):
    """La página del comprador pide las suyas. La Compra Ágil sólo trae el RUT:
    el código se alcanza por `analytics.comprador_rut`."""
    r = await cliente.get(RUTA, params={"codigo_organismo": "7084"})
    assert r.status_code == 200
    assert _codigos(r) == ["CA-BUENA", "CA-SUR"]

    r = await cliente.get(RUTA, params={"codigo_organismo": "115167"})
    assert _codigos(r) == ["CA-POCO-DATO"]

    r = await cliente.get(RUTA, params={"codigo_organismo": "999999"})
    assert r.status_code == 200 and _codigos(r) == []


async def test_filtro_por_comprador_sin_analytics_es_lista_vacia(cliente, mercado):
    """Sin la tabla de RUT no se sabe de quién es cada una: vacía, no error, y
    sobre todo no el listado entero de otros compradores."""
    await _sin_analytics(mercado)
    r = await cliente.get(RUTA, params={"codigo_organismo": "7084"})
    assert r.status_code == 200
    assert _codigos(r) == []

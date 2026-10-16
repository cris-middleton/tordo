"""`GET /compra-agil/destacadas`: candidatas, puntaje y lo que nunca sale.

Contra Postgres real, como `test_abiertas_primero.py`. Las tablas de analytics
se crean dentro de la transacción del test, así que se revierten con ella.

Desde el rediseño 0a la historia es de la UNIDAD de compra (por RUT,
`analytics.compra_agil_unidad`) y el factor comprador es su percentil de
órdenes; `analytics.comprador_rut` sólo sirve al filtro por comprador.
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
from app.repositories.licitaciones import esta_abierta

AHORA = datetime.now(UTC)
RUTA = f"{PREFIJO_API}/compra-agil/destacadas"
TERMINO = "zzcotizable"

RUT_PERSONA = "12.708.987-6"
NOMBRE_PERSONA = "RAUL MAURICIO HERNANDEZ"

#: (rut normalizado, órdenes, proveedores distintos, cuota del líder, percentil)
UNIDADES = [
    ("616087002", 8, 5, 40.0, 0.8),
    ("692556003", 2, 2, 50.0, 0.2),
    # Dos unidades de la FACh, el mismo organismo (6946) con historias distintas.
    ("61103007K", 560, 90, 3.0, 0.97),
    ("611030061", 12, 6, 25.0, 0.3),
]
RUTS = [
    ("616087002", "7084"),
    ("692556003", "115167"),
    ("61103007K", "6946"),
    ("611030061", "6946"),
]


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


def _declaradas(monto: float, veces: int = 3, prefijo: str = "CA-HIST") -> list[Licitacion]:
    """Compras Ágiles ya cerradas que declararon `monto`: la historia guardada de
    la que se lee el tope (en producción, cientos de filas con el tope del mes)."""
    return [
        _ca(f"{prefijo}-{int(monto)}-{i}", horas=-30, monto_estimado=monto, activo=False)
        for i in range(veces)
    ]


async def _crear_analytics(db) -> None:
    await db.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.compra_agil_unidad"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.comprador_rut"))
    await db.execute(
        text(
            "CREATE TABLE analytics.compra_agil_unidad (rut TEXT, ordenes BIGINT, "
            "proveedores_distintos BIGINT, cuota_lider_pct DOUBLE PRECISION, "
            "monto_p25 DOUBLE PRECISION, monto_mediana DOUBLE PRECISION, "
            "monto_p75 DOUBLE PRECISION, percentil_ordenes DOUBLE PRECISION, "
            "ventana_desde DATE, ventana_hasta DATE)"
        )
    )
    await db.execute(
        text('CREATE TABLE analytics.comprador_rut (rut TEXT, "CodigoOrganismoPublico" TEXT)')
    )
    for rut, ordenes, proveedores, lider, percentil in UNIDADES:
        await db.execute(
            text(
                "INSERT INTO analytics.compra_agil_unidad VALUES "
                "(:r, :o, :d, :l, 400000, 850000, 1500000, :p, :vd, :vh)"
            ),
            {
                "r": rut,
                "o": ordenes,
                "d": proveedores,
                "l": lider,
                "p": percentil,
                "vd": date(2026, 4, 1),
                "vh": date(2026, 9, 30),
            },
        )
    for rut, codigo in RUTS:
        await db.execute(
            text("INSERT INTO analytics.comprador_rut VALUES (:r, :c)"), {"r": rut, "c": codigo}
        )


async def _sin_analytics(db) -> None:
    await db.execute(text("DROP TABLE IF EXISTS analytics.compra_agil_unidad"))
    await db.execute(text("DROP TABLE IF EXISTS analytics.comprador_rut"))


@pytest_asyncio.fixture
async def mercado(async_db):
    async_db.add_all(
        [
            # Ninguna cotización, unidad en el percentil 0,8, 48 h: 1 × 0,8 × 48/72.
            _ca("CA-BUENA", horas=48, ofertas=0),
            # Unidad que no figura en la tabla (no compró nada en la ventana): su factor
            # comprador vale 0, no el neutro, y el puntaje también.
            _ca("CA-COMPETIDA", horas=30, ofertas=3, rut="99.999.999-9"),
            # Sin dato de cotizaciones; unidad en el percentil 0,2; 6 h: 0,5 × 0,2 × 6/72.
            _ca("CA-POCO-DATO", horas=6, ofertas=None, rut="69.255.600-3"),
            # Fuera: cierra en menos de 2 h.
            _ca("CA-APURADA", horas=1, ofertas=0),
            # Fuera: inactiva, cerrada, vencida, y una licitación que no es Compra Ágil.
            _ca("CA-INACTIVA", horas=48, ofertas=0, activo=False),
            _ca("CA-CERRADA", horas=48, ofertas=0, estado="Cerrada"),
            _ca("CA-VENCIDA", horas=-5, ofertas=0),
            _ca("LIC-NO-CA", horas=48, ofertas=0, tipo_convocatoria="licitacion"),
            # Otra región y otro texto; la misma unidad que CA-BUENA: 0,5 × 0,8 × 40/72.
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
    await _crear_analytics(async_db)
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
    filas = await repo.destacadas(mercado, limite=50, ahora=AHORA)
    codigos = [f["codigo_externo"] for f in filas]

    # La unidad de CA-COMPETIDA no figura en una tabla poblada: comprador 0, puntaje
    # 0, al final (antes valía el neutro y quedaba por encima de CA-POCO-DATO).
    assert codigos == ["CA-BUENA", "CA-SUR", "CA-POCO-DATO", "CA-COMPETIDA"]
    puntajes = [f["puntaje"] for f in filas]
    assert puntajes == sorted(puntajes, reverse=True)
    assert filas[0]["puntaje"] == pytest.approx(0.8 * 48 / 72 * 0.8397, abs=1e-3)


@pytest.mark.asyncio
async def test_la_competencia_no_entra_en_el_puntaje(mercado):
    """Compuerta G1 (plan 0a, cerrada): el conteo de cotizaciones no se
    refresca después de la primera ingesta, y casi todas las abiertas tienen
    cero. Se informa, no se pesa (rediseño
    §8.1.1)."""
    filas = {f["codigo_externo"]: f for f in await repo.destacadas(mercado, limite=50, ahora=AHORA)}
    competida = filas["CA-COMPETIDA"]
    assert competida["f_competencia"] == 0.25
    sin_competencia = 1.0
    for nombre in repo.EN_EL_PUNTAJE:
        sin_competencia *= competida[f"f_{nombre}"]
    assert competida["puntaje"] == pytest.approx(sin_competencia)
    assert "competencia" not in repo.EN_EL_PUNTAJE
    assert "competencia" in repo.FACTORES


async def test_sin_monto_el_factor_es_neutro(cliente, mercado):
    """Sin monto, o con monto 0, vale 0,75: el centro de la escala [0,5; 1). Queda
    sobre un monto real muy chico (80.000 da 0,55): no saber no es peor que saber
    que es poco."""
    mercado.add_all(
        [
            _ca("CA-SIN-MONTO", horas=48, ofertas=0, monto_estimado=None, nombre="Sin zzmonto"),
            _ca("CA-MONTO-CERO", horas=48, ofertas=0, monto_estimado=0, nombre="Cero zzmonto"),
        ]
    )
    await mercado.flush()
    items = (await cliente.get(RUTA, params={"search": "zzmonto"})).json()["items"]
    assert len(items) == 2
    assert all(i["factores"]["monto"] == 0.75 for i in items)


async def test_a_igual_todo_lo_demas_el_monto_mayor_va_primero(mercado):
    """Dos Compras Ágiles idénticas salvo el monto: la de más monto, primero. La
    grande queda bajo el tope (que fija otra Compra Ágil, fuera de la búsqueda)."""
    mercado.add_all(
        [
            _ca("CA-CHICA", horas=48, ofertas=0, monto_estimado=80_000, nombre="Igual zzigual"),
            _ca("CA-GRANDE", horas=48, ofertas=0, monto_estimado=6_500_000, nombre="Igual zzigual"),
            *_declaradas(7_215_100),
        ]
    )
    await mercado.flush()
    filas = await repo.destacadas(mercado, limite=50, terminos=["zzigual"], ahora=AHORA)
    assert [f["codigo_externo"] for f in filas] == ["CA-GRANDE", "CA-CHICA"]
    assert filas[0]["puntaje"] / filas[1]["puntaje"] == pytest.approx(1.72, abs=0.01)
    assert not any(f["monto_es_tope"] for f in filas)


async def test_el_tope_de_compra_agil_vale_lo_mismo_que_sin_monto(cliente, mercado):
    """El tope de Compra Ágil (100 UTM) lo declara cualquiera que no quiera
    calcular: no dice cuánto se va a comprar. Igual o a menos de un 2 % del tope,
    el factor vale el neutro, como sin monto. 7.000.000 queda a un 3 %: cuenta."""
    mercado.add_all(
        [
            *_declaradas(7_215_100),
            _ca("CA-TOPE", horas=48, ofertas=0, monto_estimado=7_215_100, nombre="Tope zztope"),
            _ca("CA-CASI", horas=48, ofertas=0, monto_estimado=7_200_000, nombre="Casi zztope"),
            # El tope del mes anterior (agosto: 7.164.900): sigue siendo el tope.
            _ca("CA-AGOSTO", horas=48, ofertas=0, monto_estimado=7_164_900, nombre="Ago zztope"),
            _ca("CA-SIETE", horas=48, ofertas=0, monto_estimado=7_000_000, nombre="Siete zztope"),
        ]
    )
    await mercado.flush()
    items = {
        i["codigo_externo"]: i
        for i in (await cliente.get(RUTA, params={"search": "zztope"})).json()["items"]
    }
    for codigo in ("CA-TOPE", "CA-CASI", "CA-AGOSTO"):
        assert items[codigo]["factores"]["monto"] == 0.75, codigo
        assert items[codigo]["monto_es_tope"] is True, codigo
        # El monto se sigue diciendo: lo que cambia es cuánto pesa.
        assert items[codigo]["monto_estimado"] > 7_000_000
    assert items["CA-SIETE"]["monto_es_tope"] is False
    assert items["CA-SIETE"]["factores"]["monto"] == pytest.approx(0.954, abs=1e-3)
    # Ahora la de 7.000.000 va antes que las del tope.
    assert _codigos(await cliente.get(RUTA, params={"search": "zztope"}))[0] == "CA-SIETE"


async def test_el_tope_se_lee_del_dato_no_de_una_constante(mercado):
    """La UTM cambia cada mes: el tope es el mayor monto que se repite en las
    Compras Ágiles guardadas. Con un tope de 8.000.000, 7.215.100 ya no lo es."""
    mercado.add_all(
        [
            *_declaradas(8_000_000),
            *_declaradas(7_215_100),
            _ca("CA-OCHO", horas=48, ofertas=0, monto_estimado=8_000_000, nombre="Ocho zzutm"),
            _ca("CA-SIETE", horas=48, ofertas=0, monto_estimado=7_215_100, nombre="Siete zzutm"),
        ]
    )
    await mercado.flush()
    filas = {
        f["codigo_externo"]: f
        for f in await repo.destacadas(mercado, limite=50, terminos=["zzutm"], ahora=AHORA)
    }
    assert filas["CA-OCHO"]["monto_es_tope"] is True
    assert filas["CA-OCHO"]["f_monto"] == 0.75
    assert filas["CA-SIETE"]["monto_es_tope"] is False


async def test_el_tope_se_mide_sobre_todas_las_compras_agiles(mercado):
    """Una cerrada o inactiva también declaró el tope: cuenta para leerlo. Lo que
    se filtra (la búsqueda, la región) no cambia cuál es el tope."""
    mercado.add_all(
        [
            *_declaradas(7_215_100),
            _ca(
                "CA-ABIERTA", horas=48, ofertas=0, monto_estimado=7_200_000, nombre="Abierta zzsola"
            ),
        ]
    )
    await mercado.flush()
    filas = await repo.destacadas(mercado, limite=50, terminos=["zzsola"], ahora=AHORA)
    assert [f["codigo_externo"] for f in filas] == ["CA-ABIERTA"]
    assert filas[0]["monto_es_tope"] is True


async def test_un_monto_erroneo_sobre_el_tope_no_rompe_la_deteccion(mercado):
    """Un 72.151.000 tipeado (el tope con un cero de más) aparece una vez; el tope,
    muchas. Con «el mayor monto guardado» la referencia subía a 72 millones y el
    tope dejaba de reconocerse en toda la lista, sin que nada fallara."""
    mercado.add_all(
        [
            *_declaradas(7_215_100),
            _ca("CA-ERRONEA", horas=48, ofertas=0, monto_estimado=72_151_000, nombre="Err zzerror"),
            _ca("CA-TOPE", horas=48, ofertas=0, monto_estimado=7_215_100, nombre="Tope zzerror"),
        ]
    )
    await mercado.flush()
    assert await repo.tope_compra_agil(mercado) == 7_215_100
    filas = {
        f["codigo_externo"]: f
        for f in await repo.destacadas(mercado, limite=50, terminos=["zzerror"], ahora=AHORA)
    }
    assert filas["CA-TOPE"]["monto_es_tope"] is True
    assert filas["CA-TOPE"]["f_monto"] == 0.75
    # La errónea no es el tope: sigue con su factor (el dato es suyo, el error también).
    assert filas["CA-ERRONEA"]["monto_es_tope"] is False


async def test_a_principio_de_mes_el_tope_nuevo_se_reconoce_por_el_viejo(mercado):
    """El 1 de octubre el tope nuevo (7.215.100) aún no se repite: la referencia es
    el de agosto (7.164.900), y el nuevo queda a un 0,7 % por encima. Es tope."""
    mercado.add_all(
        [
            *_declaradas(7_164_900),
            _ca("CA-NUEVO", horas=48, ofertas=0, monto_estimado=7_215_100, nombre="Nuevo zzmes"),
        ]
    )
    await mercado.flush()
    assert await repo.tope_compra_agil(mercado) == 7_164_900
    filas = await repo.destacadas(mercado, limite=50, terminos=["zzmes"], ahora=AHORA)
    assert filas[0]["monto_es_tope"] is True


async def test_un_monto_que_se_repite_menos_de_tres_veces_no_es_el_tope(mercado):
    """Dos Compras Ágiles con el mismo monto alto no bastan: el tope se repite."""
    mercado.add_all(_declaradas(7_215_100, veces=2))
    await mercado.flush()
    assert await repo.tope_compra_agil(mercado) is None
    mercado.add_all(_declaradas(7_215_100, veces=1, prefijo="CA-TERCERA"))
    await mercado.flush()
    assert await repo.tope_compra_agil(mercado) == 7_215_100


async def test_con_pocas_compras_agiles_la_mayor_no_pasa_por_tope(mercado):
    """Bajo `TOPE_MINIMO` el mayor monto no puede ser el tope (100 UTM pasaba de
    $6,6 millones ya en noviembre de 2024): en una base con pocas Compras Ágiles,
    la mayor no se toma por el tope. En el fixture la mayor es de 1.500.000."""
    filas = await repo.destacadas(mercado, limite=50, ahora=AHORA)
    assert filas and not any(f["monto_es_tope"] for f in filas)
    assert {round(f["f_monto"], 4) for f in filas} == {0.8397}


async def test_la_respuesta_trae_puntaje_factores_e_historia_de_la_unidad(cliente, mercado):
    r = await cliente.get(RUTA)
    assert r.status_code == 200
    cuerpo = r.json()
    por_codigo = {i["codigo_externo"]: i for i in cuerpo["items"]}

    buena = por_codigo["CA-BUENA"]
    assert buena["factores"]["competencia"] == 1.0
    assert buena["factores"]["comprador"] == 0.8
    assert buena["factores"]["tiempo"] == pytest.approx(48 / 72, abs=0.01)
    assert buena["factores"]["monto"] == pytest.approx(0.8397, abs=1e-4)
    assert buena["puntaje"] == pytest.approx(0.8 * 48 / 72 * 0.8397, abs=0.01)
    assert buena["ofertas_recibidas"] == 0
    assert buena["comprador"]["ordenes"] == 8
    assert buena["comprador"]["percentil_ordenes"] == 0.8
    # Nunca un cociente: las publicadas no viajan en esta superficie.
    assert buena["comprador"]["publicadas"] is None
    assert buena["comprador"]["monto_mediana"] == 850000.0
    assert 47 < buena["horas_restantes"] <= 48
    # Desde cuándo vale el conteo, en hora de Chile.
    assert buena["ofertas_al"] and buena["ofertas_al"][-6:] in ("-03:00", "-04:00")

    competida = por_codigo["CA-COMPETIDA"]
    assert competida["comprador"] is None
    assert competida["factores"]["comprador"] == 0.0
    assert competida["puntaje"] == 0.0
    assert competida["factores"]["competencia"] == 0.25

    poco = por_codigo["CA-POCO-DATO"]
    assert poco["factores"]["comprador"] == 0.2
    assert poco["ofertas_recibidas"] is None
    assert poco["factores"]["competencia"] == 0.5
    assert poco["factores"]["tiempo"] == pytest.approx(6 / 72, abs=0.01)

    assert cuerpo["historia_disponible"] is True
    assert cuerpo["ventana_desde"] == "2026-04-01"
    assert cuerpo["ventana_hasta"] == "2026-09-30"
    assert cuerpo["actualizado_en"] and cuerpo["actualizado_en"][-6:] in ("-03:00", "-04:00")


async def test_cada_unidad_trae_su_historia_no_la_del_organismo(cliente, mercado):
    """La FACh son 14 RUT bajo el código 6946 (OC 2025-10..2026-03). Unir por
    código le daba al Comando de Personal la historia de toda la FACh."""
    mercado.add_all(
        [
            _ca(
                "CA-FACH-HOSPITAL",
                horas=50,
                ofertas=0,
                rut="61.103.007-K",
                nombre="Repuestos zzfach hospital",
            ),
            _ca(
                "CA-FACH-PERSONAL",
                horas=50,
                ofertas=0,
                rut="61.103.006-1",
                nombre="Repuestos zzfach personal",
            ),
        ]
    )
    await mercado.flush()
    por_codigo = {
        i["codigo_externo"]: i
        for i in (await cliente.get(RUTA, params={"search": "zzfach"})).json()["items"]
    }
    assert por_codigo["CA-FACH-HOSPITAL"]["comprador"]["ordenes"] == 560
    assert por_codigo["CA-FACH-PERSONAL"]["comprador"]["ordenes"] == 12
    assert por_codigo["CA-FACH-PERSONAL"]["factores"]["comprador"] == 0.3
    # Y las dos siguen siendo del organismo en su ficha.
    r = await cliente.get(RUTA, params={"codigo_organismo": "6946"})
    assert set(_codigos(r)) == {"CA-FACH-HOSPITAL", "CA-FACH-PERSONAL"}


@pytest.mark.asyncio
async def test_el_reloj_fijo_manda(mercado):
    """`ahora` llega hasta `esta_abierta()` y el corte de 2 h."""
    tarde = await repo.destacadas(mercado, limite=50, ahora=AHORA + timedelta(hours=47))
    assert "CA-BUENA" not in {f["codigo_externo"] for f in tarde}  # le queda 1 h
    a_tiempo = await repo.destacadas(mercado, limite=50, ahora=AHORA)
    assert "CA-BUENA" in {f["codigo_externo"] for f in a_tiempo}
    # Sin `ahora` manda el reloj de Postgres, como en producción.
    sin_reloj = await repo.destacadas(mercado, limite=50)
    assert [f["codigo_externo"] for f in sin_reloj] == [f["codigo_externo"] for f in a_tiempo]


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
    assert cuerpo["historia_disponible"] is False
    assert cuerpo["ventana_desde"] is None and cuerpo["ventana_hasta"] is None
    assert len(cuerpo["items"]) == 4
    assert all(i["comprador"] is None for i in cuerpo["items"])
    assert all(i["factores"]["comprador"] == 0.5 for i in cuerpo["items"])


async def test_historia_no_disponible_es_distinta_de_unidad_sin_historia(cliente, mercado):
    """Entre el despliegue y la primera semanal la tabla no existe (o está vacía): no se
    sabe nada de ninguna unidad, y eso no es «esta unidad no compra». Con la tabla
    poblada, una unidad ausente SÍ no compró: factor 0. Las dos cosas tienen que
    distinguirse en la respuesta, o la tarjeta dice «sin historial» de todo el mundo."""

    async def respuesta():
        r = await cliente.get(RUTA)
        assert r.status_code == 200
        return r.json()

    poblada = await respuesta()
    assert poblada["historia_disponible"] is True
    por_codigo = {i["codigo_externo"]: i for i in poblada["items"]}
    assert por_codigo["CA-COMPETIDA"]["comprador"] is None  # la unidad no figura
    assert por_codigo["CA-COMPETIDA"]["factores"]["comprador"] == 0.0

    # Tabla vacía: existe y no tiene ninguna fila.
    await mercado.execute(text("DELETE FROM analytics.compra_agil_unidad"))
    vacia = await respuesta()
    # Tabla ausente.
    await mercado.execute(text("DROP TABLE analytics.compra_agil_unidad"))
    ausente = await respuesta()

    for cuerpo in (vacia, ausente):
        assert cuerpo["historia_disponible"] is False
        assert len(cuerpo["items"]) == 4
        # Ninguna unidad lleva historia, y TODAS valen el neutro: ni 0 ni percentil.
        assert all(i["comprador"] is None for i in cuerpo["items"])
        assert all(i["factores"]["comprador"] == 0.5 for i in cuerpo["items"])
        # El orden es sólo tiempo × monto.
        for i in cuerpo["items"]:
            assert i["puntaje"] == pytest.approx(
                0.5 * i["factores"]["tiempo"] * i["factores"]["monto"], abs=1e-3
            )
    # Y con tabla vacía o ausente el resultado es el mismo.
    assert [i["codigo_externo"] for i in vacia["items"]] == [
        i["codigo_externo"] for i in ausente["items"]
    ]


async def test_hay_historia_de_unidades(mercado):
    assert await repo.hay_historia_de_unidades(mercado) is True
    await mercado.execute(text("DELETE FROM analytics.compra_agil_unidad"))
    assert await repo.hay_historia_de_unidades(mercado) is False
    await mercado.execute(text("DROP TABLE analytics.compra_agil_unidad"))
    assert await repo.hay_historia_de_unidades(mercado) is False


async def test_sin_la_tabla_de_unidades_el_filtro_por_comprador_sigue(cliente, mercado):
    """Entre el despliegue y la primera corrida semanal, `compra_agil_unidad` no existe."""
    await mercado.execute(text("DROP TABLE IF EXISTS analytics.compra_agil_unidad"))
    r = await cliente.get(RUTA, params={"codigo_organismo": "7084"})
    assert r.status_code == 200
    assert _codigos(r) == ["CA-BUENA", "CA-SUR"]
    assert all(i["comprador"] is None for i in r.json()["items"])
    assert all(i["factores"]["comprador"] == 0.5 for i in r.json()["items"])


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
    """La ficha del comprador pide las suyas. La Compra Ágil sólo trae el RUT:
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


@pytest.mark.asyncio
async def test_la_ventana_sale_de_la_tabla_de_unidades(mercado):
    assert await repo.ventana(mercado) == (date(2026, 4, 1), date(2026, 9, 30))


async def test_un_cero_a_la_izquierda_no_parte_la_union_por_rut(cliente, mercado):
    """Ni la Compra Ágil ni la orden normalizan los ceros a la izquierda: el mismo
    RUT escrito `061.608.700-2` en una y `61.608.700-2` en la otra no se unía, y la
    unidad salía «sin historia» (y fuera del filtro por comprador) sin que fallara
    nada. La unión los quita de los DOS lados."""
    await mercado.execute(
        text("UPDATE analytics.compra_agil_unidad SET rut = '0692556003' WHERE rut = '692556003'")
    )
    await mercado.execute(
        text("UPDATE analytics.comprador_rut SET rut = '0692556003' WHERE rut = '692556003'")
    )
    mercado.add(
        _ca("CA-CERO", horas=50, ofertas=0, rut="061.608.700-2", nombre="Compra zzcero uno")
    )
    mercado.add(
        _ca("CA-CERO-OC", horas=50, ofertas=0, rut="69.255.600-3", nombre="Compra zzcero dos")
    )
    await mercado.flush()
    por_codigo = {
        i["codigo_externo"]: i
        for i in (await cliente.get(RUTA, params={"search": "zzcero"})).json()["items"]
    }
    # Compra Ágil con cero, unidad sin él.
    assert por_codigo["CA-CERO"]["comprador"]["ordenes"] == 8
    assert por_codigo["CA-CERO"]["factores"]["comprador"] == 0.8
    # Compra Ágil sin cero, unidad con él.
    assert por_codigo["CA-CERO-OC"]["comprador"]["ordenes"] == 2
    # Y el filtro por comprador también las alcanza.
    r = await cliente.get(RUTA, params={"codigo_organismo": "7084"})
    assert "CA-CERO" in _codigos(r)
    r = await cliente.get(RUTA, params={"codigo_organismo": "115167"})
    assert "CA-CERO-OC" in _codigos(r)


async def test_dos_variantes_del_mismo_rut_no_duplican_la_compra_agil(cliente, mercado):
    """El ETL es único por la cadena EXACTA: `0692556003` y `692556003` pueden estar
    las dos. Quitando los ceros, la unión daba la misma Compra Ágil dos veces."""
    for tabla, columnas, valores in (
        (
            "compra_agil_unidad",
            "(rut, ordenes, proveedores_distintos, percentil_ordenes)",
            "('0692556003', 50, 9, 0.95)",
        ),
        ("comprador_rut", '(rut, "CodigoOrganismoPublico")', "('0692556003', '999')"),
    ):
        await mercado.execute(text(f"INSERT INTO analytics.{tabla} {columnas} VALUES {valores}"))
    mercado.add(_ca("CA-DOBLE", horas=50, ofertas=0, rut="69.255.600-3", nombre="Compra zzdoble"))
    await mercado.flush()

    items = (await cliente.get(RUTA, params={"search": "zzdoble"})).json()["items"]
    assert [i["codigo_externo"] for i in items] == ["CA-DOBLE"]
    # Gana la variante con más órdenes (50), no la de 2.
    assert items[0]["comprador"]["ordenes"] == 50
    assert items[0]["factores"]["comprador"] == 0.95

    # El filtro por comprador tampoco la repite: una sola fila por RUT sin ceros.
    por_codigo = _codigos(await cliente.get(RUTA, params={"codigo_organismo": "115167"}))
    assert por_codigo.count("CA-DOBLE") == 1 and por_codigo.count("CA-POCO-DATO") == 1
    assert "CA-DOBLE" not in _codigos(await cliente.get(RUTA, params={"codigo_organismo": "999"}))


async def test_un_rut_de_puros_ceros_o_vacio_no_se_une_con_nada(cliente, mercado):
    """`^0+` deja `'0'` y `'000'` en `''`: un RUT vacío de un lado se unía con uno
    de puros ceros del otro y le prestaba su historia."""
    for rut in ("0", "000", ""):
        await mercado.execute(
            text(
                "INSERT INTO analytics.compra_agil_unidad "
                "(rut, ordenes, proveedores_distintos, percentil_ordenes) VALUES (:r, 77, 3, 0.99)"
            ),
            {"r": rut},
        )
        await mercado.execute(
            text("INSERT INTO analytics.comprador_rut VALUES (:r, '555')"), {"r": rut}
        )
    mercado.add_all(
        [
            _ca("CA-VACIO", horas=50, ofertas=0, rut="", nombre="Compra zzvacio"),
            _ca("CA-CEROS", horas=50, ofertas=0, rut="0.000.000-0", nombre="Compra zzvacio"),
            _ca("CA-SIN-RUT", horas=50, ofertas=0, rut=None, nombre="Compra zzvacio"),
        ]
    )
    await mercado.flush()

    items = (await cliente.get(RUTA, params={"search": "zzvacio"})).json()["items"]
    assert {i["codigo_externo"] for i in items} == {"CA-VACIO", "CA-CEROS", "CA-SIN-RUT"}
    assert all(i["comprador"] is None for i in items)
    # Tabla poblada y la unidad no figura: comprador 0, no el neutro.
    assert all(i["factores"]["comprador"] == 0.0 for i in items)
    assert _codigos(await cliente.get(RUTA, params={"codigo_organismo": "555"})) == []


async def test_un_reloj_sin_zona_horaria_se_rechaza(mercado):
    with pytest.raises(ValueError, match="zona horaria"):
        await repo.destacadas(mercado, limite=5, ahora=datetime(2026, 10, 14, 12, 0))
    with pytest.raises(ValueError, match="zona horaria"):
        esta_abierta(datetime(2026, 10, 14, 12, 0))


async def test_los_ceros_se_ordenan_por_tiempo_por_monto(cliente, mercado):
    """Tres Compras Ágiles de unidades ausentes de una tabla poblada: comprador 0, puntaje
    0 las tres. Empatadas, salen por tiempo × monto (no por cierre, que las pondría al
    revés), y el puntaje sigue siendo 0: la clave de desempate no lo infla."""
    mercado.add_all(
        [
            _ca(  # cierra primero y es la peor de las tres
                "CA-Z-PEOR",
                horas=10,
                ofertas=0,
                rut="91.000.001-1",
                monto_estimado=100_000,
                nombre="Compra zzcero a",
            ),
            _ca(  # cierra la última y es la mejor
                "CA-Z-MEJOR",
                horas=72,
                ofertas=0,
                rut="91.000.002-2",
                monto_estimado=7_000_000,
                nombre="Compra zzcero b",
            ),
            _ca(
                "CA-Z-MEDIA",
                horas=36,
                ofertas=0,
                rut="91.000.003-3",
                monto_estimado=800_000,
                nombre="Compra zzcero c",
            ),
        ]
    )
    await mercado.flush()

    r = await cliente.get(RUTA, params={"search": "zzcero"})
    assert _codigos(r) == ["CA-Z-MEJOR", "CA-Z-MEDIA", "CA-Z-PEOR"]
    items = r.json()["items"]
    assert [i["puntaje"] for i in items] == [0.0, 0.0, 0.0]
    assert all(i["factores"]["comprador"] == 0.0 for i in items)

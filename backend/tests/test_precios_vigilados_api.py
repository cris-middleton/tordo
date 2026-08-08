"""La vigilancia de precios vista desde HTTP.

Lo que se fija aquí no es que los endpoints respondan 200, sino las tres
decisiones que hacen que la función sirva:

- **la unidad se resuelve sola**: quien pulsa «vigilar» busca un producto, no una
  unidad de medida, y guardar la unidad vacía crearía una vigilancia que no
  puede coincidir nunca con los datos — no avisaría jamás, y sin decirlo;
- **pulsar dos veces no duplica**: cada duplicado duplica todas las alertas de
  ese producto;
- **la vigilancia es de la empresa**: la ve el equipo, y sólo la administra
  quien administra la cuenta.
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text

from app.core.versionado import PREFIJO_API
from app.models.precio import TABLA_BANDAS, SuscripcionPrecio
from app.services import api_keys


@pytest_asyncio.fixture
async def otra_empresa(async_db, sample_user):
    """Segunda empresa del MISMO usuario, para probar el aislamiento."""
    from app.models.empresa import Empresa, EmpresaUsuario

    empresa = Empresa(rut_empresa="77777777-7", nombre_empresa="Otra SpA", estado_habil="habil")
    async_db.add(empresa)
    await async_db.flush()
    async_db.add(EmpresaUsuario(empresa_id=empresa.id, user_id=sample_user.id, rol="owner"))
    await async_db.flush()
    return empresa


@pytest_asyncio.fixture
async def cliente(async_db):
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def autenticado(cliente, async_db, sample_empresa, sample_user):
    """Cliente que ya lleva credencial de un `owner` de la empresa."""
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="pruebas", creada_por=sample_user.id
    )
    cliente.headers["Authorization"] = f"Bearer {clave}"
    return cliente


async def _bandas(async_db, codigo: str, unidades: dict[str, int]) -> None:
    """Deja al producto con esas unidades y esos volúmenes.

    La tabla la materializa el ETL, no las migraciones; en un entorno de
    desarrollo puede existir ya con sus 19 columnas. Por eso el INSERT nombra
    las suyas: uno posicional escribiría el precio en otra columna sin fallar.
    """
    await async_db.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
    await async_db.execute(
        text(f"""
            CREATE TABLE IF NOT EXISTS {TABLA_BANDAS} (
                "codigoProductoONU" text,
                "UnidadMedida" text,
                p50 double precision,
                n bigint
            )
        """)
    )
    for unidad, n in unidades.items():
        await async_db.execute(
            text(
                f'INSERT INTO {TABLA_BANDAS} ("codigoProductoONU", "UnidadMedida", p50, n) '
                "VALUES (:c, :u, 1000, :n)"
            ),
            {"c": codigo, "u": unidad, "n": n},
        )
    await async_db.flush()


def _codigo() -> str:
    """Único por test: la tabla de bandas es real y tiene datos de verdad."""
    return f"T{uuid.uuid4().hex[:10]}"


@pytest.mark.asyncio
async def test_vigilar_sin_unidad_usa_la_mas_comprada(autenticado, async_db, sample_empresa):
    """El caso normal: el usuario elige un producto y nada más.

    'Caja' tiene más órdenes que 'Unidad', así que es el precio que le importa
    al mercado de ese producto.
    """
    codigo = _codigo()
    await _bandas(async_db, codigo, {"Unidad": 10, "Caja": 900})

    r = await autenticado.post(
        f"{PREFIJO_API}/empresas/{sample_empresa.id}/precios-vigilados",
        json={"codigo_producto": codigo, "nombre_producto": "Guantes"},
    )

    assert r.status_code == 201, r.text
    assert r.json()["unidad_medida"] == "Caja"


@pytest.mark.asyncio
async def test_un_producto_sin_bandas_no_impide_vigilarlo(autenticado, async_db, sample_empresa):
    """Sin datos todavía, la vigilancia se crea igual.

    Rechazarla obligaría al usuario a adivinar cuándo el ETL ha materializado su
    producto. Queda con unidad vacía, que es la clave de los productos sin
    unidad declarada, y empezará a avisar en cuanto haya con qué comparar.
    """
    r = await autenticado.post(
        f"{PREFIJO_API}/empresas/{sample_empresa.id}/precios-vigilados",
        json={"codigo_producto": _codigo()},
    )

    assert r.status_code == 201, r.text
    assert r.json()["unidad_medida"] == ""


@pytest.mark.asyncio
async def test_pulsar_dos_veces_no_duplica(autenticado, async_db, sample_empresa):
    """Cada duplicado duplicaría todas las alertas de ese producto."""
    codigo = _codigo()
    await _bandas(async_db, codigo, {"Unidad": 50})
    ruta = f"{PREFIJO_API}/empresas/{sample_empresa.id}/precios-vigilados"

    primera = await autenticado.post(ruta, json={"codigo_producto": codigo})
    segunda = await autenticado.post(ruta, json={"codigo_producto": codigo})

    assert primera.json()["id"] == segunda.json()["id"]
    listado = (await autenticado.get(ruta)).json()
    assert [s["codigo_producto"] for s in listado].count(codigo) == 1


@pytest.mark.asyncio
async def test_dejar_de_vigilar(autenticado, sample_empresa):
    ruta = f"{PREFIJO_API}/empresas/{sample_empresa.id}/precios-vigilados"
    creada = await autenticado.post(ruta, json={"codigo_producto": _codigo()})

    borrado = await autenticado.delete(f"{ruta}/{creada.json()['id']}")

    assert borrado.status_code == 200, borrado.text
    assert (await autenticado.get(ruta)).json() == []


@pytest.mark.asyncio
async def test_no_se_puede_borrar_la_de_otra_empresa(
    autenticado, async_db, sample_empresa, otra_empresa
):
    """El id de la suscripción es un entero correlativo: adivinarlo es trivial.

    `sample_user` pertenece a las DOS empresas, así que comprobar pertenencia no
    basta — el filtro tiene que ser la empresa de la suscripción.
    """
    ajena = SuscripcionPrecio(
        empresa_id=otra_empresa.id, codigo_producto=_codigo(), unidad_medida=""
    )
    async_db.add(ajena)
    await async_db.flush()

    r = await autenticado.delete(
        f"{PREFIJO_API}/empresas/{sample_empresa.id}/precios-vigilados/{ajena.id}"
    )

    assert r.status_code == 404
    assert await async_db.get(SuscripcionPrecio, ajena.id) is not None

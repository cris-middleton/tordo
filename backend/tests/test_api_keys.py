"""Claves de API: emisión, verificación y —sobre todo— alcance.

Lo que puede salir caro aquí no es que la clave funcione, sino **hasta dónde
llega**: una credencial de larga vida que pueda saltar de empresa es una fuga de
datos entre inquilinos con credencial legítima, que es de las peores porque no
parece un ataque.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from app.api.versionado import PREFIJO_API
from app.models.empresa import Empresa, EmpresaUsuario
from app.services import api_keys


@pytest_asyncio.fixture
async def otra_empresa(async_db, sample_user) -> Empresa:
    """Una segunda empresa del MISMO usuario.

    Es el escenario que hace interesante el alcance: quien creó la clave sí
    pertenece a las dos, así que la barrera no puede ser la pertenencia.
    """
    empresa = Empresa(
        rut_empresa=f"7{uuid.uuid4().int % 10_000_000}-2",
        nombre_empresa="Segunda Empresa",
        estado_habil="habil",
        plan_tier="pro",
        subscription_status="active",
    )
    async_db.add(empresa)
    await async_db.flush()
    async_db.add(EmpresaUsuario(user_id=sample_user.id, empresa_id=empresa.id, rol="owner"))
    await async_db.flush()
    return empresa


# ── Formato y almacenamiento ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_la_clave_lleva_prefijo_reconocible(async_db, sample_empresa, sample_user):
    """`tordo_` no es decoración.

    Los escáneres de secretos de GitHub y las revisiones humanas detectan un
    prefijo conocido en un commit; 43 caracteres aleatorios sin prefijo pasan
    por cualquier cosa.
    """
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    assert clave.startswith("tordo_")
    assert api_keys.parece_clave(clave)
    # Y un JWT no se confunde con una clave.
    assert not api_keys.parece_clave("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def")


@pytest.mark.asyncio
async def test_no_se_guarda_la_clave_en_claro(async_db, sample_empresa, sample_user):
    clave, fila = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    assert fila.key_hash != clave
    assert len(fila.key_hash) == 64
    assert clave not in fila.key_hash
    # El prefijo SÍ está en claro: es lo que permite identificarla sin el secreto.
    assert fila.prefijo in clave


@pytest.mark.asyncio
async def test_dos_claves_nunca_coinciden(async_db, sample_empresa, sample_user):
    claves = {
        (await api_keys.crear(async_db, empresa_id=sample_empresa.id, nombre=f"k{i}"))[0]
        for i in range(20)
    }
    assert len(claves) == 20


# ── Verificación ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_una_clave_valida_se_acepta(async_db, sample_empresa, sample_user):
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    fila = await api_keys.verificar(async_db, clave)
    assert fila.empresa_id == sample_empresa.id


@pytest.mark.asyncio
async def test_usar_una_clave_deja_rastro(async_db, sample_empresa, sample_user):
    """Sin `ultimo_uso_en` no hay forma de saber si una clave sigue en uso antes
    de revocarla, y revocar a ciegas rompe integraciones."""
    clave, fila = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    assert fila.ultimo_uso_en is None
    await api_keys.verificar(async_db, clave)
    assert fila.ultimo_uso_en is not None


@pytest.mark.asyncio
async def test_una_clave_inventada_no_vale(async_db):
    with pytest.raises(api_keys.ErrorDeClave):
        await api_keys.verificar(async_db, "tordo_deadbeef_inventada")


@pytest.mark.asyncio
async def test_una_clave_revocada_no_vale(async_db, sample_empresa, sample_user):
    clave, fila = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    assert await api_keys.revocar(async_db, fila.id, sample_empresa.id) is True
    with pytest.raises(api_keys.ErrorDeClave, match="revocada"):
        await api_keys.verificar(async_db, clave)


@pytest.mark.asyncio
async def test_una_clave_caducada_no_vale(async_db, sample_empresa, sample_user):
    clave, _ = await api_keys.crear(
        async_db,
        empresa_id=sample_empresa.id,
        nombre="temporal",
        creada_por=sample_user.id,
        expira_en=datetime.now(UTC) - timedelta(seconds=1),
    )
    with pytest.raises(api_keys.ErrorDeClave, match="expirada"):
        await api_keys.verificar(async_db, clave)


# ── Alcance: lo que de verdad importa ────────────────────────────────────────


@pytest.mark.asyncio
async def test_no_se_revoca_una_clave_de_otra_empresa(
    async_db, sample_empresa, otra_empresa, sample_user
):
    """El filtro por empresa al revocar no es redundante con la autorización.

    Es lo que impide que un `id` de otra empresa —adivinado o filtrado— se
    revoque desde el endpoint de la primera. Aquí el mismo usuario pertenece a
    las dos, así que la pertenencia no basta como barrera.
    """
    clave, fila = await api_keys.crear(
        async_db, empresa_id=otra_empresa.id, nombre="ajena", creada_por=sample_user.id
    )
    assert await api_keys.revocar(async_db, fila.id, sample_empresa.id) is False
    # Y sigue valiendo.
    assert (await api_keys.verificar(async_db, clave)).id == fila.id


@pytest.mark.asyncio
async def test_el_listado_no_incluye_claves_de_otras_empresas(
    async_db, sample_empresa, otra_empresa, sample_user
):
    await api_keys.crear(async_db, empresa_id=sample_empresa.id, nombre="propia")
    await api_keys.crear(async_db, empresa_id=otra_empresa.id, nombre="ajena")

    nombres = {k.nombre for k in await api_keys.listar(async_db, sample_empresa.id)}
    assert "propia" in nombres
    assert "ajena" not in nombres


@pytest.mark.asyncio
async def test_el_listado_muestra_tambien_las_revocadas(async_db, sample_empresa):
    """Se listan a propósito: sirven para auditar qué se emitió y cuándo murió."""
    _, fila = await api_keys.crear(async_db, empresa_id=sample_empresa.id, nombre="vieja")
    await api_keys.revocar(async_db, fila.id, sample_empresa.id)

    claves = await api_keys.listar(async_db, sample_empresa.id)
    assert any(k.nombre == "vieja" and k.revocada_en is not None for k in claves)


# ── A través de HTTP ─────────────────────────────────────────────────────────


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


@pytest.mark.asyncio
async def test_una_clave_autentica_como_su_creador(cliente, async_db, sample_empresa, sample_user):
    """La prueba de que la vía nueva funciona de punta a punta."""
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    r = await cliente.get(f"{PREFIJO_API}/auth/me", headers={"Authorization": f"Bearer {clave}"})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == sample_user.id


@pytest.mark.asyncio
async def test_la_clave_no_puede_saltar_de_empresa(
    cliente, async_db, sample_empresa, otra_empresa, sample_user
):
    """El caso que justifica fijar la empresa en la clave.

    Quien la creó pertenece a las DOS empresas, así que una comprobación de
    pertenencia dejaría pasar esto. La barrera tiene que ser la clave.
    """
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    r = await cliente.get(
        f"{PREFIJO_API}/billing/status",
        params={"empresa_id": str(otra_empresa.id)},
        headers={"Authorization": f"Bearer {clave}"},
    )
    assert r.status_code == 403, f"esperaba 403, llegó {r.status_code}: {r.text[:200]}"


@pytest.mark.asyncio
async def test_sin_nombrar_empresa_la_clave_usa_la_suya(
    cliente, async_db, sample_empresa, otra_empresa, sample_user
):
    """Sin la clave, un usuario de dos empresas recibiría 400 pidiendo que la
    nombre. Con clave no hace falta: ya está fijada."""
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    r = await cliente.get(
        f"{PREFIJO_API}/billing/status", headers={"Authorization": f"Bearer {clave}"}
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_una_clave_de_un_usuario_inactivo_deja_de_valer(
    cliente, async_db, sample_empresa, sample_user
):
    """Una integración no debería sobrevivir a la salida de quien la montó sin
    que nadie lo revise."""
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    sample_user.is_active = False
    await async_db.flush()

    r = await cliente.get(f"{PREFIJO_API}/auth/me", headers={"Authorization": f"Bearer {clave}"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_una_clave_revocada_no_entra_por_http(cliente, async_db, sample_empresa, sample_user):
    clave, fila = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="MCP", creada_por=sample_user.id
    )
    await api_keys.revocar(async_db, fila.id, sample_empresa.id)

    r = await cliente.get(f"{PREFIJO_API}/auth/me", headers={"Authorization": f"Bearer {clave}"})
    assert r.status_code == 401

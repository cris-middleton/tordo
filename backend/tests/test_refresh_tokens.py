"""Rotación de tokens de refresco y detección de reutilización.

Lo que hay que probar aquí no es que el camino feliz funcione —eso se ve a
simple vista— sino que la parte de seguridad **hace lo que dice**. Una rotación
sin detección de reutilización es teatro: el atacante que roba un token lo canjea
una vez y se queda con uno válido para siempre, y el usuario legítimo ni se
entera.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.versionado import PREFIJO_API
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import auth_tokens


@pytest_asyncio.fixture
async def usuario(async_db) -> User:
    u = User(
        username=f"u{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    async_db.add(u)
    await async_db.flush()
    return u


async def _filas(db, user_id: int) -> list[RefreshToken]:
    return list(
        (await db.execute(select(RefreshToken).where(RefreshToken.user_id == user_id)))
        .scalars()
        .all()
    )


# ── Lo básico ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_el_token_en_claro_no_se_guarda(async_db, usuario):
    """Si la base se filtra, lo que hay dentro no debe servir para entrar."""
    token = await auth_tokens.emitir(async_db, usuario.id)
    fila = (await _filas(async_db, usuario.id))[0]

    assert fila.token_hash != token
    assert len(fila.token_hash) == 64  # SHA-256 en hexadecimal
    assert token not in fila.token_hash


@pytest.mark.asyncio
async def test_rotar_devuelve_uno_nuevo_e_invalida_el_anterior(async_db, usuario):
    primero = await auth_tokens.emitir(async_db, usuario.id)
    segundo, user_id = await auth_tokens.rotar(async_db, primero)

    assert segundo != primero
    assert user_id == usuario.id

    # El segundo sirve…
    tercero, _ = await auth_tokens.rotar(async_db, segundo)
    assert tercero not in (primero, segundo)


@pytest.mark.asyncio
async def test_la_cadena_queda_registrada(async_db, usuario):
    """`reemplazado_por` permite reconstruir quién sustituyó a quién."""
    primero = await auth_tokens.emitir(async_db, usuario.id)
    await auth_tokens.rotar(async_db, primero)

    filas = await _filas(async_db, usuario.id)
    viejo = next(f for f in filas if f.revocado_en is not None)
    nuevo = next(f for f in filas if f.revocado_en is None)
    assert viejo.reemplazado_por == nuevo.id
    assert viejo.familia_id == nuevo.familia_id


# ── La parte que importa ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reutilizar_un_token_canjeado_mata_la_sesion_entera(async_db, usuario):
    """El caso que justifica todo el mecanismo.

    Escenario: a alguien le roban el token. El legítimo rota y sigue navegando;
    el atacante presenta el token viejo. En ese momento hay dos partes con la
    misma credencial y no hay forma de distinguirlas, así que se cae todo.
    """
    robado = await auth_tokens.emitir(async_db, usuario.id)
    vigente, _ = await auth_tokens.rotar(async_db, robado)

    with pytest.raises(auth_tokens.ErrorDeRefresco):
        await auth_tokens.rotar(async_db, robado)

    # Y el que era válido deja de serlo: esa es la diferencia entre rotar de
    # verdad y sólo aparentarlo.
    with pytest.raises(auth_tokens.ErrorDeRefresco):
        await auth_tokens.rotar(async_db, vigente)

    assert all(f.revocado_en is not None for f in await _filas(async_db, usuario.id))


@pytest.mark.asyncio
async def test_un_token_inventado_no_vale(async_db, usuario):
    with pytest.raises(auth_tokens.ErrorDeRefresco):
        await auth_tokens.rotar(async_db, "token-que-nadie-emitio")


@pytest.mark.asyncio
async def test_un_token_caducado_no_vale(async_db, usuario):
    token = await auth_tokens.emitir(async_db, usuario.id)
    fila = (await _filas(async_db, usuario.id))[0]
    fila.expira_en = datetime.now(UTC) - timedelta(seconds=1)
    await async_db.flush()

    with pytest.raises(auth_tokens.ErrorDeRefresco, match="expirada"):
        await auth_tokens.rotar(async_db, token)


@pytest.mark.asyncio
async def test_rotar_no_alarga_la_caducidad(async_db, usuario):
    """Si rotar extendiera la caducidad, una sesión activa sería eterna."""
    primero = await auth_tokens.emitir(async_db, usuario.id)
    original = (await _filas(async_db, usuario.id))[0].expira_en

    await auth_tokens.rotar(async_db, primero)
    nuevo = next(f for f in await _filas(async_db, usuario.id) if f.revocado_en is None)

    # Se emiten con la misma ventana desde ahora, así que la diferencia es de
    # milisegundos, no de días.
    assert abs((nuevo.expira_en - original).total_seconds()) < 5


# ── Cierre de sesión ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cerrar_sesion_invalida_toda_la_cadena(async_db, usuario):
    """No sólo el token presentado: los anteriores son la misma sesión."""
    primero = await auth_tokens.emitir(async_db, usuario.id)
    segundo, _ = await auth_tokens.rotar(async_db, primero)

    assert await auth_tokens.revocar(async_db, segundo) is True
    with pytest.raises(auth_tokens.ErrorDeRefresco):
        await auth_tokens.rotar(async_db, segundo)


@pytest.mark.asyncio
async def test_cerrar_sesion_dos_veces_no_es_un_error(async_db, usuario):
    token = await auth_tokens.emitir(async_db, usuario.id)
    assert await auth_tokens.revocar(async_db, token) is True
    assert await auth_tokens.revocar(async_db, token) is True  # ya estaba, no revienta
    assert await auth_tokens.revocar(async_db, "inexistente") is False


@pytest.mark.asyncio
async def test_revocar_todo_no_toca_a_otros_usuarios(async_db, usuario):
    """Un `update` sin el filtro correcto echaría a todo el mundo."""
    otro = User(
        username=f"o{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        is_active=True,
    )
    async_db.add(otro)
    await async_db.flush()

    mio = await auth_tokens.emitir(async_db, usuario.id)
    ajeno = await auth_tokens.emitir(async_db, otro.id)

    await auth_tokens.revocar_todo_del_usuario(async_db, usuario.id)

    with pytest.raises(auth_tokens.ErrorDeRefresco):
        await auth_tokens.rotar(async_db, mio)
    nuevo, _ = await auth_tokens.rotar(async_db, ajeno)  # el ajeno sigue vivo
    assert nuevo


@pytest.mark.asyncio
async def test_sesiones_distintas_son_familias_distintas(async_db, usuario):
    """Cerrar sesión en un dispositivo no debe echar al usuario del otro."""
    movil = await auth_tokens.emitir(async_db, usuario.id)
    escritorio = await auth_tokens.emitir(async_db, usuario.id)

    await auth_tokens.revocar(async_db, movil)

    nuevo, _ = await auth_tokens.rotar(async_db, escritorio)
    assert nuevo


# ── A través de HTTP ─────────────────────────────────────────────────────────
#
# El servicio ya está probado arriba. Esto cubre el cableado: que el endpoint
# haga commit (sin él la rotación se perdería al cerrar la petición) y que
# traduzca el error del dominio a un 401 y no a un 500.
#
# Se usa httpx sobre ASGI y no `TestClient`: TestClient levanta la app en otro
# hilo con su propio bucle de eventos, y compartir ahí la conexión asyncpg de la
# sesión de test revienta con "got result for unknown protocol state". Con
# ASGITransport todo ocurre en el mismo bucle.


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


async def _registrar(cliente) -> tuple[str, str]:
    nombre = f"u{uuid.uuid4().hex[:8]}"
    await cliente.post(
        f"{PREFIJO_API}/auth/register",
        json={
            "username": nombre,
            "email": f"{nombre}@example.com",
            "password": "Contrasena.1",
            "full_name": "Prueba",
        },
    )
    return nombre, "Contrasena.1"


@pytest.mark.asyncio
async def test_login_entrega_los_dos_tokens(cliente):
    usuario, clave = await _registrar(cliente)
    r = await cliente.post(
        f"{PREFIJO_API}/auth/login", json={"username": usuario, "password": clave}
    )
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["access_token"]
    assert cuerpo["refresh_token"], "sin esto la sesión sigue muriendo a los 30 minutos"


@pytest.mark.asyncio
async def test_el_endpoint_de_refresco_rota(cliente):
    usuario, clave = await _registrar(cliente)
    login = await cliente.post(
        f"{PREFIJO_API}/auth/login", json={"username": usuario, "password": clave}
    )
    primero = login.json()["refresh_token"]

    r = await cliente.post(f"{PREFIJO_API}/auth/refresh", json={"refresh_token": primero})
    assert r.status_code == 200, r.text
    assert r.json()["refresh_token"] != primero

    # El anterior ya no vale, y el error es 401 y no un 500.
    repetido = await cliente.post(f"{PREFIJO_API}/auth/refresh", json={"refresh_token": primero})
    assert repetido.status_code == 401


@pytest.mark.asyncio
async def test_cerrar_sesion_invalida_el_refresco(cliente):
    usuario, clave = await _registrar(cliente)
    login = await cliente.post(
        f"{PREFIJO_API}/auth/login", json={"username": usuario, "password": clave}
    )
    token = login.json()["refresh_token"]

    salida = await cliente.post(f"{PREFIJO_API}/auth/logout", json={"refresh_token": token})
    assert salida.status_code == 200
    otra = await cliente.post(f"{PREFIJO_API}/auth/refresh", json={"refresh_token": token})
    assert otra.status_code == 401

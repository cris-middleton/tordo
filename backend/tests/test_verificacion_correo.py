"""Verificación del correo de la cuenta.

`users.is_verified` existía desde la primera migración y **nada la ponía en
`True`**: la columna estaba, la promesa no. Sin verificación, una cuenta puede
registrarse con el correo de otra persona y todo lo que el producto manda
—avisos con datos de negocio, el informe semanal, los comprobantes— acaba en un
buzón ajeno.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.versionado import PREFIJO_API
from app.models.user import User
from app.models.verificacion_correo import TokenVerificacionCorreo
from app.services import verificacion_correo


@pytest.fixture(autouse=True)
def sin_smtp(monkeypatch):
    """Nada de red en los tests. Sin esto, cada emisión intenta hablar con un
    servidor de correo y el `timeout` de 20 s se nota en la suite."""
    monkeypatch.setattr(verificacion_correo, "send_email", lambda **_: True)


@pytest.mark.asyncio
async def test_emitir_deja_la_cuenta_pendiente_y_devuelve_token(async_db, sample_user):
    token = await verificacion_correo.emitir(async_db, sample_user)

    assert token
    assert sample_user.is_verified is False
    filas = await async_db.execute(
        select(TokenVerificacionCorreo).where(TokenVerificacionCorreo.user_id == sample_user.id)
    )
    assert filas.scalars().first() is not None


@pytest.mark.asyncio
async def test_el_token_no_se_guarda_en_claro(async_db, sample_user):
    """Si la base se filtra, un token en claro es una cuenta verificable por
    quien la lea. Se guarda el SHA-256, igual que el de refresco."""
    token = await verificacion_correo.emitir(async_db, sample_user)

    filas = await async_db.execute(select(TokenVerificacionCorreo))
    registro = filas.scalars().first()
    assert registro.token_hash != token
    assert len(registro.token_hash) == 64


@pytest.mark.asyncio
async def test_confirmar_verifica_la_cuenta(async_db, sample_user):
    token = await verificacion_correo.emitir(async_db, sample_user)

    usuario = await verificacion_correo.confirmar(async_db, token)

    assert usuario.is_verified is True


@pytest.mark.asyncio
async def test_el_enlace_sirve_una_sola_vez(async_db, sample_user):
    """Sin la marca de uso, quien tenga el correo puede reverificar cuantas
    veces quiera mientras no caduque."""
    token = await verificacion_correo.emitir(async_db, sample_user)
    await verificacion_correo.confirmar(async_db, token)

    with pytest.raises(verificacion_correo.ErrorDeVerificacion, match="ya se usó"):
        await verificacion_correo.confirmar(async_db, token)


@pytest.mark.asyncio
async def test_un_token_vencido_no_sirve(async_db, sample_user):
    token = await verificacion_correo.emitir(async_db, sample_user)
    filas = await async_db.execute(select(TokenVerificacionCorreo))
    registro = filas.scalars().first()
    registro.expira_en = datetime.now(UTC) - timedelta(minutes=1)
    await async_db.flush()

    with pytest.raises(verificacion_correo.ErrorDeVerificacion, match="venció"):
        await verificacion_correo.confirmar(async_db, token)


@pytest.mark.asyncio
async def test_un_token_inventado_no_sirve(async_db):
    with pytest.raises(verificacion_correo.ErrorDeVerificacion):
        await verificacion_correo.confirmar(async_db, "esto-no-existe")


@pytest.mark.asyncio
async def test_no_se_reemite_a_quien_ya_verifico(async_db, sample_user):
    """Un correo de «confirma tu correo» a alguien que ya lo confirmó sólo
    genera dudas."""
    sample_user.is_verified = True
    await async_db.flush()

    assert await verificacion_correo.emitir(async_db, sample_user) is None


@pytest.mark.asyncio
async def test_reenviar_a_un_correo_desconocido_no_revienta(async_db):
    """Y no dice nada: distinguir convertiría el formulario en un verificador
    de cuentas gratis."""
    await verificacion_correo.reenviar(async_db, "no-existe@ejemplo.cl")


@pytest.mark.asyncio
async def test_el_endpoint_responde_igual_exista_o_no(async_db, sample_user):
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            conocido = await c.post(
                f"{PREFIJO_API}/auth/verificar/solicitar", json={"email": sample_user.email}
            )
            desconocido = await c.post(
                f"{PREFIJO_API}/auth/verificar/solicitar", json={"email": "nadie@ejemplo.cl"}
            )
    finally:
        app.dependency_overrides.clear()

    assert conocido.status_code == desconocido.status_code == 200
    assert conocido.json() == desconocido.json()


@pytest.mark.asyncio
async def test_registrarse_manda_el_correo_de_bienvenida(async_db, monkeypatch):
    """El flujo entero: sin esto, la verificación existiría y nadie la usaría."""
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    emitidos: list[int] = []
    original = verificacion_correo.emitir

    async def _espiar(db, usuario, **kw):
        emitidos.append(usuario.id)
        return await original(db, usuario, **kw)

    monkeypatch.setattr(verificacion_correo, "emitir", _espiar)

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            r = await c.post(
                f"{PREFIJO_API}/auth/register",
                json={
                    "email": "nuevo@pyme.cl",
                    "username": "nuevo",
                    "password": "unaClaveLarga123",
                    "full_name": "Nueva PYME",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 201, r.text
    assert emitidos, "registrarse tiene que disparar el correo de verificación"

    fila = await async_db.execute(select(User).where(User.email == "nuevo@pyme.cl"))
    assert fila.scalar_one().is_verified is False

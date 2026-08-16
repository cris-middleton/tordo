"""Recuperación de contraseña.

Lo que se comprueba aquí no es que "funcione" —eso lo ve cualquiera— sino las
cuatro propiedades que se pierden en un refactor sin que nada se rompa a la vista:

- que pedir la recuperación **no dice si el correo existe**;
- que el token vale **una sola vez**;
- que restablecer **cierra todas las sesiones abiertas**, que suele ser el motivo
  real por el que alguien recupera su contraseña;
- que en la base **no queda el token en claro**.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import BackgroundTasks
from sqlalchemy import select

from app.core.security import get_password_hash, verify_password
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services import auth_tokens, password_reset


@pytest.fixture(autouse=True)
def sin_correo(monkeypatch):
    """El servicio manda un correo; aquí sólo se registra que lo intentó."""
    enviados: list[dict] = []

    def _fake(to, subject, body, html_body=None, from_email=None, adjuntos=None):
        enviados.append({"to": to, "subject": subject, "body": body, "html": html_body})
        return True

    monkeypatch.setattr(password_reset, "send_email", _fake)
    return enviados


# La fixture `client` de conftest.py envuelve `TestClient`, que levanta la app
# en otro hilo con su propio bucle de eventos: al compartir ahí la conexión
# asyncpg de `async_db` revienta con "attached to a different loop" en CUALQUIER
# endpoint que toque la base — confirmado en los dos tests de abajo, uno de ellos
# sin ningún uso explícito de `async_db`. `cliente` es el mismo patrón que ya usa
# `test_refresh_tokens.py`: httpx sobre ASGITransport corre en el mismo bucle.
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
async def test_un_correo_desconocido_responde_igual_que_uno_conocido(
    async_db, sample_user, cliente
):
    conocido = await cliente.post(
        "/api/v1/auth/password-reset/solicitar", json={"email": sample_user.email}
    )
    desconocido = await cliente.post(
        "/api/v1/auth/password-reset/solicitar", json={"email": "nadie@example.com"}
    )
    assert conocido.status_code == desconocido.status_code == 200
    assert conocido.json() == desconocido.json(), (
        "la respuesta distingue un correo registrado de uno que no lo está, "
        "y eso convierte el formulario en un verificador de cuentas"
    )


@pytest.mark.asyncio
async def test_el_token_no_se_guarda_en_claro(async_db, sample_user, sin_correo):
    token = await password_reset.solicitar(async_db, sample_user.email)
    await async_db.flush()
    filas = (await async_db.execute(select(PasswordResetToken))).scalars().all()
    assert len(filas) == 1
    assert filas[0].token_hash != token
    assert token not in filas[0].token_hash


@pytest.mark.asyncio
async def test_restablecer_cambia_la_contrasena(async_db, sample_user, sin_correo):
    sample_user.hashed_password = get_password_hash("vieja")
    await async_db.flush()
    token = await password_reset.solicitar(async_db, sample_user.email)
    await async_db.flush()

    await password_reset.restablecer(async_db, token, "nueva-contrasena-larga")
    await async_db.flush()
    await async_db.refresh(sample_user)

    assert verify_password("nueva-contrasena-larga", sample_user.hashed_password)
    assert not verify_password("vieja", sample_user.hashed_password)


@pytest.mark.asyncio
async def test_el_token_sirve_una_sola_vez(async_db, sample_user, sin_correo):
    token = await password_reset.solicitar(async_db, sample_user.email)
    await async_db.flush()
    await password_reset.restablecer(async_db, token, "primera-vez-larga")
    await async_db.flush()

    with pytest.raises(password_reset.ErrorDeRecuperacion):
        await password_reset.restablecer(async_db, token, "segunda-vez-larga")


@pytest.mark.asyncio
async def test_un_token_caducado_no_vale(async_db, sample_user, sin_correo):
    token = await password_reset.solicitar(async_db, sample_user.email)
    await async_db.flush()
    fila = (await async_db.execute(select(PasswordResetToken))).scalar_one()
    fila.expira_en = datetime.now(UTC) - timedelta(minutes=1)
    await async_db.flush()

    with pytest.raises(password_reset.ErrorDeRecuperacion):
        await password_reset.restablecer(async_db, token, "da-igual-que-sea-larga")


@pytest.mark.asyncio
async def test_restablecer_cierra_las_sesiones_abiertas(async_db, sample_user, sin_correo):
    """Quien recupera su contraseña suele hacerlo porque sospecha de alguien más."""
    refresco = await auth_tokens.emitir(async_db, sample_user.id)
    await async_db.flush()

    token = await password_reset.solicitar(async_db, sample_user.email)
    await async_db.flush()
    await password_reset.restablecer(async_db, token, "otra-contrasena-larga")
    await async_db.flush()

    with pytest.raises(auth_tokens.ErrorDeRefresco):
        await auth_tokens.rotar(async_db, refresco)


@pytest.mark.asyncio
async def test_un_usuario_inactivo_no_recibe_token(async_db, sin_correo):
    inactivo = User(
        username="inactivo",
        email="inactivo@example.com",
        hashed_password="x",
        is_active=False,
    )
    async_db.add(inactivo)
    await async_db.flush()

    assert await password_reset.solicitar(async_db, inactivo.email) is None
    filas = (await async_db.execute(select(PasswordResetToken))).scalars().all()
    assert filas == []


@pytest.mark.asyncio
async def test_el_endpoint_de_confirmacion_rechaza_un_token_inventado(cliente):
    respuesta = await cliente.post(
        "/api/v1/auth/password-reset/confirmar",
        json={"token": "no-existe", "new_password": "cualquier-cosa-larga"},
    )
    assert respuesta.status_code == 400
    assert "enlace" in respuesta.json()["detail"].lower()


@pytest.mark.asyncio
async def test_solicitar_agenda_el_correo_en_vez_de_mandarlo_de_una(
    async_db, sample_user, sin_correo
):
    """`send_email` es un `smtplib` síncrono sin timeout. Si `solicitar` lo
    llamara directo, la rama de un correo conocido tardaría el round-trip SMTP
    entero mientras la de uno desconocido sólo hace un SELECT — un oráculo de
    tiempo que sustituiría al oráculo de respuesta que el resto de los tests
    ya cierra. Comprobar que `send_email` "se llamó" no basta (eso lo prueba
    tanto el camino síncrono como el agendado): lo que importa es que, al
    volver `solicitar`, todavía NO se llamó — sólo quedó anotado para
    correrse después, que es lo que hace Starlette una vez la respuesta ya
    salió.
    """
    tareas = BackgroundTasks()

    token = await password_reset.solicitar(async_db, sample_user.email, background_tasks=tareas)

    assert token is not None
    assert sin_correo == [], "el correo se mandó antes de que la respuesta pudiera salir"
    assert len(tareas.tasks) == 1, "el envío no quedó agendado en las tareas de background"

    await tareas()  # esto es lo que el framework corre DESPUÉS de mandar la respuesta

    assert len(sin_correo) == 1
    assert sin_correo[0]["to"] == sample_user.email


@pytest.mark.asyncio
async def test_el_nombre_se_escapa_en_el_html_pero_no_en_el_texto(
    async_db, sample_user, sin_correo
):
    """`full_name` es texto libre que el usuario puso al registrarse, sin
    validar caracteres. Sin escapar, un nombre con `&`/`<` rompe la maqueta
    del correo o inyecta HTML — en el correo de la propia víctima."""
    sample_user.full_name = "María & José <b>"
    await async_db.flush()

    await password_reset.solicitar(async_db, sample_user.email)

    assert len(sin_correo) == 1
    assert "María & José <b>" in sin_correo[0]["body"], (
        "el texto plano no lo interpreta ningún cliente de correo: no hace falta escaparlo"
    )
    assert "<b>" not in sin_correo[0]["html"]
    assert "María &amp; José &lt;b&gt;" in sin_correo[0]["html"]


@pytest.mark.asyncio
async def test_restablecer_rechaza_a_un_usuario_desactivado_entre_solicitar_y_restablecer(
    async_db, sample_user, sin_correo
):
    """El token sigue siendo válido y sin usar; lo que cambió es la cuenta."""
    token = await password_reset.solicitar(async_db, sample_user.email)
    await async_db.flush()

    sample_user.is_active = False
    await async_db.flush()

    with pytest.raises(password_reset.ErrorDeRecuperacion):
        await password_reset.restablecer(async_db, token, "otra-vez-larga")

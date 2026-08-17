"""El código de un solo uso que cierra el login con Google.

Antes la vuelta de Google traía el JWT de acceso en la URL y **nada más**: sin
token de refresco, la sesión moría a los 30 minutos en mitad de la jornada. Es
justo lo que `refresh_tokens` existe para evitar, y no se aplicaba a quien
entraba por Google.

Mandar el refresco por la URL habría sido peor —dura treinta días y una URL
queda en el historial, en los logs de cualquier proxy y en el `Referer`—. Lo que
viaja ahora no sirve por sí solo: caduca en sesenta segundos, se canjea una vez
y el canje va de servidor a servidor.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.oauth_codigo import OAuthCodigo
from app.services import oauth_codigo


class TestEmitir:
    async def test_devuelve_el_codigo_en_claro_y_guarda_el_hash(self, async_db, sample_user):
        codigo = await oauth_codigo.emitir(async_db, sample_user.id)

        assert codigo
        fila = (await async_db.execute(select(OAuthCodigo))).scalar_one()
        assert fila.codigo_hash != codigo, "el código no puede quedar en claro en la base"
        assert fila.codigo_hash == oauth_codigo._hash(codigo)
        assert fila.usado_en is None

    async def test_caduca_en_un_minuto(self, async_db, sample_user):
        """Un redirect tarda milisegundos: más ventana es más superficie."""
        await oauth_codigo.emitir(async_db, sample_user.id)
        fila = (await async_db.execute(select(OAuthCodigo))).scalar_one()

        margen = fila.expira_en - datetime.now(UTC)
        assert timedelta(seconds=40) < margen <= timedelta(seconds=60)

    async def test_dos_emisiones_dan_codigos_distintos(self, async_db, sample_user):
        a = await oauth_codigo.emitir(async_db, sample_user.id)
        b = await oauth_codigo.emitir(async_db, sample_user.id)
        assert a != b


class TestCanjear:
    async def test_devuelve_el_usuario(self, async_db, sample_user):
        codigo = await oauth_codigo.emitir(async_db, sample_user.id)
        assert await oauth_codigo.canjear(async_db, codigo) == sample_user.id

    async def test_el_segundo_canje_falla(self, async_db, sample_user):
        """**Es la garantía que sostiene todo el diseño.** Si el código sirviera
        dos veces, dejarlo en el historial del navegador volvería a ser un
        problema."""
        codigo = await oauth_codigo.emitir(async_db, sample_user.id)
        await oauth_codigo.canjear(async_db, codigo)

        with pytest.raises(oauth_codigo.ErrorDeCodigo):
            await oauth_codigo.canjear(async_db, codigo)

    async def test_un_codigo_caducado_no_vale(self, async_db, sample_user):
        codigo = await oauth_codigo.emitir(async_db, sample_user.id)
        fila = (await async_db.execute(select(OAuthCodigo))).scalar_one()
        fila.expira_en = datetime.now(UTC) - timedelta(seconds=1)
        await async_db.flush()

        with pytest.raises(oauth_codigo.ErrorDeCodigo):
            await oauth_codigo.canjear(async_db, codigo)

    async def test_un_codigo_inventado_no_vale(self, async_db):
        with pytest.raises(oauth_codigo.ErrorDeCodigo):
            await oauth_codigo.canjear(async_db, "esto-no-existe")

    async def test_la_cadena_vacia_no_vale(self, async_db):
        with pytest.raises(oauth_codigo.ErrorDeCodigo):
            await oauth_codigo.canjear(async_db, "")

    async def test_los_tres_rechazos_dicen_lo_mismo(self, async_db, sample_user):
        """Distinguir «no existe» de «ya se usó» le diría a quien pruebe códigos
        cuáles llegaron a existir."""
        usado = await oauth_codigo.emitir(async_db, sample_user.id)
        await oauth_codigo.canjear(async_db, usado)

        mensajes = set()
        for valor in (usado, "inventado", ""):
            try:
                await oauth_codigo.canjear(async_db, valor)
            except oauth_codigo.ErrorDeCodigo as exc:
                mensajes.add(str(exc))
        assert len(mensajes) == 1


@pytest_asyncio.fixture
async def cliente(async_db):
    """`AsyncClient` sobre `ASGITransport` y no `TestClient`.

    `TestClient` corre la aplicación en SU propio bucle de eventos, distinto del
    que usa `async_db`, y asyncpg rechaza que se le hable desde otro bucle. Es
    el mismo motivo por el que `test_bi_mi_posicion_http.py` hace lo mismo.
    """
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


class TestEndpointDeCanje:
    async def test_devuelve_acceso_Y_refresco(self, cliente, async_db, sample_user):
        """El punto entero del cambio: la sesión de Google deja de morir a los
        30 minutos porque ahora también recibe refresco."""
        codigo = await oauth_codigo.emitir(async_db, sample_user.id)
        await async_db.commit()

        r = await cliente.post("/api/v1/auth/google/canjear", json={"codigo": codigo})

        assert r.status_code == 200
        cuerpo = r.json()
        assert cuerpo["access_token"]
        assert cuerpo["refresh_token"], "sin refresco la sesión volvería a caducar a los 30 min"
        assert cuerpo["token_type"] == "bearer"

    async def test_un_codigo_gastado_da_400_con_mensaje_accionable(
        self, cliente, async_db, sample_user
    ):
        codigo = await oauth_codigo.emitir(async_db, sample_user.id)
        await async_db.commit()
        await cliente.post("/api/v1/auth/google/canjear", json={"codigo": codigo})

        r = await cliente.post("/api/v1/auth/google/canjear", json={"codigo": codigo})
        assert r.status_code == 400
        assert "Google" in r.json()["detail"]

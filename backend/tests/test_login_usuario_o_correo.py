"""Entrar con el nombre de usuario o con el correo, indistintamente.

El formulario pedía «Usuario» y sólo aceptaba eso. Un nombre de usuario se
elige de pasada al registrarse y se olvida a la semana; el correo no. Cada
usuario olvidado es una recuperación de cuenta — o un cliente que no vuelve.

Lo que estos tests fijan no es la comodidad, sino las dos formas en que esto se
puede implementar mal:

1. **Resolver el identificador con un `OR` entre las dos columnas.** Entonces
   alguien que se registre con el username `victima@empresa.cl` compite por ese
   identificador con quien tiene ese correo de verdad, y cuál de los dos
   responde lo decide el orden de filas. `buscar_por_identificador` decide
   antes por la forma del texto: si lleva `@` es un correo y sólo se mira esa
   columna.

2. **Comparar el correo tal cual llega.** La columna guarda lo que la persona
   escribió al registrarse, así que quien puso `Ana@Empresa.cl` no podría
   entrar escribiendo su correo como lo escribe siempre.

**Cliente propio y no la fixture `client`**, por el mismo motivo que
`test_bi_mi_posicion_http.py`: `TestClient` ejecuta el ciclo de vida de la
aplicación en cada test, y el gestor de sesiones del servidor MCP sólo admite
un `.run()` por instancia. Usarla aquí hacía reventar `test_mcp.py` entero.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.core.versionado import PREFIJO_API
from app.models.user import User

CLAVE = "clave-de-prueba"


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
async def ana(async_db: AsyncSession) -> User:
    """Un usuario con contraseña real: `sample_user` guarda un hash de mentira."""
    user = User(
        username="constructora_perez",
        email="Ana@Empresa.CL",  # con mayúsculas a propósito
        hashed_password=get_password_hash(CLAVE),
        full_name="Ana Pérez",
        is_active=True,
    )
    async_db.add(user)
    await async_db.flush()
    await async_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def impostor(async_db: AsyncSession) -> User:
    """Se registra usando como NOMBRE DE USUARIO el correo de otra persona."""
    user = User(
        username="ana@empresa.cl",
        email="impostor@otrodominio.cl",
        hashed_password=get_password_hash("clave-del-impostor"),
        is_active=True,
    )
    async_db.add(user)
    await async_db.flush()
    await async_db.refresh(user)
    return user


async def _entrar(cliente, identificador: str, clave: str = CLAVE):
    return await cliente.post(
        f"{PREFIJO_API}/auth/login",
        json={"username": identificador, "password": clave},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "identificador",
    [
        "constructora_perez",  # el nombre de usuario
        "Ana@Empresa.CL",  # el correo tal como lo escribió al registrarse
        "ana@empresa.cl",  # el mismo correo como lo escribe cada día
        "ANA@EMPRESA.CL",
    ],
)
async def test_entra_con_usuario_o_con_correo(cliente, ana, identificador):
    respuesta = await _entrar(cliente, identificador)
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["access_token"]


@pytest.mark.asyncio
async def test_la_contrasena_sigue_siendo_obligatoria(cliente, ana):
    """Aceptar dos identificadores no es aceptar cualquier contraseña."""
    assert (await _entrar(cliente, "ana@empresa.cl", "otra-cosa")).status_code == 401
    assert (await _entrar(cliente, "constructora_perez", "otra-cosa")).status_code == 401


@pytest.mark.asyncio
async def test_un_username_con_forma_de_correo_no_secuestra_ese_correo(cliente, ana, impostor):
    """El caso que un `OR` entre columnas dejaría abierto.

    Alguien se registra poniendo como NOMBRE DE USUARIO el correo de otra
    persona. Escribir ese correo en el login tiene que seguir resolviendo a la
    dueña del correo — no al que se apropió del texto.
    """
    # La contraseña del impostor no abre nada a través del correo ajeno: ese
    # texto lleva `@`, así que se resuelve contra la columna `email`.
    r = await _entrar(cliente, "ana@empresa.cl", "clave-del-impostor")
    assert r.status_code == 401, r.text

    # La dueña del correo sigue entrando con él.
    assert (await _entrar(cliente, "ana@empresa.cl", CLAVE)).status_code == 200

    # Y el impostor entra con lo suyo, que es su propio correo.
    r = await _entrar(cliente, "impostor@otrodominio.cl", "clave-del-impostor")
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_el_mensaje_no_distingue_cuenta_inexistente_de_clave_mala(cliente, ana):
    """Distinguirlos regala un verificador de cuentas."""
    inexistente = await _entrar(cliente, "no-existe-nadie-asi", "lo-que-sea")
    clave_mala = await _entrar(cliente, "constructora_perez", "lo-que-sea")

    assert inexistente.status_code == clave_mala.status_code == 401
    assert inexistente.json()["detail"] == clave_mala.json()["detail"]
    assert inexistente.json()["detail"] == "Usuario o contraseña incorrectos."

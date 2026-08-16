"""Fixtures de test, contra PostgreSQL real.

Por qué ya no hay SQLite
------------------------
Este archivo mantenía a mano el DDL de 11 tablas para SQLite, y
`test_dashboard_tasks.py` tenía un tercero. Era un esquema paralelo al de los
modelos, y divergió una y otra vez:

- La columna `alert_metadata` del DDL, que en el modelo es `metadata`
  (`Alert.alert_metadata = Column("metadata", JSON)`) — 5 tests rotos.
- Archivos `.db` de corridas anteriores que sombreaban el esquema nuevo, porque
  `CREATE TABLE IF NOT EXISTS` no altera una tabla existente.
- Timestamps sin zona horaria: Postgres los devuelve con `tzinfo`, SQLite no, y
  compararlos lanzaba `TypeError`.
- Los tipos `ARRAY` de Postgres no existen en SQLite, así que había que
  sustituirlos por `TEXT` y perder la semántica.
- Cada columna nueva había que añadirla a mano en dos o tres sitios.

Ahora el esquema lo crean **las migraciones**, que es lo mismo que corre en
producción. Un test de aislamiento entre inquilinos que sólo puede correr contra
SQLite no prueba lo que hace falta probar.

Aislamiento
-----------
El esquema se crea una vez por sesión de pytest. Cada test corre dentro de una
transacción que se revierte al terminar, así que no se pisan entre sí y no hace
falta recrear tablas.

En local se salta si no hay Postgres (`make dev-up-d` lo levanta). En CI es
obligatorio.
"""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.api.empresas import aplicar_trial_inicial
from app.core.security import create_access_token
from app.db import get_db
from app.main import app
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
BACKEND = Path(__file__).resolve().parents[1]


# Los tests ESCRIBEN en la base que apunte DATABASE_URL. El rollback por test la
# deja limpia, pero un puntero equivocado sigue siendo un accidente caro.
_NOMBRES_PROHIBIDOS = ("prod", "produccion", "production", "live")


def url_base() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    nombre_db = url.rsplit("/", 1)[-1].split("?")[0].lower()
    if any(p in nombre_db for p in _NOMBRES_PROHIBIDOS):
        raise RuntimeError(
            f"Los tests apuntan a una base que parece productiva ({nombre_db!r}). "
            "Aplican migraciones y escriben datos: revisa DATABASE_URL."
        )
    return url


def _url_async(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _url_sync(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


@pytest.fixture(scope="session")
def esquema_migrado() -> str:
    """Aplica las migraciones sobre la base de test. Devuelve la URL.

    Se usa `alembic upgrade head` y no `Base.metadata.create_all()` a propósito:
    así los tests corren contra el MISMO esquema que produce una migración en
    producción. `create_all` esconde la deriva entre modelos y migraciones que
    ya documenta la revisión (§5.0), justamente la que se quiere detectar.
    """
    url = url_base()
    entorno = {**os.environ, "DATABASE_URL": _url_sync(url), "SECRET_KEY": "test"}
    try:
        resultado = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=BACKEND,
            env=entorno,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        if IN_CI:
            raise
        pytest.skip(f"no se pudieron aplicar las migraciones ({type(exc).__name__})")

    if resultado.returncode != 0:
        if IN_CI:
            raise RuntimeError(f"alembic upgrade head falló:\n{resultado.stderr[-2000:]}")
        pytest.skip(
            "sin base de datos disponible — levanta el stack con `make dev-up-d`\n"
            f"{resultado.stderr[-400:]}"
        )
    return url


@pytest_asyncio.fixture
async def async_db(esquema_migrado) -> AsyncSession:
    """Sesión async dentro de una transacción que se revierte al terminar.

    El rollback es lo que da aislamiento entre tests sin recrear el esquema.
    """
    engine = create_async_engine(_url_async(esquema_migrado))
    conexion = await engine.connect()
    transaccion = await conexion.begin()
    sesion = async_sessionmaker(bind=conexion, class_=AsyncSession, expire_on_commit=False)()
    try:
        yield sesion
    finally:
        await sesion.close()
        await transaccion.rollback()
        await conexion.close()
        await engine.dispose()


@pytest.fixture
def sync_task_db(esquema_migrado):
    """Sesión síncrona sobre una transacción que se revierte al terminar.

    Para las tareas que usan `SyncSessionLocal` (Celery, webhooks): el
    esquema async normal (`async_db`) corre en otra conexión/driver
    (asyncpg vs. psycopg2), así que una fixture creada ahí no es visible
    desde una sesión síncrona aparte. Ésta da una conexión síncrona real
    para que el código bajo prueba, con su `SyncSessionLocal` inyectado por
    `monkeypatch`, vea las filas que el test acaba de sembrar.
    """
    url = esquema_migrado.replace("postgresql+asyncpg://", "postgresql://", 1)
    engine = create_engine(url, future=True)
    conexion = engine.connect()
    transaccion = conexion.begin()
    # `create_savepoint`: el código bajo prueba hace su propio `commit()` (y a
    # veces `rollback()`), y sin esto ese commit/rollback afectaría a la
    # transacción del PROPIO test —incluidas las filas que acaba de sembrar—.
    # Con savepoints, cada commit/rollback del código bajo prueba queda
    # contenido, que es lo que se quiere comprobar.
    SyncSessionMaker = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=conexion,
        join_transaction_mode="create_savepoint",
    )
    session = SyncSessionMaker()
    try:
        yield session, SyncSessionMaker
    finally:
        session.close()
        transaccion.rollback()
        conexion.close()
        engine.dispose()


@pytest.fixture
def client(async_db):
    """Cliente HTTP con la sesión de test inyectada."""

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# Alias histórico: varios tests piden `db`.
@pytest.fixture
def db(async_db):
    return async_db


@pytest_asyncio.fixture
async def sample_user(async_db: AsyncSession) -> User:
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="x",
        full_name="Test User",
        is_active=True,
    )
    async_db.add(user)
    await async_db.flush()
    await async_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_empresa(async_db: AsyncSession, sample_user: User) -> Empresa:
    empresa = Empresa(
        rut_empresa="76543210-K",
        nombre_empresa="Constructora Test",
        estado_habil="habil",
    )
    # Igual que en producción: crear una empresa arranca el reverse-trial de 14
    # días (app/api/empresas.py::aplicar_trial_inicial). Sin esto el fixture
    # representaría un estado que la aplicación nunca produce.
    aplicar_trial_inicial(empresa)
    async_db.add(empresa)
    await async_db.flush()
    async_db.add(EmpresaUsuario(user_id=sample_user.id, empresa_id=empresa.id, rol="owner"))
    await async_db.flush()
    await async_db.refresh(empresa)
    return empresa


# ── Cabeceras de autorización por rol ────────────────────────────────────────
#
# `sample_empresa` ya deja a `sample_user` como owner. Estas dos fixtures dan
# el JWT listo para usar en la cabecera `Authorization`, para tests que
# necesitan comprobar qué puede hacer cada rol (Tareas 4, 5, 13).


@pytest_asyncio.fixture
async def cabeceras_owner(sample_user: User) -> dict[str, str]:
    """Cabeceras con el JWT del owner de `sample_empresa` (=`sample_user`)."""
    token = create_access_token({"sub": str(sample_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def cabeceras_viewer(async_db: AsyncSession, sample_empresa: Empresa) -> dict[str, str]:
    """Cabeceras con el JWT de un usuario `viewer` sobre `sample_empresa`.

    Un usuario nuevo, no `sample_user`: ése ya es owner, y lo que hace falta
    para probar la barrera de rol es alguien SIN permiso de escritura.
    """
    sufijo = uuid.uuid4().hex[:8]
    usuario = User(
        username=f"viewer-{sufijo}",
        email=f"viewer-{sufijo}@example.com",
        hashed_password="x",
        is_active=True,
    )
    async_db.add(usuario)
    await async_db.flush()
    async_db.add(EmpresaUsuario(user_id=usuario.id, empresa_id=sample_empresa.id, rol="viewer"))
    await async_db.flush()
    token = create_access_token({"sub": str(usuario.id)})
    return {"Authorization": f"Bearer {token}"}

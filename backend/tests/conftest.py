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
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.empresas import aplicar_trial_inicial
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

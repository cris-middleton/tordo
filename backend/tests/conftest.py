import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.main import app
from app.db import Base, get_db
from app.models.user import User
from app.models.empresa import Empresa, EmpresaUsuario

# Use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Create a test client with database override"""
    def override_get_db():
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ── Async fixtures (SQLite + aiosqlite) ──────────────────────────────────────
# Note: PostgreSQL-specific ARRAY columns (Empresa.rubros_cpv, Empresa.regiones,
# TFIDFPerfil.rubros_usados) are not supported by SQLite. We bypass
# Base.metadata.create_all and use raw DDL to create only the tables needed,
# with TEXT substituted for ARRAY columns.

ASYNC_TEST_URL = "sqlite+aiosqlite:///./test_async.db"

_ASYNC_DDL = [
    """CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        is_active BOOLEAN DEFAULT 1,
        is_superuser BOOLEAN DEFAULT 0,
        is_verified BOOLEAN DEFAULT 0,
        notification_email BOOLEAN DEFAULT 1,
        notification_in_app BOOLEAN DEFAULT 1,
        notification_webhook BOOLEAN DEFAULT 0,
        notification_whatsapp BOOLEAN DEFAULT 0,
        webhook_url VARCHAR(500),
        plan_tier VARCHAR(20) NOT NULL DEFAULT 'basico',
        subscription_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        trial_ends_at DATETIME,
        trial_reminder_day7_sent_at DATETIME,
        trial_reminder_day12_sent_at DATETIME,
        google_id VARCHAR(100) UNIQUE,
        whatsapp_number VARCHAR(20),
        onboarding_completed BOOLEAN DEFAULT 0 NOT NULL,
        onboarding_step INTEGER DEFAULT 0 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        last_login DATETIME
    )""",
    """CREATE TABLE IF NOT EXISTS buyer_organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_organismo VARCHAR(50) UNIQUE NOT NULL,
        nombre VARCHAR(500),
        rut VARCHAR(20),
        region VARCHAR(100),
        tipo VARCHAR(100)
    )""",
    """CREATE TABLE IF NOT EXISTS licitaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_externo VARCHAR(100) UNIQUE NOT NULL,
        codigo_interno VARCHAR(100),
        nombre VARCHAR(500) NOT NULL,
        descripcion TEXT,
        fecha_publicacion DATETIME NOT NULL,
        fecha_cierre DATETIME,
        fecha_inicio DATETIME,
        fecha_final DATETIME,
        monto_estimado NUMERIC(15,2),
        monto_total NUMERIC(15,2),
        moneda VARCHAR(10) DEFAULT 'CLP',
        estado VARCHAR(50),
        tipo_licitacion VARCHAR(100),
        tipo_moneda VARCHAR(10),
        codigo_organismo VARCHAR(50),
        nombre_organismo VARCHAR(500),
        rut_organismo VARCHAR(20),
        organismo_id INTEGER REFERENCES buyer_organizations(id),
        region VARCHAR(100),
        comuna VARCHAR(100),
        informacion_adicional TEXT,
        items TEXT,
        url_acta VARCHAR(500),
        url_licitacion VARCHAR(500),
        fecha_extraccion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion DATETIME,
        activo BOOLEAN DEFAULT 1
    )""",
    # ARRAY columns (rubros_cpv, regiones) replaced with TEXT for SQLite compatibility
    """CREATE TABLE IF NOT EXISTS empresas (
        id CHAR(32) PRIMARY KEY,
        rut_empresa VARCHAR(12) UNIQUE NOT NULL,
        nombre_empresa VARCHAR(255) NOT NULL,
        rubros_cpv TEXT,
        regiones TEXT,
        activo BOOLEAN NOT NULL DEFAULT 1,
        estado_habil VARCHAR(20) NOT NULL DEFAULT 'desconocido',
        estado_habil_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS empresas_usuario (
        id CHAR(32) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        empresa_id CHAR(32) NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        rol VARCHAR(20) NOT NULL DEFAULT 'owner',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(user_id, empresa_id)
    )""",
    """CREATE TABLE IF NOT EXISTS postulaciones (
        id CHAR(32) PRIMARY KEY,
        empresa_id CHAR(32) NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        licitacion_id INTEGER NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
        estado VARCHAR(30) NOT NULL DEFAULT 'en_seguimiento',
        notas TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(empresa_id, licitacion_id)
    )""",
    """CREATE TABLE IF NOT EXISTS documentos_empresa (
        id CHAR(32) PRIMARY KEY,
        empresa_id CHAR(32) NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        nombre VARCHAR(255) NOT NULL,
        tipo_documento VARCHAR(50) NOT NULL,
        s3_key VARCHAR(500) NOT NULL,
        s3_bucket VARCHAR(100) NOT NULL,
        mime_type VARCHAR(100),
        tamano_bytes BIGINT,
        fecha_emision DATE,
        fecha_vencimiento DATE,
        eliminado BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS checklist_postulacion (
        id CHAR(32) PRIMARY KEY,
        postulacion_id CHAR(32) NOT NULL REFERENCES postulaciones(id) ON DELETE CASCADE,
        descripcion VARCHAR(500) NOT NULL,
        es_obligatorio BOOLEAN NOT NULL DEFAULT 1,
        completado BOOLEAN NOT NULL DEFAULT 0,
        completado_at DATETIME,
        documento_id CHAR(32) REFERENCES documentos_empresa(id) ON DELETE SET NULL,
        orden SMALLINT NOT NULL DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS dashboard_home_cache (
        empresa_id CHAR(32) PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
        matches TEXT NOT NULL DEFAULT '[]',
        matches_count INTEGER NOT NULL DEFAULT 0,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        alert_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        title VARCHAR(500) NOT NULL,
        message TEXT,
        alert_metadata TEXT,
        notification_channels TEXT,
        sent_at DATETIME,
        read_at DATETIME,
        idempotency_key VARCHAR(255) UNIQUE,
        empresa_id CHAR(32),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
    )""",
]


@pytest_asyncio.fixture(scope="function")
async def async_engine():
    eng = create_async_engine(ASYNC_TEST_URL, future=True)
    async with eng.begin() as conn:
        for ddl in _ASYNC_DDL:
            await conn.execute(text(ddl))
    yield eng
    async with eng.begin() as conn:
        # Drop all in reverse dependency order
        for tbl in [
            "checklist_postulacion", "alerts", "dashboard_home_cache",
            "documentos_empresa", "postulaciones", "empresas_usuario",
            "empresas", "licitaciones", "buyer_organizations", "users",
        ]:
            await conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
    await eng.dispose()


@pytest_asyncio.fixture(scope="function")
async def async_db(async_engine) -> AsyncSession:
    SessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def sample_user(async_db: AsyncSession) -> User:
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="x",
        full_name="Test User",
        is_active=True,
        plan_tier="paid",
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_empresa(async_db: AsyncSession, sample_user: User) -> Empresa:
    empresa = Empresa(
        rut_empresa="76543210-K",
        nombre_empresa="Constructora Test",
        estado_habil="habil",
    )
    async_db.add(empresa)
    await async_db.flush()
    membership = EmpresaUsuario(
        user_id=sample_user.id,
        empresa_id=empresa.id,
        rol="owner",
    )
    async_db.add(membership)
    await async_db.commit()
    await async_db.refresh(empresa)
    return empresa


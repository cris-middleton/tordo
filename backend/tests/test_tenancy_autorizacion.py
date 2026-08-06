"""Tests funcionales de aislamiento entre empresas.

El test estructural comprueba que las rutas *declaren* la dependencia. Estos
comprueban que la dependencia *hace lo correcto*: que un usuario ajeno reciba
403, que un `viewer` no pueda escribir, y que el contexto lleve el rol real.

Necesitan Postgres (las tablas usan UUID y ARRAY). Se saltan en local sin base;
en CI son obligatorios.
"""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.deps import ROLES_ESCRITURA, EmpresaContext, require_rol, verificar_acceso_empresa
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User

IN_CI = os.getenv("CI", "").lower() in ("1", "true")


def _url_async() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return (
        url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://")
        else url
    )


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine(_url_async())
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1 FROM users LIMIT 1"))
    except Exception as exc:  # noqa: BLE001
        await engine.dispose()
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__}) — usa `make dev-up-d`")

    sesion = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sesion() as s:
        yield s
        await s.rollback()
    await engine.dispose()


async def _crear_usuario(db: AsyncSession, sufijo: str) -> User:
    u = User(
        email=f"tenancy-{sufijo}-{uuid.uuid4().hex[:8]}@test.cl",
        username=f"tenancy-{sufijo}-{uuid.uuid4().hex[:8]}",
        hashed_password="x",
        is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


async def _crear_empresa(db: AsyncSession, dueño: User, rol: str = "owner") -> Empresa:
    e = Empresa(
        rut_empresa=f"{uuid.uuid4().int % 89999999 + 10000000}-K"[:12],
        nombre_empresa="Empresa de prueba",
    )
    db.add(e)
    await db.flush()
    db.add(EmpresaUsuario(user_id=dueño.id, empresa_id=e.id, rol=rol))
    await db.flush()
    return e


async def test_miembro_obtiene_contexto_con_su_rol(db):
    usuario = await _crear_usuario(db, "owner")
    empresa = await _crear_empresa(db, usuario, rol="owner")

    ctx = await verificar_acceso_empresa(empresa.id, usuario, db)

    assert isinstance(ctx, EmpresaContext)
    assert ctx.empresa_id == empresa.id
    assert ctx.rol == "owner"
    assert ctx.puede_escribir is True
    assert ctx.es_owner is True


async def test_usuario_ajeno_recibe_403(db):
    """El caso que importa: sin esto, adivinar un UUID daba acceso."""
    dueño = await _crear_usuario(db, "dueño")
    empresa = await _crear_empresa(db, dueño)
    ajeno = await _crear_usuario(db, "ajeno")

    with pytest.raises(HTTPException) as exc:
        await verificar_acceso_empresa(empresa.id, ajeno, db)

    assert exc.value.status_code == 403
    assert "Sin acceso" in exc.value.detail


async def test_empresa_inexistente_da_403_y_no_404(db):
    """Devolver 404 revelaría qué UUIDs existen. 403 no filtra nada."""
    usuario = await _crear_usuario(db, "curioso")

    with pytest.raises(HTTPException) as exc:
        await verificar_acceso_empresa(uuid.uuid4(), usuario, db)

    assert exc.value.status_code == 403


async def test_viewer_no_puede_escribir(db):
    usuario = await _crear_usuario(db, "viewer")
    empresa = await _crear_empresa(db, usuario, rol="viewer")

    ctx = await verificar_acceso_empresa(empresa.id, usuario, db)
    assert ctx.rol == "viewer"
    assert ctx.puede_escribir is False

    dep = require_rol(*ROLES_ESCRITURA)
    with pytest.raises(HTTPException) as exc:
        await dep(ctx=ctx)
    assert exc.value.status_code == 403


async def test_admin_escribe_pero_no_es_owner(db):
    usuario = await _crear_usuario(db, "admin")
    empresa = await _crear_empresa(db, usuario, rol="admin")

    ctx = await verificar_acceso_empresa(empresa.id, usuario, db)
    assert ctx.puede_escribir is True
    assert ctx.es_owner is False

    # Pasa el gate de escritura...
    assert await require_rol("owner", "admin")(ctx=ctx) is ctx
    # ...pero no el de owner (eliminar la empresa).
    with pytest.raises(HTTPException) as exc:
        await require_rol("owner")(ctx=ctx)
    assert exc.value.status_code == 403


async def test_pertenecer_a_una_empresa_no_da_acceso_a_otra(db):
    """Aislamiento entre inquilinos, que es el punto de todo esto."""
    usuario = await _crear_usuario(db, "multi")
    propia = await _crear_empresa(db, usuario)

    otro = await _crear_usuario(db, "otro")
    ajena = await _crear_empresa(db, otro)

    assert (await verificar_acceso_empresa(propia.id, usuario, db)).empresa_id == propia.id

    with pytest.raises(HTTPException) as exc:
        await verificar_acceso_empresa(ajena.id, usuario, db)
    assert exc.value.status_code == 403

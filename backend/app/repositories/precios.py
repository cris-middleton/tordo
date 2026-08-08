"""Acceso a las suscripciones de precio."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.precio import TABLA_BANDAS, SuscripcionPrecio


async def unidad_predominante(db: AsyncSession, codigo_producto: str) -> str:
    """La unidad en la que más se compra ese producto.

    La unidad forma parte de la identidad del precio —el mismo producto en
    'Unidad' y en 'Caja' vale cosas distintas—, pero el usuario que pulsa
    «vigilar» busca un producto, no una unidad. Suscribir con la unidad vacía
    dejaría una vigilancia que **no puede coincidir nunca** con los datos
    reales: una función que no hace nada y no lo dice.

    Si la tabla de analytics todavía no está materializada devuelve `""`, que es
    la clave que usan los productos sin unidad declarada.
    """
    existe = (await db.execute(text(f"SELECT to_regclass('{TABLA_BANDAS}')"))).scalar()
    if existe is None:
        # `to_regclass` devuelve NULL en vez de reventar: consultar la tabla
        # directamente abortaría la transacción y con ella el alta.
        return ""

    fila = (
        await db.execute(
            text(f"""
                SELECT COALESCE("UnidadMedida", '') AS unidad
                FROM {TABLA_BANDAS}
                WHERE "codigoProductoONU" = :codigo AND p50 IS NOT NULL
                GROUP BY 1
                ORDER BY SUM(n) DESC NULLS LAST
                LIMIT 1
            """),
            {"codigo": codigo_producto},
        )
    ).first()
    return fila.unidad if fila else ""


async def listar(db: AsyncSession, empresa_id: UUID) -> list[SuscripcionPrecio]:
    return list(
        (
            await db.execute(
                select(SuscripcionPrecio)
                .where(SuscripcionPrecio.empresa_id == empresa_id)
                .order_by(SuscripcionPrecio.creada_en.desc())
            )
        )
        .scalars()
        .all()
    )


async def buscar(
    db: AsyncSession, empresa_id: UUID, codigo_producto: str, unidad_medida: str
) -> SuscripcionPrecio | None:
    """Sostiene «una suscripción por empresa y producto».

    Sin esta comprobación, suscribirse dos veces al mismo producto duplicaría
    todas las alertas de ese producto.
    """
    return (
        await db.execute(
            select(SuscripcionPrecio).where(
                SuscripcionPrecio.empresa_id == empresa_id,
                SuscripcionPrecio.codigo_producto == codigo_producto,
                SuscripcionPrecio.unidad_medida == unidad_medida,
            )
        )
    ).scalar_one_or_none()


async def obtener(
    db: AsyncSession, suscripcion_id: int, empresa_id: UUID
) -> SuscripcionPrecio | None:
    """Acotada a su empresa: sin ese filtro se podría borrar la de otra."""
    return (
        await db.execute(
            select(SuscripcionPrecio).where(
                SuscripcionPrecio.id == suscripcion_id,
                SuscripcionPrecio.empresa_id == empresa_id,
            )
        )
    ).scalar_one_or_none()

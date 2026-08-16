"""Acceso a los competidores vigilados.

Los routers hacen HTTP y autorización; **no arman consultas**. La regla la
comprueba `tests/test_capas_sin_sql_en_routers.py` fichero a fichero, y cazó
este módulo antes de que existiera: los tres endpoints de competidores nacieron
con su `select()` dentro del router.

El motivo de la regla, con nombre y apellido: mover cada filtro repetido a un
solo sitio destapó que `Alert.user_id` estaba escrito seis veces y
`documento.eliminado` cuatro — y que en uno de esos sitios faltaba. Aquí el
filtro que no puede faltar nunca es `empresa_id`: sin él, cualquiera podría
borrar el seguimiento de otra empresa pasando su identificador.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.competidor import CompetidorSeguido


async def listar(db: AsyncSession, empresa_id: UUID) -> list[CompetidorSeguido]:
    filas = await db.execute(
        select(CompetidorSeguido)
        .where(CompetidorSeguido.empresa_id == empresa_id)
        .order_by(CompetidorSeguido.creada_en.desc())
    )
    return list(filas.scalars().all())


async def buscar(db: AsyncSession, empresa_id: UUID, rut_norm: str) -> CompetidorSeguido | None:
    filas = await db.execute(
        select(CompetidorSeguido).where(
            CompetidorSeguido.empresa_id == empresa_id,
            CompetidorSeguido.rut_norm == rut_norm,
        )
    )
    return filas.scalar_one_or_none()


async def obtener(
    db: AsyncSession, competidor_id: int, empresa_id: UUID
) -> CompetidorSeguido | None:
    """Un seguimiento **de esa empresa**.

    El `empresa_id` va en el WHERE y no en una comprobación posterior: es lo que
    impide borrar el seguimiento de otra empresa pasando su identificador, y
    ponerlo aquí significa que no se puede olvidar en el endpoint.
    """
    filas = await db.execute(
        select(CompetidorSeguido).where(
            CompetidorSeguido.id == competidor_id,
            CompetidorSeguido.empresa_id == empresa_id,
        )
    )
    return filas.scalar_one_or_none()

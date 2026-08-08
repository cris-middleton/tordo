"""Acceso a postulaciones y a su checklist.

La postulación se carga **siempre con su checklist** (`selectinload`). Sin eso,
serializarla dispara una consulta por ítem al tocar la relación ya fuera de la
sesión async — y en async eso no es lento, es un error en tiempo de ejecución.
Tenerlo en una función y no repetido en cuatro endpoints evita que el quinto se
escriba sin él.

**El aislamiento por empresa NO se hace aquí.** Estas funciones cargan por id y
devuelven lo que encuentran; quien llama comprueba el acceso con
`verificar_acceso_empresa` usando el `empresa_id` de la entidad ya cargada. Es
deliberado: el `empresa_id` no viene en la URL, así que la comprobación necesita
la fila, y meterla dentro escondería la única verificación que importa.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.postulacion import ChecklistPostulacion, PlantillaChecklist, Postulacion


async def obtener(db: AsyncSession, postulacion_id: UUID) -> Postulacion | None:
    """La postulación con su checklist cargado."""
    return (
        await db.execute(
            select(Postulacion)
            .options(selectinload(Postulacion.checklist))
            .where(Postulacion.id == postulacion_id)
        )
    ).scalar_one_or_none()


async def buscar_de_empresa_para_licitacion(
    db: AsyncSession, empresa_id: UUID, licitacion_id: int
) -> Postulacion | None:
    """La postulación existente para ese par, si la hay.

    Sostiene la regla de «una postulación por empresa y licitación»: sin esta
    comprobación, pulsar dos veces «postular» crearía dos checklists paralelos.
    """
    return (
        await db.execute(
            select(Postulacion).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.licitacion_id == licitacion_id,
            )
        )
    ).scalar_one_or_none()


async def listar_de_empresa(
    db: AsyncSession, empresa_id: UUID, *, estado: str | None = None
) -> list[Postulacion]:
    """Las postulaciones de la empresa, con checklist y licitación cargados."""
    consulta = (
        select(Postulacion)
        .options(selectinload(Postulacion.checklist), selectinload(Postulacion.licitacion))
        .where(Postulacion.empresa_id == empresa_id)
    )
    if estado:
        consulta = consulta.where(Postulacion.estado == estado)
    return list(
        (await db.execute(consulta.order_by(Postulacion.created_at.desc()))).scalars().all()
    )


async def obtener_item_checklist(
    db: AsyncSession, item_id: UUID, postulacion_id: UUID
) -> ChecklistPostulacion | None:
    """El ítem, **acotado a su postulación**.

    Sin el segundo filtro, un id de ítem de otra postulación se podría marcar
    desde la propia — el acceso se comprobó sobre la postulación de la URL, no
    sobre la del ítem.
    """
    return (
        await db.execute(
            select(ChecklistPostulacion).where(
                ChecklistPostulacion.id == item_id,
                ChecklistPostulacion.postulacion_id == postulacion_id,
            )
        )
    ).scalar_one_or_none()


async def plantilla_de_checklist(db: AsyncSession, tipo: str) -> list[PlantillaChecklist]:
    """Los ítems de plantilla que aplican a un tipo de licitación.

    Incluye los `GENERICO`, que valen para todos los tipos, y los ordena
    **primero los específicos**: el orden del `desc()` sobre el tipo no es
    estético, decide qué ve primero quien está preparando la postulación.
    """
    return list(
        (
            await db.execute(
                select(PlantillaChecklist)
                .where(
                    PlantillaChecklist.tipo_licitacion.in_([tipo, "GENERICO"]),
                    PlantillaChecklist.activo.is_(True),
                )
                .order_by(PlantillaChecklist.tipo_licitacion.desc(), PlantillaChecklist.orden)
            )
        )
        .scalars()
        .all()
    )

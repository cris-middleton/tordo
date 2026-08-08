"""Acceso a los documentos de una empresa.

El borrado es **lógico**: `eliminado = True`, la fila se queda. Es lo correcto
—un documento puede estar referenciado desde el checklist de una postulación ya
enviada— pero significa que **toda** consulta de lectura tiene que filtrar por
`eliminado.is_(False)`, y ese filtro estaba escrito a mano en cada endpoint.

Olvidarlo no rompe nada visible: simplemente reaparecen documentos que el
usuario creía borrados, con su enlace de descarga incluido.

Aquí la única función que ve documentos eliminados es la de borrar, y lo dice en
su nombre.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empresa import DocumentoEmpresa


async def listar_de_empresa(db: AsyncSession, empresa_id: UUID) -> list[DocumentoEmpresa]:
    """Los documentos vigentes de la empresa, del más nuevo al más viejo."""
    return list(
        (
            await db.execute(
                select(DocumentoEmpresa)
                .where(
                    DocumentoEmpresa.empresa_id == empresa_id,
                    DocumentoEmpresa.eliminado.is_(False),
                )
                .order_by(DocumentoEmpresa.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def obtener_vigente(
    db: AsyncSession, doc_id: UUID, empresa_id: UUID
) -> DocumentoEmpresa | None:
    """Un documento vigente, **acotado a su empresa**.

    Los dos filtros importan: sin el de empresa se descargaría el documento de
    otra; sin el de `eliminado`, uno que el usuario ya borró.
    """
    return (
        await db.execute(
            select(DocumentoEmpresa).where(
                DocumentoEmpresa.id == doc_id,
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
            )
        )
    ).scalar_one_or_none()


async def obtener_incluso_eliminado(
    db: AsyncSession, doc_id: UUID, empresa_id: UUID
) -> DocumentoEmpresa | None:
    """Para borrar: borrar dos veces el mismo documento no debe dar 404.

    Es la única función que devuelve documentos ya eliminados, y lo dice en el
    nombre para que no se use por descuido en una lectura.
    """
    return (
        await db.execute(
            select(DocumentoEmpresa).where(
                DocumentoEmpresa.id == doc_id,
                DocumentoEmpresa.empresa_id == empresa_id,
            )
        )
    ).scalar_one_or_none()

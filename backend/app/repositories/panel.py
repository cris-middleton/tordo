"""Los conteos de la portada operativa.

Cinco números que la pantalla pide de una vez. Viven juntos porque comparten una
propiedad que no se ve al leerlos por separado: **cada uno responde a un sujeto
distinto**. Las licitaciones y las órdenes son del catálogo entero; las alertas,
del usuario; las postulaciones y los documentos, de sus empresas.

Tenerlos en un router invitaba a copiar el filtro del de al lado.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertStatus
from app.models.empresa import DocumentoEmpresa
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
from app.models.postulacion import Postulacion

# Estados en los que una postulación sigue viva. Adjudicada, no adjudicada y
# descartada ya no piden trabajo, así que no cuentan como "activas".
ESTADOS_ACTIVOS = ("en_seguimiento", "en_preparacion", "enviada")

# Con cuánta antelación se avisa de un documento por vencer. Un mes es lo que
# tarda en la práctica renovar un certificado en Chile.
DIAS_DE_AVISO = 30


async def _contar(db: AsyncSession, consulta) -> int:
    return int((await db.execute(consulta)).scalar() or 0)


async def licitaciones_publicadas(db: AsyncSession) -> int:
    """Del catálogo entero, no de la empresa: es el tamaño del mercado abierto."""
    return await _contar(
        db,
        select(func.count(Licitacion.id)).where(
            Licitacion.activo.is_(True), Licitacion.estado == "Publicada"
        ),
    )


async def ordenes_en_proceso(db: AsyncSession) -> int:
    return await _contar(
        db, select(func.count(OrdenCompra.id)).where(OrdenCompra.estado == "En proceso")
    )


async def alertas_no_leidas(db: AsyncSession, usuario_id: int) -> int:
    """Del USUARIO. Las alertas son personales, no de la empresa."""
    return await _contar(
        db,
        select(func.count(Alert.id)).where(
            Alert.user_id == usuario_id, Alert.status != AlertStatus.READ
        ),
    )


async def postulaciones_activas(db: AsyncSession, empresa_ids: list[UUID]) -> int:
    if not empresa_ids:
        return 0
    return await _contar(
        db,
        select(func.count(Postulacion.id)).where(
            Postulacion.empresa_id.in_(empresa_ids),
            Postulacion.estado.in_(ESTADOS_ACTIVOS),
        ),
    )


async def documentos_por_vencer(db: AsyncSession, empresa_ids: list[UUID]) -> int:
    """Los que vencen dentro de la ventana de aviso y **todavía no han vencido**.

    El límite inferior importa: sin él, un certificado caducado hace tres años
    seguiría contando como «por vencer» para siempre.
    """
    if not empresa_ids:
        return 0
    hoy = date.today()
    return await _contar(
        db,
        select(func.count(DocumentoEmpresa.id)).where(
            DocumentoEmpresa.empresa_id.in_(empresa_ids),
            DocumentoEmpresa.eliminado.is_(False),
            DocumentoEmpresa.fecha_vencimiento.isnot(None),
            DocumentoEmpresa.fecha_vencimiento <= hoy + timedelta(days=DIAS_DE_AVISO),
            DocumentoEmpresa.fecha_vencimiento >= hoy,
        ),
    )

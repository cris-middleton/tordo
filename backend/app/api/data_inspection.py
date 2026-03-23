"""API endpoints for inspecting ETL data"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.db import get_db
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra

router = APIRouter(prefix="/api/data", tags=["data-inspection"])


def model_to_dict(record, model_class) -> Dict[str, Any]:
    result = {}
    for column in model_class.__table__.columns:
        value = getattr(record, column.name)
        if isinstance(value, datetime):
            result[column.name] = value.isoformat()
        elif hasattr(value, '__float__') and not isinstance(value, (int, float, str, bool, type(None))):
            result[column.name] = float(value)
        else:
            result[column.name] = value
    if hasattr(record, 'detalle') and record.detalle:
        detalle_dict = {}
        for column in record.detalle.__table__.columns:
            value = getattr(record.detalle, column.name)
            if isinstance(value, datetime):
                detalle_dict[column.name] = value.isoformat()
            elif hasattr(value, '__float__') and not isinstance(value, (int, float, str, bool, type(None))):
                detalle_dict[column.name] = float(value)
            else:
                detalle_dict[column.name] = value
        result['detalle'] = detalle_dict
    return result


def get_table_structure(model_class) -> List[Dict[str, Any]]:
    """Get table structure — uses SQLAlchemy mapper inspection, no DB query needed."""
    inspector = inspect(model_class)
    return [
        {
            'name': col.name,
            'type': str(col.type),
            'nullable': col.nullable,
            'primary_key': col.primary_key,
            'default': str(col.default.arg) if col.default and hasattr(col.default, 'arg') else None,
        }
        for col in inspector.columns
    ]


@router.get("/tables")
async def list_tables():
    return {"tables": [{"name": "licitaciones", "description": "Public tenders", "endpoint": "/api/data/licitaciones"}, {"name": "ordenes_compra", "description": "Purchase orders", "endpoint": "/api/data/ordenes_compra"}]}


@router.get("/licitaciones/structure")
async def get_licitaciones_structure():
    return {"table": "licitaciones", "columns": get_table_structure(Licitacion)}


@router.get("/licitaciones")
async def get_licitaciones(
    db: AsyncSession = Depends(get_db),
    limit: Optional[int] = Query(None, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0),
    codigo_externo: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    codigo_organismo: Optional[str] = Query(None),
):
    stmt = select(Licitacion)
    if codigo_externo:
        stmt = stmt.where(Licitacion.codigo_externo == codigo_externo)
    if estado:
        stmt = stmt.where(Licitacion.estado == estado)
    if codigo_organismo:
        stmt = stmt.where(Licitacion.codigo_organismo == codigo_organismo)

    total_count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0

    if limit:
        stmt = stmt.limit(limit)
    if offset:
        stmt = stmt.offset(offset)

    records = (await db.execute(stmt)).scalars().all()
    return {"table": "licitaciones", "total_count": total_count, "returned_count": len(records), "limit": limit, "offset": offset, "data": [model_to_dict(r, Licitacion) for r in records]}


@router.get("/licitaciones/stats")
async def get_licitaciones_stats(db: AsyncSession = Depends(get_db)):
    total_count = (await db.execute(select(func.count(Licitacion.id)))).scalar() or 0
    estado_counts = (await db.execute(select(Licitacion.estado, func.count(Licitacion.id).label('count')).group_by(Licitacion.estado))).all()
    organismo_counts = (await db.execute(select(Licitacion.codigo_organismo, func.count(Licitacion.id).label('count')).group_by(Licitacion.codigo_organismo).limit(10))).all()
    date_range = (await db.execute(select(func.min(Licitacion.fecha_publicacion).label('min_date'), func.max(Licitacion.fecha_publicacion).label('max_date')))).one_or_none()
    total_amount = (await db.execute(select(func.sum(Licitacion.monto_total)))).scalar() or 0
    return {"table": "licitaciones", "total_count": total_count, "estado_distribution": {e: c for e, c in estado_counts}, "top_organismos": {o: c for o, c in organismo_counts}, "date_range": {"min": date_range.min_date.isoformat() if date_range and date_range.min_date else None, "max": date_range.max_date.isoformat() if date_range and date_range.max_date else None}, "total_amount": float(total_amount)}


@router.get("/ordenes_compra/structure")
async def get_ordenes_compra_structure():
    return {"table": "ordenes_compra", "columns": get_table_structure(OrdenCompra)}


@router.get("/ordenes_compra")
async def get_ordenes_compra(
    db: AsyncSession = Depends(get_db),
    limit: Optional[int] = Query(None, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0),
    codigo_oc: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    codigo_organismo: Optional[str] = Query(None),
    codigo_proveedor: Optional[str] = Query(None),
):
    stmt = select(OrdenCompra).options(selectinload(OrdenCompra.detalle))
    if codigo_oc:
        stmt = stmt.where(OrdenCompra.codigo_oc == codigo_oc)
    if estado:
        stmt = stmt.where(OrdenCompra.estado == estado)
    if codigo_organismo:
        stmt = stmt.where(OrdenCompra.codigo_organismo == codigo_organismo)
    if codigo_proveedor:
        stmt = stmt.where(OrdenCompra.codigo_proveedor == codigo_proveedor)

    total_count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0

    if limit:
        stmt = stmt.limit(limit)
    if offset:
        stmt = stmt.offset(offset)

    records = (await db.execute(stmt)).scalars().all()
    return {"table": "ordenes_compra", "total_count": total_count, "returned_count": len(records), "limit": limit, "offset": offset, "data": [model_to_dict(r, OrdenCompra) for r in records]}


@router.get("/ordenes_compra/stats")
async def get_ordenes_compra_stats(db: AsyncSession = Depends(get_db)):
    total_count = (await db.execute(select(func.count(OrdenCompra.id)))).scalar() or 0
    estado_counts = (await db.execute(select(OrdenCompra.estado, func.count(OrdenCompra.id).label('count')).group_by(OrdenCompra.estado))).all()
    organismo_counts = (await db.execute(select(OrdenCompra.codigo_organismo, func.count(OrdenCompra.id).label('count')).group_by(OrdenCompra.codigo_organismo).limit(10))).all()
    proveedor_counts = (await db.execute(select(OrdenCompra.codigo_proveedor, func.count(OrdenCompra.id).label('count')).group_by(OrdenCompra.codigo_proveedor).limit(10))).all()
    date_range = (await db.execute(select(func.min(OrdenCompra.fecha_publicacion).label('min_date'), func.max(OrdenCompra.fecha_publicacion).label('max_date')))).one_or_none()
    total_amount = (await db.execute(select(func.sum(OrdenCompra.monto_total)))).scalar() or 0
    return {"table": "ordenes_compra", "total_count": total_count, "returned_count": 0, "estado_distribution": {e: c for e, c in estado_counts}, "top_organismos": {o: c for o, c in organismo_counts}, "top_proveedores": {p: c for p, c in proveedor_counts}, "date_range": {"min": date_range.min_date.isoformat() if date_range and date_range.min_date else None, "max": date_range.max_date.isoformat() if date_range and date_range.max_date else None}, "total_amount": float(total_amount)}


@router.get("/summary")
async def get_data_summary(db: AsyncSession = Depends(get_db)):
    licitaciones_count = (await db.execute(select(func.count(Licitacion.id)))).scalar() or 0
    ordenes_count = (await db.execute(select(func.count(OrdenCompra.id)))).scalar() or 0
    licitaciones_total = (await db.execute(select(func.sum(Licitacion.monto_total)))).scalar() or 0
    ordenes_total = (await db.execute(select(func.sum(OrdenCompra.monto_total)))).scalar() or 0
    return {"summary": {"licitaciones": {"count": licitaciones_count, "total_amount": float(licitaciones_total)}, "ordenes_compra": {"count": ordenes_count, "total_amount": float(ordenes_total)}}, "last_updated": datetime.utcnow().isoformat()}

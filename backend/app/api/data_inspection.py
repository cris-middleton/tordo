"""
API endpoints for inspecting ETL data
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, inspect
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from app.db import get_db
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra

router = APIRouter(prefix="/api/data", tags=["data-inspection"])


def model_to_dict(record, model_class) -> Dict[str, Any]:
    """Convert SQLAlchemy model to dictionary"""
    result = {}
    for column in model_class.__table__.columns:
        value = getattr(record, column.name)
        # Convert datetime to ISO format
        if isinstance(value, datetime):
            result[column.name] = value.isoformat()
        # Convert Decimal to float for JSON serialization
        elif hasattr(value, '__float__') and not isinstance(value, (int, float, str, bool, type(None))):
            result[column.name] = float(value)
        else:
            result[column.name] = value
    
    # Include detalle information if available
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


def get_table_structure(db: Session, model_class) -> List[Dict[str, Any]]:
    """Get table structure information"""
    inspector = inspect(model_class)
    columns = []
    for column in inspector.columns:
        columns.append({
            'name': column.name,
            'type': str(column.type),
            'nullable': column.nullable,
            'primary_key': column.primary_key,
            'default': str(column.default.arg) if column.default and hasattr(column.default, 'arg') else None
        })
    return columns


@router.get("/tables")
async def list_tables():
    """List all available ETL tables"""
    return {
        "tables": [
            {
                "name": "licitaciones",
                "description": "Public tenders (Licitaciones)",
                "endpoint": "/api/data/licitaciones"
            },
            {
                "name": "ordenes_compra",
                "description": "Purchase orders (Órdenes de Compra)",
                "endpoint": "/api/data/ordenes_compra"
            }
        ]
    }


@router.get("/licitaciones/structure")
async def get_licitaciones_structure(db: Session = Depends(get_db)):
    """Get the structure of the licitaciones table"""
    return {
        "table": "licitaciones",
        "columns": get_table_structure(db, Licitacion)
    }


@router.get("/licitaciones")
async def get_licitaciones(
    db: Session = Depends(get_db),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Limit number of records"),
    offset: Optional[int] = Query(0, ge=0, description="Offset for pagination"),
    codigo_externo: Optional[str] = Query(None, description="Filter by codigo_externo"),
    estado: Optional[str] = Query(None, description="Filter by estado"),
    codigo_organismo: Optional[str] = Query(None, description="Filter by codigo_organismo")
):
    """Get all licitaciones with optional filters"""
    query = db.query(Licitacion)
    
    # Apply filters
    if codigo_externo:
        query = query.filter(Licitacion.codigo_externo == codigo_externo)
    if estado:
        query = query.filter(Licitacion.estado == estado)
    if codigo_organismo:
        query = query.filter(Licitacion.codigo_organismo == codigo_organismo)
    
    # Get total count
    total_count = query.count()
    
    # Apply pagination
    if limit:
        query = query.limit(limit)
    if offset:
        query = query.offset(offset)
    
    records = query.all()
    
    # Convert to dictionaries
    data = [model_to_dict(record, Licitacion) for record in records]
    
    return {
        "table": "licitaciones",
        "total_count": total_count,
        "returned_count": len(data),
        "limit": limit,
        "offset": offset,
        "data": data
    }


@router.get("/licitaciones/stats")
async def get_licitaciones_stats(db: Session = Depends(get_db)):
    """Get statistics about licitaciones table"""
    total_count = db.query(Licitacion).count()
    
    # Count by estado
    estado_counts = db.query(
        Licitacion.estado,
        func.count(Licitacion.id).label('count')
    ).group_by(Licitacion.estado).all()
    
    # Count by organismo
    organismo_counts = db.query(
        Licitacion.codigo_organismo,
        func.count(Licitacion.id).label('count')
    ).group_by(Licitacion.codigo_organismo).limit(10).all()
    
    # Date range
    date_range = db.query(
        func.min(Licitacion.fecha_publicacion).label('min_date'),
        func.max(Licitacion.fecha_publicacion).label('max_date')
    ).first()
    
    # Total amount
    total_amount = db.query(func.sum(Licitacion.monto_total)).scalar() or 0
    
    return {
        "table": "licitaciones",
        "total_count": total_count,
        "estado_distribution": {estado: count for estado, count in estado_counts},
        "top_organismos": {org: count for org, count in organismo_counts},
        "date_range": {
            "min": date_range.min_date.isoformat() if date_range.min_date else None,
            "max": date_range.max_date.isoformat() if date_range.max_date else None
        },
        "total_amount": float(total_amount)
    }


@router.get("/ordenes_compra/structure")
async def get_ordenes_compra_structure(db: Session = Depends(get_db)):
    """Get the structure of the ordenes_compra table"""
    return {
        "table": "ordenes_compra",
        "columns": get_table_structure(db, OrdenCompra)
    }


@router.get("/ordenes_compra")
async def get_ordenes_compra(
    db: Session = Depends(get_db),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Limit number of records"),
    offset: Optional[int] = Query(0, ge=0, description="Offset for pagination"),
    codigo_oc: Optional[str] = Query(None, description="Filter by codigo_oc"),
    estado: Optional[str] = Query(None, description="Filter by estado"),
    codigo_organismo: Optional[str] = Query(None, description="Filter by codigo_organismo"),
    codigo_proveedor: Optional[str] = Query(None, description="Filter by codigo_proveedor")
):
    """Get all ordenes de compra with optional filters"""
    query = db.query(OrdenCompra).options(joinedload(OrdenCompra.detalle))
    
    # Apply filters
    if codigo_oc:
        query = query.filter(OrdenCompra.codigo_oc == codigo_oc)
    if estado:
        query = query.filter(OrdenCompra.estado == estado)
    if codigo_organismo:
        query = query.filter(OrdenCompra.codigo_organismo == codigo_organismo)
    if codigo_proveedor:
        query = query.filter(OrdenCompra.codigo_proveedor == codigo_proveedor)
    
    # Get total count
    total_count = query.count()
    
    # Apply pagination
    if limit:
        query = query.limit(limit)
    if offset:
        query = query.offset(offset)
    
    records = query.all()
    
    # Convert to dictionaries
    data = [model_to_dict(record, OrdenCompra) for record in records]
    
    return {
        "table": "ordenes_compra",
        "total_count": total_count,
        "returned_count": len(data),
        "limit": limit,
        "offset": offset,
        "data": data
    }


@router.get("/ordenes_compra/stats")
async def get_ordenes_compra_stats(db: Session = Depends(get_db)):
    """Get statistics about ordenes_compra table"""
    total_count = db.query(OrdenCompra).count()
    
    # Count by estado
    estado_counts = db.query(
        OrdenCompra.estado,
        func.count(OrdenCompra.id).label('count')
    ).group_by(OrdenCompra.estado).all()
    
    # Count by organismo
    organismo_counts = db.query(
        OrdenCompra.codigo_organismo,
        func.count(OrdenCompra.id).label('count')
    ).group_by(OrdenCompra.codigo_organismo).limit(10).all()
    
    # Count by proveedor
    proveedor_counts = db.query(
        OrdenCompra.codigo_proveedor,
        func.count(OrdenCompra.id).label('count')
    ).group_by(OrdenCompra.codigo_proveedor).limit(10).all()
    
    # Date range
    date_range = db.query(
        func.min(OrdenCompra.fecha_publicacion).label('min_date'),
        func.max(OrdenCompra.fecha_publicacion).label('max_date')
    ).first()
    
    # Total amount
    total_amount = db.query(func.sum(OrdenCompra.monto_total)).scalar() or 0
    
    return {
        "table": "ordenes_compra",
        "total_count": total_count,
        "estado_distribution": {estado: count for estado, count in estado_counts},
        "top_organismos": {org: count for org, count in organismo_counts},
        "top_proveedores": {prov: count for prov, count in proveedor_counts},
        "date_range": {
            "min": date_range.min_date.isoformat() if date_range.min_date else None,
            "max": date_range.max_date.isoformat() if date_range.max_date else None
        },
        "total_amount": float(total_amount)
    }


@router.get("/summary")
async def get_data_summary(db: Session = Depends(get_db)):
    """Get summary of all ETL data"""
    licitaciones_count = db.query(Licitacion).count()
    ordenes_count = db.query(OrdenCompra).count()
    
    licitaciones_total = db.query(func.sum(Licitacion.monto_total)).scalar() or 0
    ordenes_total = db.query(func.sum(OrdenCompra.monto_total)).scalar() or 0
    
    return {
        "summary": {
            "licitaciones": {
                "count": licitaciones_count,
                "total_amount": float(licitaciones_total)
            },
            "ordenes_compra": {
                "count": ordenes_count,
                "total_amount": float(ordenes_total)
            }
        },
        "last_updated": datetime.utcnow().isoformat()
    }


from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_
from typing import Optional, List
from datetime import datetime
from app.db import get_db
from app.models.licitacion import Licitacion
from app.core.security import get_current_active_user
from app.models.user import User
from app.schemas.tender import TenderResponse, TenderListResponse

router = APIRouter(prefix="/api/tenders", tags=["tenders"])


@router.get("/", response_model=TenderListResponse)
async def list_tenders(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(20, ge=1, le=100, alias="limit"),
    estado: Optional[str] = None,
    codigo_organismo: Optional[str] = None,
    region: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List tenders with filtering and pagination"""
    query = db.query(Licitacion).options(joinedload(Licitacion.detalle)).filter(Licitacion.activo == True)
    
    # Apply filters
    if estado:
        query = query.filter(Licitacion.estado == estado)
    if codigo_organismo:
        query = query.filter(Licitacion.codigo_organismo == codigo_organismo)
    if region:
        query = query.filter(Licitacion.region == region)
    if min_amount:
        query = query.filter(Licitacion.monto_estimado >= min_amount)
    if max_amount:
        query = query.filter(Licitacion.monto_estimado <= max_amount)
    if search:
        search_filter = or_(
            Licitacion.nombre.ilike(f"%{search}%"),
            Licitacion.descripcion.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    items = query.order_by(Licitacion.fecha_publicacion.desc()).offset(skip).limit(limit).all()
    
    # Calculate pages
    pages = (total + limit - 1) // limit if limit > 0 else 0
    page = (skip // limit) + 1 if limit > 0 else 1
    
    return TenderListResponse(
        items=items,
        total=total,
        page=page,
        size=limit,
        pages=pages,
    )


@router.get("/{tender_id}", response_model=TenderResponse)
async def get_tender(
    tender_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get tender by ID"""
    tender = db.query(Licitacion).options(joinedload(Licitacion.detalle)).filter(
        Licitacion.id == tender_id,
        Licitacion.activo == True
    ).first()
    
    if not tender:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tender not found"
        )
    
    return tender


@router.get("/codigo/{codigo_externo}", response_model=TenderResponse)
async def get_tender_by_code(
    codigo_externo: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get tender by external code"""
    tender = db.query(Licitacion).options(joinedload(Licitacion.detalle)).filter(
        Licitacion.codigo_externo == codigo_externo,
        Licitacion.activo == True
    ).first()
    
    if not tender:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tender not found"
        )
    
    return tender


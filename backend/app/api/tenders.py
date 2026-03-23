from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    stmt = select(Licitacion).options(selectinload(Licitacion.detalle)).where(Licitacion.activo == True)
    if estado:
        stmt = stmt.where(Licitacion.estado == estado)
    if codigo_organismo:
        stmt = stmt.where(Licitacion.codigo_organismo == codigo_organismo)
    if region:
        stmt = stmt.where(Licitacion.region == region)
    if min_amount:
        stmt = stmt.where(Licitacion.monto_estimado >= min_amount)
    if max_amount:
        stmt = stmt.where(Licitacion.monto_estimado <= max_amount)
    if search:
        stmt = stmt.where(
            or_(Licitacion.nombre.ilike(f"%{search}%"), Licitacion.descripcion.ilike(f"%{search}%"))
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    items = (
        await db.execute(stmt.order_by(Licitacion.fecha_publicacion.desc()).offset(skip).limit(limit))
    ).scalars().all()

    pages = (total + limit - 1) // limit if limit > 0 else 0
    page = (skip // limit) + 1 if limit > 0 else 1
    return TenderListResponse(items=items, total=total, page=page, size=limit, pages=pages)


@router.get("/{tender_id}", response_model=TenderResponse)
async def get_tender(
    tender_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    tender = (
        await db.execute(
            select(Licitacion).options(selectinload(Licitacion.detalle)).where(
                Licitacion.id == tender_id, Licitacion.activo == True
            )
        )
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender


@router.get("/codigo/{codigo_externo}", response_model=TenderResponse)
async def get_tender_by_code(
    codigo_externo: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    tender = (
        await db.execute(
            select(Licitacion).options(selectinload(Licitacion.detalle)).where(
                Licitacion.codigo_externo == codigo_externo, Licitacion.activo == True
            )
        )
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender

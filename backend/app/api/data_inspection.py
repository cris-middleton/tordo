"""API endpoints for inspecting ETL data"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, inspect, select, or_, asc, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from app.config import settings
from app.core.security import decode_access_token
from app.db import get_db
from app.models.empresa import EmpresaUsuario, TFIDFPerfil
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
from app.models.user import User

router = APIRouter(prefix="/api/data", tags=["data-inspection"])

# Optional-auth scheme: returns None on missing token rather than 401, so the
# public endpoints below keep working for unauthenticated callers.
_oauth2_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

_SEMANTIC_POOL = 200


async def _current_user_optional(
    token: Optional[str] = Depends(_oauth2_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    sub = payload.get("sub")
    try:
        user_id = int(sub) if sub is not None else None
    except (TypeError, ValueError):
        return None
    if user_id is None:
        return None
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    return user if user and user.is_active else None


def _orden_text(orden: OrdenCompra) -> str:
    return " ".join(
        filter(
            None,
            [orden.nombre, orden.nombre_organismo, orden.nombre_proveedor],
        )
    ).strip()


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
    limit: Optional[int] = Query(20, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0),
    codigo_oc: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    codigo_organismo: Optional[str] = Query(None),
    codigo_proveedor: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    empresa_id: Optional[UUID] = Query(None, description="UUID empresa — habilita score_encaje por fila"),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc"),
    current_user: Optional[User] = Depends(_current_user_optional),
):
    stmt = select(OrdenCompra).options(selectinload(OrdenCompra.detalle))
    if codigo_oc:
        stmt = stmt.where(OrdenCompra.codigo_oc == codigo_oc)
    if estado:
        stmt = stmt.where(OrdenCompra.estado == estado)
    if region:
        stmt = stmt.where(OrdenCompra.region == region)
    if codigo_organismo:
        stmt = stmt.where(OrdenCompra.codigo_organismo == codigo_organismo)
    if codigo_proveedor:
        stmt = stmt.where(OrdenCompra.codigo_proveedor == codigo_proveedor)

    terms = [t.strip() for t in (search or "").split() if t.strip()]
    want_relevance = sort_by == "relevance" and bool(terms)

    if terms and not want_relevance:
        for term in terms:
            stmt = stmt.where(
                or_(
                    OrdenCompra.nombre.ilike(f"%{term}%"),
                    OrdenCompra.nombre_organismo.ilike(f"%{term}%"),
                    OrdenCompra.nombre_proveedor.ilike(f"%{term}%"),
                )
            )

    # Empresa fit scoring requires authentication + membership verification.
    perfil_bytes: Optional[bytes] = None
    if empresa_id:
        if current_user is None:
            raise HTTPException(status_code=401, detail="Autenticación requerida para empresa_id")
        membership = (
            await db.execute(
                select(EmpresaUsuario).where(
                    EmpresaUsuario.empresa_id == empresa_id,
                    EmpresaUsuario.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")
        if settings.feature_tfidf:
            perfil = (
                await db.execute(
                    select(TFIDFPerfil).where(TFIDFPerfil.empresa_id == empresa_id)
                )
            ).scalar_one_or_none()
            if perfil and perfil.vector_bytes:
                perfil_bytes = perfil.vector_bytes

    def _payload(orden, *, similarity=None, encaje=None):
        d = model_to_dict(orden, OrdenCompra)
        if similarity is not None:
            d["similarity_score"] = similarity
        if encaje is not None:
            d["score_encaje"] = encaje[0]
            d["nivel_encaje"] = encaje[1]
        return d

    # Semantic relevance re-ranking.
    if want_relevance and settings.feature_tfidf:
        from app.services import tfidf_matcher

        if tfidf_matcher.is_available():
            term_clauses = [
                or_(
                    OrdenCompra.nombre.ilike(f"%{t}%"),
                    OrdenCompra.nombre_organismo.ilike(f"%{t}%"),
                    OrdenCompra.nombre_proveedor.ilike(f"%{t}%"),
                )
                for t in terms
            ]
            pool_stmt = stmt.where(or_(*term_clauses)) if term_clauses else stmt
            pool_stmt = pool_stmt.order_by(desc(OrdenCompra.fecha_publicacion)).limit(_SEMANTIC_POOL)
            pool = (await db.execute(pool_stmt)).scalars().all()

            texts = [_orden_text(o) for o in pool]
            sims = tfidf_matcher.score_texts(" ".join(terms), texts)
            encaje = (
                tfidf_matcher.score_empresa_texts(perfil_bytes, texts)
                if perfil_bytes is not None
                else [None] * len(pool)
            )

            ranked = sorted(
                zip(pool, sims, encaje),
                key=lambda row: row[1],
                reverse=sort_order != "asc",
            )
            total_count = len(ranked)
            page_rows = ranked[offset : offset + limit] if limit else ranked
            data = [
                _payload(o, similarity=round(float(sim), 4), encaje=enc)
                for o, sim, enc in page_rows
            ]
            return {
                "table": "ordenes_compra",
                "total_count": total_count,
                "returned_count": len(data),
                "limit": limit,
                "offset": offset,
                "data": data,
            }

    # Empresa-fit sort.
    if sort_by == "score_encaje" and perfil_bytes is not None:
        from app.services import tfidf_matcher

        if tfidf_matcher.is_available():
            pool_stmt = stmt.order_by(desc(OrdenCompra.fecha_publicacion)).limit(_SEMANTIC_POOL)
            pool = (await db.execute(pool_stmt)).scalars().all()
            texts = [_orden_text(o) for o in pool]
            encaje = tfidf_matcher.score_empresa_texts(perfil_bytes, texts)
            ranked = sorted(
                zip(pool, encaje),
                key=lambda row: row[1][0],
                reverse=sort_order != "asc",
            )
            total_count = len(ranked)
            page_rows = ranked[offset : offset + limit] if limit else ranked
            data = [_payload(o, encaje=enc) for o, enc in page_rows]
            return {
                "table": "ordenes_compra",
                "total_count": total_count,
                "returned_count": len(data),
                "limit": limit,
                "offset": offset,
                "data": data,
            }

    # Default path.
    total_count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0

    sort_col_map = {
        "fecha_publicacion": OrdenCompra.fecha_publicacion,
        "monto_total": OrdenCompra.monto_total,
        "nombre": OrdenCompra.nombre,
    }
    sort_col = sort_col_map.get(sort_by or "", OrdenCompra.fecha_publicacion)
    order_fn = desc if sort_order == "desc" else asc
    stmt = stmt.order_by(order_fn(sort_col)).offset(offset).limit(limit)

    records = (await db.execute(stmt)).scalars().all()

    if perfil_bytes is not None and records:
        from app.services import tfidf_matcher

        if tfidf_matcher.is_available():
            encaje = tfidf_matcher.score_empresa_texts(
                perfil_bytes, [_orden_text(r) for r in records]
            )
            data = [_payload(r, encaje=enc) for r, enc in zip(records, encaje)]
        else:
            data = [model_to_dict(r, OrdenCompra) for r in records]
    else:
        data = [model_to_dict(r, OrdenCompra) for r in records]

    return {
        "table": "ordenes_compra",
        "total_count": total_count,
        "returned_count": len(records),
        "limit": limit,
        "offset": offset,
        "data": data,
    }


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
    return {"summary": {"licitaciones": {"count": licitaciones_count, "total_amount": float(licitaciones_total)}, "ordenes_compra": {"count": ordenes_count, "total_amount": float(ordenes_total)}}, "last_updated": datetime.now(timezone.utc).isoformat()}

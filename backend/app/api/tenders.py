from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.empresa import EmpresaUsuario, TFIDFPerfil
from app.models.licitacion import Licitacion
from app.models.user import User
from app.schemas.tender import TenderListResponse, TenderResponse

router = APIRouter(prefix="/api/tenders", tags=["tenders"])

# Cap on candidates pulled from Postgres before Python-side ranking. 200 gives
# good coverage for typical keyword searches while keeping the per-request
# vectorization cost bounded (~tens of ms on the pre-loaded TF-IDF model).
_SEMANTIC_POOL = 200


def _licitacion_text(lic: Licitacion) -> str:
    return f"{lic.nombre or ''} {lic.descripcion or ''}".strip()


def _to_response(lic: Licitacion, **extra) -> TenderResponse:
    # Pydantic v2: build from ORM attrs, then override with computed score fields.
    resp = TenderResponse.model_validate(lic)
    return resp.model_copy(update=extra) if extra else resp


def _coincide_termino(termino: str):
    """Cómo se decide que una licitación coincide con un término.

    Dos vías, ambas con índice:

    - `busqueda @@ plainto_tsquery('spanish', t)` — palabras, con stemming.
      Encuentra "servicio" buscando "servicios". Cubre nombre y descripcion.
    - `nombre_norm ILIKE '%t%'` — fragmentos dentro de una palabra, apoyado en el
      índice de trigramas. Es lo que hacía antes toda la búsqueda.

    Las dos ignoran las tildes: el texto se indexa normalizado y el término se
    normaliza igual antes de comparar. En Chile se escribe sin tildes más veces
    que con ellas, así que sin esto la búsqueda falla en el caso normal.

    `plainto_tsquery` trata la entrada como texto plano, así que un usuario no
    puede colar sintaxis de tsquery (`&`, `|`, `!`) escribiendo en el buscador.

    Qué cambia respecto de antes: se GANAN las coincidencias por palabra con
    stemming en ambos campos. Se PIERDEN los fragmentos a mitad de palabra que
    sólo aparecían en `descripcion` — no lleva trigrama porque es texto largo y
    sería el índice más caro de mantener en cada carga del ETL.
    """
    # El término se normaliza igual que el texto indexado. Si sólo se normalizara
    # un lado, buscar con tilde dejaría de encontrar lo que se indexó sin ella.
    sin_tildes = func.inmutable_unaccent(termino)
    return or_(
        Licitacion.busqueda.op("@@")(func.plainto_tsquery("spanish", sin_tildes)),
        Licitacion.nombre_norm.ilike(func.inmutable_unaccent(f"%{termino}%")),
    )


@router.get("/", response_model=TenderListResponse)
async def list_tenders(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(20, ge=1, le=100, alias="limit"),
    estado: str | None = None,
    codigo_organismo: str | None = None,
    region: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    search: str | None = None,
    empresa_id: UUID | None = Query(
        None, description="UUID empresa — habilita score_encaje por fila"
    ),
    sort_by: str | None = Query(
        None,
        pattern="^(fecha_publicacion|fecha_cierre|monto_estimado|nombre|relevance|score_encaje)$",
    ),
    sort_order: str | None = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    stmt = (
        select(Licitacion)
        .options(selectinload(Licitacion.detalle))
        .where(Licitacion.activo == True)
    )
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

    # For plain substring search (non-relevance sort), require ALL terms to match
    # — preserves the existing precise-filter semantics. Relevance mode widens
    # this to OR since cosine similarity handles ranking.
    terms = [t.strip() for t in (search or "").split() if t.strip()]
    want_relevance = sort_by == "relevance" and bool(terms)

    if terms and not want_relevance:
        for term in terms:
            stmt = stmt.where(_coincide_termino(term))

    # Load empresa perfil upfront if requested — needed for both enrichment and
    # `sort_by=score_encaje`. Fail closed on unauthorized empresa access.
    perfil_bytes: bytes | None = None
    want_encaje = bool(empresa_id) and settings.feature_tfidf
    if empresa_id:
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
        if want_encaje:
            perfil = (
                await db.execute(select(TFIDFPerfil).where(TFIDFPerfil.empresa_id == empresa_id))
            ).scalar_one_or_none()
            if perfil and perfil.vector_bytes:
                perfil_bytes = perfil.vector_bytes

    # Semantic re-ranking paths — bring in TF-IDF only when requested.
    if want_relevance and settings.feature_tfidf:
        from app.services import tfidf_matcher

        if tfidf_matcher.is_available():
            # OR-ed ILIKE widens the candidate pool so semantic ranking can
            # surface near-synonyms the AND-query would have excluded.
            term_clauses = [_coincide_termino(t) for t in terms]
            pool_stmt = stmt.where(or_(*term_clauses)) if term_clauses else stmt
            pool_stmt = pool_stmt.order_by(desc(Licitacion.fecha_publicacion)).limit(_SEMANTIC_POOL)
            pool = (await db.execute(pool_stmt)).scalars().all()

            texts = [_licitacion_text(l) for l in pool]
            sims = tfidf_matcher.score_texts(" ".join(terms), texts)

            if perfil_bytes is not None:
                encaje = tfidf_matcher.score_empresa_texts(perfil_bytes, texts)
            else:
                encaje = [(None, None)] * len(pool)

            ranked = sorted(
                zip(pool, sims, encaje),
                key=lambda row: row[1],
                reverse=sort_order != "asc",
            )
            total = len(ranked)
            page_rows = ranked[skip : skip + limit]
            items = [
                _to_response(
                    lic,
                    similarity_score=round(float(sim), 4),
                    score_encaje=enc[0],
                    nivel_encaje=enc[1],
                )
                for lic, sim, enc in page_rows
            ]
            pages = (total + limit - 1) // limit if limit > 0 else 0
            page = (skip // limit) + 1 if limit > 0 else 1
            return TenderListResponse(items=items, total=total, page=page, size=limit, pages=pages)
        # Fall through to default ordering when model artifacts missing.

    # Si se pidió relevancia pero NO hubo ranking semántico —bandera apagada o
    # artefactos del modelo ausentes—, el término sigue siendo un FILTRO.
    #
    # Sin esto la búsqueda se ignoraba en silencio: `stmt` se saltó el filtro
    # arriba por `want_relevance`, y el único sitio que volvía a aplicarlo era la
    # rama semántica de la que acabamos de salir. El usuario escribía un término
    # y recibía el catálogo entero, ordenado por fecha, sin ningún aviso.
    if want_relevance:
        for term in terms:
            stmt = stmt.where(_coincide_termino(term))

    if sort_by == "score_encaje" and perfil_bytes is not None:
        from app.services import tfidf_matcher

        if tfidf_matcher.is_available():
            # `stmt` already has AND-term filters applied above in the
            # `if terms and not want_relevance` block.
            pool_stmt = stmt.order_by(desc(Licitacion.fecha_publicacion)).limit(_SEMANTIC_POOL)
            pool = (await db.execute(pool_stmt)).scalars().all()

            texts = [_licitacion_text(l) for l in pool]
            encaje = tfidf_matcher.score_empresa_texts(perfil_bytes, texts)
            ranked = sorted(
                zip(pool, encaje),
                key=lambda row: row[1][0],
                reverse=sort_order != "asc",
            )
            total = len(ranked)
            page_rows = ranked[skip : skip + limit]
            items = [
                _to_response(lic, score_encaje=enc[0], nivel_encaje=enc[1])
                for lic, enc in page_rows
            ]
            pages = (total + limit - 1) // limit if limit > 0 else 0
            page = (skip // limit) + 1 if limit > 0 else 1
            return TenderListResponse(items=items, total=total, page=page, size=limit, pages=pages)

    # Default path — SQL-side sort + pagination.
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    sort_col_map = {
        "fecha_publicacion": Licitacion.fecha_publicacion,
        "fecha_cierre": Licitacion.fecha_cierre,
        "monto_estimado": Licitacion.monto_estimado,
        "nombre": Licitacion.nombre,
    }
    # `relevance` / `score_encaje` fall back here when TF-IDF unavailable.
    sort_col = sort_col_map.get(sort_by or "", Licitacion.fecha_publicacion)
    order_fn = desc if sort_order == "desc" else asc

    rows = (
        (await db.execute(stmt.order_by(order_fn(sort_col)).offset(skip).limit(limit)))
        .scalars()
        .all()
    )

    # Enrich page rows with encaje when requested — purely informational, does
    # not affect ordering in the default path.
    if perfil_bytes is not None and rows:
        from app.services import tfidf_matcher

        if tfidf_matcher.is_available():
            encaje = tfidf_matcher.score_empresa_texts(
                perfil_bytes, [_licitacion_text(r) for r in rows]
            )
            items = [
                _to_response(lic, score_encaje=enc[0], nivel_encaje=enc[1])
                for lic, enc in zip(rows, encaje)
            ]
        else:
            items = [_to_response(lic) for lic in rows]
    else:
        items = [_to_response(lic) for lic in rows]

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
            select(Licitacion)
            .options(selectinload(Licitacion.detalle))
            .where(Licitacion.id == tender_id, Licitacion.activo == True)
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
            select(Licitacion)
            .options(selectinload(Licitacion.detalle))
            .where(Licitacion.codigo_externo == codigo_externo, Licitacion.activo == True)
        )
    ).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender

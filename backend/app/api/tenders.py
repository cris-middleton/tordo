from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.empresa import EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.user import User
from app.repositories import matches as repo_matches
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


async def _encaje_de(
    db: AsyncSession, empresa_id: UUID | None, licitaciones: list[Licitacion]
) -> dict[int, dict]:
    """`{licitacion_id: {score_encaje, nivel_encaje}}` para enriquecer una página.

    Sale de `match_empresa_licitacion`, no del modelo. El score se guarda como
    entero 0-100 y el contrato de la API es un coseno 0-1, así que se divide:
    se pierde precisión por debajo del 1 %, que es menos de lo que cualquier
    pantalla muestra.
    """
    if not empresa_id or not licitaciones:
        return {}
    encontrados = await repo_matches.encaje_por_licitacion(
        db, empresa_id, [lic.id for lic in licitaciones]
    )
    return {
        lic_id: {"score_encaje": score / 100, "nivel_encaje": nivel}
        for lic_id, (score, nivel) in encontrados.items()
    }


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

    # El encaje YA NO se calcula aquí: sale de `match_empresa_licitacion`, que
    # llena el job nocturno. Cargar el perfil y puntuar en tiempo de request
    # obligaba a tener el modelo TF-IDF (~105 MB por proceso) dentro de la API, y
    # era lo que impedía servir con más de un worker en 512 MB.
    #
    # La contrapartida, dicha claro: una licitación ingerida hoy no tiene fila
    # hasta las 06:00 siguientes, y sale sin score.
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

            ranked = sorted(
                zip(pool, sims),
                key=lambda row: row[1],
                reverse=sort_order != "asc",
            )
            total = len(ranked)
            page_rows = ranked[skip : skip + limit]
            # Sólo para la página que se devuelve: pedir el encaje de las 500 del
            # pool sería traer datos que nadie va a mirar.
            encaje = await _encaje_de(db, empresa_id, [lic for lic, _ in page_rows])
            items = [
                _to_response(
                    lic,
                    similarity_score=round(float(sim), 4),
                    **encaje.get(lic.id, {}),
                )
                for lic, sim in page_rows
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

    # Default path — SQL-side sort + pagination.
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    if sort_by == "score_encaje" and empresa_id:
        # Ordenar en SQL y no en memoria arregla de paso un fallo del camino
        # anterior: cortaba en un pool de 500 y devolvía ese tamaño como `total`,
        # así que la paginación mentía en cuanto había más resultados.
        ordenado = repo_matches.ordenar_por_encaje(stmt, empresa_id, ascendente=sort_order == "asc")
    else:
        sort_col_map = {
            "fecha_publicacion": Licitacion.fecha_publicacion,
            "fecha_cierre": Licitacion.fecha_cierre,
            "monto_estimado": Licitacion.monto_estimado,
            "nombre": Licitacion.nombre,
        }
        # `relevance` cae aquí cuando no hay modelo; `score_encaje`, cuando no
        # hay empresa a la que comparar.
        sort_col = sort_col_map.get(sort_by or "", Licitacion.fecha_publicacion)
        order_fn = desc if sort_order == "desc" else asc
        ordenado = stmt.order_by(order_fn(sort_col))

    rows = (await db.execute(ordenado.offset(skip).limit(limit))).scalars().all()

    encaje = await _encaje_de(db, empresa_id, rows)
    items = [_to_response(lic, **encaje.get(lic.id, {})) for lic in rows]

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

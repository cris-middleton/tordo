"""Catálogo de licitaciones. Anónimo desde el pivote público: no hay cuentas."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo_licitaciones
from app.schemas.tender import TenderListResponse, TenderResponse
from app.services import tfidf_matcher

router = APIRouter(prefix="/tenders", tags=["tenders"])


def _licitacion_text(lic: Licitacion) -> str:
    return f"{lic.nombre or ''} {lic.descripcion or ''}".strip()


def _to_response(lic: Licitacion, **extra) -> TenderResponse:
    # Pydantic v2: se construye desde los atributos ORM y luego se sobreescriben
    # los campos calculados.
    resp = TenderResponse.model_validate(lic)
    return resp.model_copy(update=extra) if extra else resp


def _paginacion(total: int, salto: int, limite: int) -> tuple[int, int]:
    paginas = (total + limite - 1) // limite if limite > 0 else 0
    pagina = (salto // limite) + 1 if limite > 0 else 1
    return pagina, paginas


@router.get("/", response_model=TenderListResponse)
async def list_tenders(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(20, ge=1, le=100, alias="limit"),
    estado: str | None = None,
    codigo_organismo: str | None = None,
    tipo_convocatoria: str | None = Query(
        None,
        description=(
            "Mecanismo de compra, separado por comas: "
            "licitacion, compra_agil, convenio_marco, trato_directo."
        ),
    ),
    region: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    search: str | None = None,
    sort_by: str | None = Query(
        None,
        pattern="^(fecha_publicacion|fecha_cierre|monto_estimado|nombre|relevance)$",
    ),
    sort_order: str | None = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    tipos = [t.strip() for t in (tipo_convocatoria or "").split(",") if t.strip()]
    desconocidos = [t for t in tipos if t not in set(TipoConvocatoria)]
    if desconocidos:
        # Se rechaza en vez de ignorarlo: un valor mal escrito devolvería el
        # catálogo entero, y quien filtra por "compra_agiles" creería que no hay
        # ninguna.
        raise HTTPException(
            status_code=422,
            detail=(
                f"Mecanismo de compra desconocido: {', '.join(desconocidos)}. "
                f"Valores válidos: {', '.join(sorted(TipoConvocatoria))}."
            ),
        )

    filtros = repo_licitaciones.Filtros(
        estado=estado,
        codigo_organismo=codigo_organismo,
        tipos_convocatoria=tipos,
        region=region,
        monto_minimo=min_amount,
        monto_maximo=max_amount,
        terminos=[t.strip() for t in (search or "").split() if t.strip()],
    )
    ascendente = sort_order == "asc"

    # Reordenado semántico: sólo cuando se pide relevancia Y hay términos.
    if sort_by == "relevance" and filtros.terminos and settings.feature_tfidf:
        if tfidf_matcher.is_available():
            pool = await repo_licitaciones.pool_para_relevancia(db, filtros)
            similitudes = tfidf_matcher.score_texts(
                " ".join(filtros.terminos), [_licitacion_text(lic) for lic in pool]
            )
            # Abiertas primero, y dentro de cada grupo por similitud: el mismo
            # criterio que el orden en SQL (`abiertas_primero`).
            signo = 1 if ascendente else -1
            ordenadas = sorted(
                zip(pool, similitudes, strict=True),
                key=lambda fila: (
                    0 if repo_licitaciones.abierta_en_memoria(fila[0]) else 1,
                    signo * fila[1],
                ),
            )
            total = len(ordenadas)
            pagina_filas = ordenadas[skip : skip + limit]
            items = [
                _to_response(lic, similarity_score=round(float(sim), 4))
                for lic, sim in pagina_filas
            ]
            page, pages = _paginacion(total, skip, limit)
            return TenderListResponse(items=items, total=total, page=page, size=limit, pages=pages)
        # Sin artefactos del modelo se cae al orden normal. El término sigue
        # siendo un FILTRO: `buscar` lo aplica siempre, así que la búsqueda no se
        # ignora en silencio como pasaba antes.

    rows, total = await repo_licitaciones.buscar(
        db,
        filtros,
        orden=sort_by,
        ascendente=ascendente,
        salto=skip,
        limite=limit,
    )

    items = [_to_response(lic) for lic in rows]
    page, pages = _paginacion(total, skip, limit)
    return TenderListResponse(items=items, total=total, page=page, size=limit, pages=pages)


@router.get("/{tender_id}", response_model=TenderResponse)
async def get_tender(
    tender_id: int,
    db: AsyncSession = Depends(get_db),
):
    tender = await repo_licitaciones.obtener(db, tender_id)
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender


@router.get("/codigo/{codigo_externo}", response_model=TenderResponse)
async def get_tender_by_code(
    codigo_externo: str,
    db: AsyncSession = Depends(get_db),
):
    tender = await repo_licitaciones.obtener_por_codigo(db, codigo_externo)
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender

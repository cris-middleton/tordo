"""Catálogo de licitaciones. Anónimo desde el pivote público: no hay cuentas."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo_licitaciones
from app.schemas.tender import TenderListResponse, TenderResponse

router = APIRouter(prefix="/tenders", tags=["tenders"])


def _to_response(lic: Licitacion) -> TenderResponse:
    return TenderResponse.model_validate(lic)


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

    if sort_by == "relevance":
        # Lo ordena Postgres (`ts_rank_cd` sobre `busqueda`), con el MISMO
        # filtro que el resto de órdenes. Hasta el paso 8 del pivote lo hacía un
        # TF-IDF cargado en este proceso, y sin sus artefactos el término se
        # llegó a ignorar: se devolvía el catálogo entero.
        rows, total = await repo_licitaciones.buscar_por_relevancia(
            db, filtros, ascendente=ascendente, salto=skip, limite=limit
        )
    else:
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

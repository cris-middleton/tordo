from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion
from app.models.user import User
from app.repositories import empresas as repo_empresas
from app.repositories import licitaciones as repo_licitaciones
from app.repositories import matches as repo_matches
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

    # El encaje NO se calcula aquí: sale de `match_empresa_licitacion`, que llena
    # el job nocturno. Puntuar en tiempo de request obligaba a tener el modelo
    # TF-IDF (~105 MB por proceso) dentro de la API, y era lo que impedía servir
    # con más de un worker en 512 MB.
    #
    # Contrapartida, dicha claro: una licitación ingerida hoy no tiene fila hasta
    # las 06:00 siguientes, y sale sin score.
    if empresa_id and not await repo_empresas.membresia(db, empresa_id, current_user.id):
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")

    # Reordenado semántico: sólo cuando se pide relevancia Y hay términos.
    if sort_by == "relevance" and filtros.terminos and settings.feature_tfidf:
        if tfidf_matcher.is_available():
            pool = await repo_licitaciones.pool_para_relevancia(db, filtros)
            similitudes = tfidf_matcher.score_texts(
                " ".join(filtros.terminos), [_licitacion_text(lic) for lic in pool]
            )
            ordenadas = sorted(
                zip(pool, similitudes), key=lambda fila: fila[1], reverse=not ascendente
            )
            total = len(ordenadas)
            pagina_filas = ordenadas[skip : skip + limit]
            # Sólo para la página que se devuelve: pedir el encaje de las 200 del
            # pool sería traer datos que nadie va a mirar.
            encaje = await _encaje_de(db, empresa_id, [lic for lic, _ in pagina_filas])
            items = [
                _to_response(lic, similarity_score=round(float(sim), 4), **encaje.get(lic.id, {}))
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
        empresa_id=empresa_id,
    )

    encaje = await _encaje_de(db, empresa_id, rows)
    items = [_to_response(lic, **encaje.get(lic.id, {})) for lic in rows]
    page, pages = _paginacion(total, skip, limit)
    return TenderListResponse(items=items, total=total, page=page, size=limit, pages=pages)


@router.get("/{tender_id}", response_model=TenderResponse)
async def get_tender(
    tender_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    tender = await repo_licitaciones.obtener(db, tender_id)
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender


@router.get("/codigo/{codigo_externo}", response_model=TenderResponse)
async def get_tender_by_code(
    codigo_externo: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    tender = await repo_licitaciones.obtener_por_codigo(db, codigo_externo)
    if not tender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tender not found")
    return tender

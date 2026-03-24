"""
BI API — pre-bid intelligence endpoints.

Analytics routes are gated behind `feature_analytics`.
TF-IDF matching routes are gated behind `feature_tfidf`.
When either flag is off (default in dev), the respective endpoints return 503.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.plan_limits import check_bi_quota_dep, require_plan
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.empresa import EmpresaUsuario, TFIDFPerfil
from app.models.user import User
from app.schemas.bi import (
    ClustersResponse,
    CompradorResponse,
    CompetidoresResponse,
    DescuentoResponse,
    DiversificacionResponse,
    EstacionalidadResponse,
    ForecastCompetidoresResponse,
    LicitacionBIPanel,
    MatchingResponse,
    OportunidadesResponse,
    PerfilMatchResponse,
    PrecioResponse,
    SectorResponse,
    TendenciaResponse,
    TFIDFPerfilResponse,
    TFIDFPerfilUpdate,
    VentanaResponse,
)

router = APIRouter(prefix="/api/bi", tags=["bi"])


def _require_analytics():
    if not settings.feature_analytics:
        raise HTTPException(
            status_code=503,
            detail=(
                "BI module is disabled. "
                "Set FEATURE_ANALYTICS=true and generate analytics parquets first."
            ),
        )


def _require_tfidf_flag():
    if not settings.feature_tfidf:
        raise HTTPException(
            status_code=503,
            detail=(
                "TF-IDF matching is disabled. "
                "Set FEATURE_TFIDF=true and train the model first: "
                "python -m etl.analytics.run_all --modulo tfidf_matcher"
            ),
        )


@router.get(
    "/precio/{codigo_producto}",
    response_model=PrecioResponse,
    summary="Bandas de precio históricas para un producto ONU",
)
def get_precio_producto(
    codigo_producto: str,
    organismo_id: Optional[str] = Query(None, description="Filtrar por CodigoOrganismoPublico"),
    unidad_medida: Optional[str] = Query(None, description="Filtrar por UnidadMedida"),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service

    result = bi_service.get_precio_producto(codigo_producto, organismo_id, unidad_medida)
    return result


@router.get(
    "/competidores/{organismo_id}",
    response_model=CompetidoresResponse,
    summary="Top competidores en el mercado de un comprador",
)
def get_competidores(
    organismo_id: str,
    rubro: Optional[str] = Query(None, description="Filtrar por RubroN2"),
    top_n: int = Query(20, ge=1, le=100),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service

    result = bi_service.get_competidores(organismo_id, rubro, top_n)
    return result


@router.get(
    "/oportunidades",
    response_model=OportunidadesResponse,
    summary="Mercados con mejor score de oportunidad (0–10)",
)
def get_oportunidades(
    organismo_id: Optional[str] = Query(None),
    rubro: Optional[str] = Query(None),
    min_score: float = Query(6.0, ge=0, le=10),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service

    result = bi_service.get_oportunidades(organismo_id, rubro, min_score, limit)
    return result


@router.get(
    "/ventana/{codigo_externo}",
    response_model=VentanaResponse,
    summary="Clasificación de ventana de preparación vs norma histórica",
    description=(
        "Compara la ventana de esta licitación con el p50 histórico de su tipo/sector. "
        "Retorna alerta_ventana_corta=true si es inusualmente corta. "
        "Requiere que el ETL haya generado window_classified.parquet."
    ),
)
def get_ventana(
    codigo_externo: str,
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service

    result = bi_service.get_ventana(codigo_externo)
    return result


@router.get(
    "/comprador/{organismo_id}",
    response_model=CompradorResponse,
    summary="Perfil del comprador: score, tiempos de pago y risk flags",
)
def get_comprador(
    organismo_id: str,
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service

    result = bi_service.get_comprador(organismo_id)
    return result


@router.get(
    "/licitacion/{codigo_externo}/panel",
    response_model=LicitacionBIPanel,
    summary="Panel BI completo para la vista detalle de una licitación",
    description=(
        "Agrega en una sola llamada: perfil comprador (score + transparencia), "
        "clasificación de ventana de preparación, top-5 competidores e índice de precios "
        "con fallback L1→L2→L3. Opcionalmente incluye postulación activa y estado hábil "
        "de la empresa si se provee empresa_id."
    ),
)
async def get_licitacion_panel(
    codigo_externo: str,
    empresa_id: Optional[str] = Query(None, description="UUID empresa para postulación y estado hábil"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from uuid import UUID as _UUID

    from app.models.empresa import Empresa
    from app.models.licitacion import Licitacion
    from app.models.postulacion import Postulacion
    from app.services import bi_service

    lic = (await db.execute(select(Licitacion).where(Licitacion.codigo_externo == codigo_externo))).scalar_one_or_none()
    if not lic:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")

    organismo_id = lic.codigo_organismo

    # Extract product codes from items JSON (up to 10 unique codes)
    product_codes: list[str] = []
    if lic.items and isinstance(lic.items, list):
        seen_codes: set[str] = set()
        for item in lic.items:
            if not isinstance(item, dict):
                continue
            code = (
                item.get("codigoProductoONU")
                or item.get("CodigoProducto")
                or item.get("codigo_producto")
            )
            if code and str(code) not in seen_codes:
                seen_codes.add(str(code))
                product_codes.append(str(code))
            if len(product_codes) >= 10:
                break

    panel = bi_service.get_licitacion_panel(
        codigo_externo=codigo_externo,
        organismo_id=organismo_id,
        product_codes=product_codes,
    )

    # Inject empresa-specific data when empresa_id is provided
    if empresa_id:
        try:
            empresa_uuid = _UUID(empresa_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="empresa_id inválido")

        membership = (await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.empresa_id == empresa_uuid, EmpresaUsuario.user_id == current_user.id))).scalar_one_or_none()
        if membership:
            existing = (await db.execute(select(Postulacion).where(Postulacion.empresa_id == empresa_uuid, Postulacion.licitacion_id == lic.id))).scalar_one_or_none()
            panel["postulacion_id"] = str(existing.id) if existing else None

            empresa = (await db.execute(select(Empresa).where(Empresa.id == empresa_uuid))).scalar_one_or_none()
            if empresa:
                panel["estado_habil"] = empresa.estado_habil

    return panel


# ─── Paso D: extended BI endpoints ───────────────────────────────────────────


@router.get(
    "/estacionalidad/{organismo_id}",
    response_model=EstacionalidadResponse,
    summary="Patrones de estacionalidad de compras para un organismo",
    description=(
        "Retorna probabilidad de compra, consistencia y picos estacionales por mes "
        "(1–12) para el organismo indicado, con filtro opcional por rubro. "
        "Fuente: seasonality_patterns.parquet."
    ),
)
def get_estacionalidad(
    organismo_id: str,
    rubro: Optional[str] = Query(None, description="Filtrar por RubroN2"),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_estacionalidad(organismo_id, rubro)


@router.get(
    "/tendencia",
    response_model=TendenciaResponse,
    summary="Tendencias de crecimiento por mercado (CAGR, slope)",
    description=(
        "Mercados con mayor CAGR e inclinación positiva. "
        "El campo emergentes contiene los mercados con CAGR > 20%%. "
        "Fuente: trend_by_market.parquet + emerging_markets.parquet."
    ),
)
def get_tendencia(
    rubro: Optional[str] = Query(None, description="Filtrar por RubroN2"),
    tendencia: Optional[str] = Query(None, description="creciente | decreciente | estable"),
    solo_emergentes: bool = Query(False, description="Retornar solo mercados emergentes"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_tendencia(rubro, tendencia, solo_emergentes, limit)


@router.get(
    "/descuento",
    response_model=DescuentoResponse,
    summary="Descuento óptimo por contexto competitivo",
    description=(
        "Bandas de descuento observadas segmentadas por tipo de licitación, rubro y "
        "rango de número de oferentes. señal_competencia = baja | media | alta. "
        "Fuente: discount_by_context.parquet."
    ),
)
def get_descuento(
    tipo: Optional[str] = Query(None, description="CodigoTipo de licitación"),
    rubro: Optional[str] = Query(None, description="Filtrar por Rubro2"),
    n_oferentes_rango: Optional[str] = Query(None, description="Ej: '1', '2-3', '4+'"),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_descuento(tipo, rubro, n_oferentes_rango)


@router.get(
    "/forecast_competidores",
    response_model=ForecastCompetidoresResponse,
    summary="Pronóstico de número de competidores con fallback L1→L2→L3",
    description=(
        "Predice cuántos competidores suele haber para una licitación de tipo+rubro "
        "en el organismo especificado. Fallback automático a nivel nacional si no hay "
        "datos del organismo. Fuente: competitor_forecast_l1/l2/l3.parquet."
    ),
)
def get_forecast_competidores(
    organismo_id: Optional[str] = Query(None, description="CodigoOrganismo para L1"),
    rubro: Optional[str] = Query(None, description="Rubro2 para L1/L2"),
    tipo: Optional[str] = Query(None, description="CodigoTipo de licitación"),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_forecast_competidores(organismo_id, rubro, tipo)


@router.get(
    "/diversificacion/{codigo_proveedor}",
    response_model=DiversificacionResponse,
    summary="Score de diversificación de un proveedor",
    description=(
        "HHI y score de diversificación de clientes de un proveedor. "
        "alerta_dependencia=true indica concentración excesiva en un solo organismo. "
        "Fuente: provider_diversification.parquet."
    ),
)
def get_diversificacion(
    codigo_proveedor: str,
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_diversificacion(codigo_proveedor)


@router.get(
    "/sector",
    response_model=SectorResponse,
    summary="Dashboard por sector de mercado",
    description=(
        "Resumen de actividad por sector: n_oc, monto_total, ticket_mediana, "
        "n_organismos, n_proveedores. Ordenado por monto_total descendente. "
        "Fuente: sector_dashboard.parquet."
    ),
)
def get_sector(
    sector: Optional[str] = Query(None, description="Filtrar por sector específico"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_sector(sector, limit)


# ─── TF-IDF Matching endpoints ────────────────────────────────────────────────


@router.get(
    "/matching",
    response_model=MatchingResponse,
    summary="Matching semántico: proveedores similares a un texto libre",
    description=(
        "Dado un texto (nombre de licitación, descripción de producto), retorna los "
        "proveedores históricos más afines por cosine similarity sobre TF-IDF. "
        "Tolerante a variantes ortográficas (strip_accents, bigramas). "
        "Requiere FEATURE_TFIDF=true y modelo entrenado."
    ),
)
def get_matching(
    texto: str = Query(..., min_length=3, description="Texto a buscar (nombre producto, servicio, etc.)"),
    top_n: int = Query(20, ge=1, le=100, description="Número máximo de proveedores a retornar"),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_tfidf_flag()
    from app.services import tfidf_matcher

    if not tfidf_matcher.is_available():
        return MatchingResponse(
            disponible=False,
            motivo="Modelo TF-IDF no entrenado. Ejecute: python -m etl.analytics.run_all --modulo tfidf_matcher",
        )

    results = tfidf_matcher.match(texto, top_n=top_n)
    return MatchingResponse(
        disponible=True,
        query=texto,
        resultados=results,
        total=len(results),
    )


@router.get(
    "/licitacion-match/{codigo_externo}",
    response_model=PerfilMatchResponse,
    summary="¿Tu perfil encaja? Score de encaje empresa-licitación",
    description=(
        "Compara el perfil TF-IDF de la empresa contra el texto de la licitación. "
        "Retorna score 0–1 y nivel {alto, medio, bajo, sin_encaje}. "
        "Si la empresa no tiene perfil guardado, retorna nivel=sin_perfil. "
        "Requiere FEATURE_TFIDF=true."
    ),
)
async def get_licitacion_match(
    codigo_externo: str,
    empresa_id: UUID = Query(..., description="UUID de la empresa a evaluar"),
    texto: str = Query(..., min_length=3, description="Nombre/descripción de la licitación"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_tfidf_flag()
    from app.services import tfidf_matcher

    # Verify user membership in empresa
    membership = (await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.empresa_id == empresa_id, EmpresaUsuario.user_id == current_user.id))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")

    if not tfidf_matcher.is_available():
        return PerfilMatchResponse(
            disponible=False,
            codigo_externo=codigo_externo,
            motivo="Modelo TF-IDF no entrenado",
        )

    # Load empresa TF-IDF profile
    perfil = (await db.execute(select(TFIDFPerfil).where(TFIDFPerfil.empresa_id == empresa_id))).scalar_one_or_none()
    if not perfil or not perfil.vector_bytes:
        return PerfilMatchResponse(
            disponible=True,
            codigo_externo=codigo_externo,
            licitacion_nombre=texto[:120],
            nivel="sin_perfil",
            motivo="La empresa no tiene perfil TF-IDF configurado. Configura tus rubros en Inteligencia BI.",
        )

    score, nivel = tfidf_matcher.score_empresa_licitacion(perfil.vector_bytes, texto)
    return PerfilMatchResponse(
        disponible=True,
        codigo_externo=codigo_externo,
        licitacion_nombre=texto[:120],
        score_encaje=score,
        nivel=nivel,
    )


@router.get(
    "/perfil/{empresa_id}",
    response_model=TFIDFPerfilResponse,
    summary="Obtener perfil TF-IDF de una empresa",
)
async def get_tfidf_perfil(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_tfidf_flag()

    membership = (await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.empresa_id == empresa_id, EmpresaUsuario.user_id == current_user.id))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")

    perfil = (await db.execute(select(TFIDFPerfil).where(TFIDFPerfil.empresa_id == empresa_id))).scalar_one_or_none()
    if not perfil:
        return TFIDFPerfilResponse(
            empresa_id=str(empresa_id),
            rubros_usados=None,
            modelo_version=None,
            actualizado_en=None,
            tiene_vector=False,
        )

    return TFIDFPerfilResponse(
        empresa_id=str(empresa_id),
        rubros_usados=perfil.rubros_usados,
        modelo_version=perfil.modelo_version,
        actualizado_en=perfil.updated_at.isoformat() if perfil.updated_at else None,
        tiene_vector=bool(perfil.vector_bytes),
    )


@router.put(
    "/perfil/{empresa_id}",
    response_model=TFIDFPerfilResponse,
    summary="Actualizar perfil TF-IDF de una empresa",
    description=(
        "Recibe una lista de textos (rubros, productos, descripciones) que representan "
        "la actividad de la empresa. Calcula el vector TF-IDF y lo persiste en DB. "
        "Este vector se usa en /licitacion-match para calcular encaje semántico."
    ),
)
async def update_tfidf_perfil(
    empresa_id: UUID,
    body: TFIDFPerfilUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_tfidf_flag()
    from app.services import tfidf_matcher

    # Must be owner or admin
    membership = (await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.empresa_id == empresa_id, EmpresaUsuario.user_id == current_user.id, EmpresaUsuario.rol.in_(["owner", "admin"])))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Se requiere rol owner o admin")

    if not tfidf_matcher.is_available():
        raise HTTPException(
            status_code=503,
            detail="Modelo TF-IDF no entrenado. No se puede calcular el vector.",
        )

    rubros_text = " ".join(body.rubros_usados)
    try:
        vector_bytes = tfidf_matcher.build_empresa_vector(rubros_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Upsert TFIDFPerfil
    perfil = (await db.execute(select(TFIDFPerfil).where(TFIDFPerfil.empresa_id == empresa_id))).scalar_one_or_none()
    if perfil:
        perfil.vector_bytes = vector_bytes
        perfil.rubros_usados = body.rubros_usados
        perfil.modelo_version = "v1"
    else:
        perfil = TFIDFPerfil(
            empresa_id=empresa_id,
            vector_bytes=vector_bytes,
            rubros_usados=body.rubros_usados,
            modelo_version="v1",
        )
        db.add(perfil)

    await db.commit()
    await db.refresh(perfil)

    return TFIDFPerfilResponse(
        empresa_id=str(empresa_id),
        rubros_usados=perfil.rubros_usados,
        modelo_version=perfil.modelo_version,
        actualizado_en=perfil.updated_at.isoformat() if perfil.updated_at else None,
        tiene_vector=True,
    )


@router.get(
    "/clusters",
    response_model=ClustersResponse,
    summary="Taxonomía de clusters de productos (para UI de perfil TF-IDF)",
    description=(
        "Retorna los clusters de tipos de compra generados por word_clustering.py. "
        "Útil para que el usuario seleccione sus categorías al configurar el perfil TF-IDF. "
        "Requiere que el ETL haya generado cluster_taxonomy.parquet."
    ),
)
def get_clusters(
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_tfidf_flag()
    from app.services import tfidf_matcher

    clusters = tfidf_matcher.get_clusters(limit=limit)
    if not clusters:
        return ClustersResponse(
            disponible=False,
            motivo=(
                "cluster_taxonomy.parquet no encontrado. "
                "Ejecute: python -m etl.analytics.run_all --modulo word_clustering"
            ),
        )
    return ClustersResponse(
        disponible=True,
        clusters=clusters,
        total=len(clusters),
    )

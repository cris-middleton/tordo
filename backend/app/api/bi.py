"""
BI API — pre-bid intelligence endpoints.

Desde el pivote público (docs/PIVOTE_PUBLICO_2026-10.md) no hay cuentas: las rutas
de análisis no piden sesión ni cuota y las protege sólo el límite por IP de
`/api/v1/bi/*`.

Las rutas dependen de `feature_analytics`; apagada (lo normal en desarrollo),
responden 503.

`/bi/matching` (texto libre → proveedores, con el TF-IDF cargado en este proceso)
y `/bi/clusters` (un parquet leído desde la API) se retiraron en el paso 8 del
pivote público: la API no carga artefactos del ETL. Ver CLAUDE.md, «Un worker
por contenedor».
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.repositories import licitaciones as repo_licitaciones
from app.schemas.bi import (
    CompetidoresResponse,
    CompradorResponse,
    DescuentoResponse,
    DiversificacionResponse,
    EstacionalidadResponse,
    ForecastCompetidoresResponse,
    LicitacionBIPanel,
    OportunidadesResponse,
    PanoramaResponse,
    PrecioResponse,
    ProductosResponse,
    ResumenResponse,
    RubrosResponse,
    SectorResponse,
    TendenciaResponse,
    VentanaResponse,
)
from app.services import bi as bi_service
from app.services import exportar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bi", tags=["bi"])


def _require_analytics():
    if not settings.feature_analytics:
        raise HTTPException(
            status_code=503,
            detail=(
                "BI module is disabled. "
                "Set FEATURE_ANALYTICS=true and generate analytics parquets first."
            ),
        )


@router.get(
    "/precio/{codigo_producto}",
    response_model=PrecioResponse,
    summary="Bandas de precio históricas para un producto ONU",
)
def get_precio_producto(
    codigo_producto: str,
    organismo_id: str | None = Query(None, description="Filtrar por CodigoOrganismoPublico"),
    unidad_medida: str | None = Query(None, description="Filtrar por UnidadMedida"),
):
    _require_analytics()

    result = bi_service.get_precio_producto(codigo_producto, organismo_id, unidad_medida)
    return result


@router.get(
    "/competidores/{organismo_id}",
    response_model=CompetidoresResponse,
    summary="Top competidores en el mercado de un comprador",
)
def get_competidores(
    organismo_id: str,
    rubro: str | None = Query(None, description="Filtrar por RubroN2"),
    top_n: int = Query(20, ge=1, le=100),
):
    _require_analytics()

    result = bi_service.get_competidores(organismo_id, rubro, top_n)
    return result


@router.get(
    "/oportunidades",
    response_model=OportunidadesResponse,
    summary="Mercados con mejor score de oportunidad (0–10)",
)
def get_oportunidades(
    organismo_id: str | None = Query(None),
    rubro: str | None = Query(None),
    min_score: float = Query(6.0, ge=0, le=10),
    limit: int = Query(50, ge=1, le=200),
):
    _require_analytics()

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
):
    _require_analytics()

    result = bi_service.get_ventana(codigo_externo)
    return result


@router.get(
    "/comprador/{organismo_id}",
    response_model=CompradorResponse,
    summary="Perfil del comprador: score, tiempos de pago y risk flags",
)
def get_comprador(
    organismo_id: str,
):
    _require_analytics()

    result = bi_service.get_comprador(organismo_id)
    return result


@router.get(
    "/licitacion/{codigo_externo}/panel",
    response_model=LicitacionBIPanel,
    summary="Panel BI completo para la vista detalle de una licitación",
    description=(
        "Agrega en una sola llamada: perfil comprador (score + transparencia), "
        "clasificación de ventana de preparación, top-5 competidores e índice de precios "
        "con fallback L1→L2→L3."
    ),
)
async def get_licitacion_panel(
    codigo_externo: str,
    db: AsyncSession = Depends(get_db),
):
    _require_analytics()

    lic = await repo_licitaciones.obtener_por_codigo(db, codigo_externo)
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
    rubro: str | None = Query(None, description="Filtrar por RubroN2"),
):
    _require_analytics()

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
    rubro: str | None = Query(None, description="Filtrar por RubroN2"),
    tendencia: str | None = Query(None, description="creciente | decreciente | estable"),
    solo_emergentes: bool = Query(False, description="Retornar solo mercados emergentes"),
    limit: int = Query(50, ge=1, le=200),
):
    _require_analytics()

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
    tipo: str | None = Query(None, description="CodigoTipo de licitación"),
    rubro: str | None = Query(None, description="Filtrar por Rubro2"),
    n_oferentes_rango: str | None = Query(None, description="Ej: '1', '2-3', '4+'"),
):
    _require_analytics()

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
    organismo_id: str | None = Query(None, description="CodigoOrganismo para L1"),
    rubro: str | None = Query(None, description="Rubro2 para L1/L2"),
    tipo: str | None = Query(None, description="CodigoTipo de licitación"),
):
    _require_analytics()

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
):
    _require_analytics()

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
    sector: str | None = Query(None, description="Filtrar por sector específico"),
    limit: int = Query(50, ge=1, le=200),
):
    _require_analytics()

    return bi_service.get_sector(sector, limit)


@router.get(
    "/rubros",
    response_model=RubrosResponse,
    summary="Lista de rubros estandarizados de ChileCompra (RubroN2)",
    description=(
        "Retorna los rubros RubroN2 de la taxonomía oficial de ChileCompra, "
        "ordenados por frecuencia de oportunidades. Usar para el selector de rubros en la UI."
    ),
)
def get_rubros(
    limit: int = Query(354, ge=1, le=500),
):
    _require_analytics()

    result = bi_service.get_rubros(limit=limit)
    return result


@router.get(
    "/exportar/precio/{codigo_producto}",
    summary="Descargar en CSV la banda de precio de un producto",
    description=(
        "Devuelve el mismo análisis que `/bi/precio/{codigo_producto}` en un CSV "
        "listo para Excel: con BOM y separador `;`, para que Excel en configuración "
        "chilena lo abra bien."
    ),
    response_class=Response,
)
def exportar_precio(
    codigo_producto: str,
    organismo_id: str | None = Query(None),
    unidad_medida: str | None = Query(None),
):
    _require_analytics()

    datos = bi_service.get_precio_producto(codigo_producto, organismo_id, unidad_medida)
    if not datos.get("disponible"):
        raise HTTPException(status_code=404, detail=datos.get("motivo", "Sin datos para exportar"))

    csv_texto = exportar.a_csv(datos.get("resultado") or [], exportar.COLUMNAS_PRECIO)
    nombre = exportar.nombre_archivo("precio", codigo_producto)
    return Response(
        content=csv_texto,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get(
    "/exportar/competidores/{organismo_id}",
    summary="Descargar en CSV los competidores de un comprador",
    response_class=Response,
)
def exportar_competidores(
    organismo_id: str,
    rubro: str | None = Query(None),
    top_n: int = Query(50, ge=1, le=200),
):
    _require_analytics()

    datos = bi_service.get_competidores(organismo_id, rubro, top_n)
    if not datos.get("disponible"):
        raise HTTPException(status_code=404, detail=datos.get("motivo", "Sin datos para exportar"))

    csv_texto = exportar.a_csv(datos.get("competidores") or [], exportar.COLUMNAS_COMPETIDORES)
    nombre = exportar.nombre_archivo("competidores", organismo_id)
    return Response(
        content=csv_texto,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get(
    "/panorama",
    response_model=PanoramaResponse,
    summary="Panorama completo de un rubro",
    description=(
        "Tamaño y ticket del mercado, concentración real, estacionalidad agregada y "
        "compradores con banderas de riesgo — todo del **rubro**, no de un par "
        "organismo×rubro.\n\n"
        "Va en una sola llamada porque la pantalla los necesita juntos: cinco peticiones "
        "serían cinco estados de carga y cinco formas de fallar a medias por una sola "
        "pregunta del usuario."
    ),
)
def get_panorama(
    rubro: str = Query(..., min_length=1, description="RubroN2 de la taxonomía de ChileCompra"),
):
    _require_analytics()

    return bi_service.get_panorama(rubro)


@router.get(
    "/resumen",
    response_model=ResumenResponse,
    summary="Resumen narrativo de un rubro (para MarketSummaryCard)",
    description=(
        "Combina time_series + market_concentration + buyer_scores + opportunity_scores + "
        "seasonality_patterns en una sola respuesta liviana."
    ),
)
def get_resumen(
    rubro: str = Query(..., min_length=1, description="RubroN2 a resumir"),
):
    _require_analytics()

    return bi_service.get_resumen(rubro)


@router.get(
    "/productos",
    response_model=ProductosResponse,
    summary="Buscar productos por nombre (autocomplete)",
    description="Busca en product_price_bands_L3 por substring en el nombre del producto.",
)
def get_productos(
    q: str = Query(..., min_length=2, description="Texto a buscar en el nombre del producto"),
    limit: int = Query(20, ge=1, le=50),
):
    _require_analytics()

    return bi_service.get_productos(q, limit)

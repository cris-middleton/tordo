"""
BI API — pre-bid intelligence endpoints.

Analytics routes are gated behind `feature_analytics`.
TF-IDF matching routes are gated behind `feature_tfidf`.
When either flag is off (default in dev), the respective endpoints return 503.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    EmpresaContext,
    check_bi_quota_dep,
    empresa_ctx,
    require_plan,
    require_rol,
    verificar_acceso_empresa,
)
from app.config import settings
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.empresa import Empresa, TFIDFPerfil
from app.models.user import User
from app.repositories import empresas as repo_empresas
from app.repositories import licitaciones as repo_licitaciones
from app.repositories import postulaciones as repo_postulaciones
from app.repositories import proveedores as repo_proveedores
from app.schemas.bi import (
    ClustersResponse,
    CompetidoresResponse,
    CompradorResponse,
    DescuentoResponse,
    DiversificacionResponse,
    EstacionalidadResponse,
    ForecastCompetidoresResponse,
    LicitacionBIPanel,
    MatchingResponse,
    MiPosicionResponse,
    OportunidadesResponse,
    PanoramaResponse,
    PerfilMatchResponse,
    PrecioResponse,
    ProductosResponse,
    RadarResponse,
    ResumenResponse,
    RubrosResponse,
    SectorResponse,
    SugerenciaRubrosResponse,
    TendenciaResponse,
    TFIDFPerfilResponse,
    TFIDFPerfilUpdate,
    VentanaResponse,
)

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
    organismo_id: str | None = Query(None, description="Filtrar por CodigoOrganismoPublico"),
    unidad_medida: str | None = Query(None, description="Filtrar por UnidadMedida"),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

    result = bi_service.get_ventana(codigo_externo)
    return result


@router.get(
    "/comprador/{organismo_id}",
    response_model=CompradorResponse,
    summary="Perfil del comprador: score, tiempos de pago y risk flags",
)
def get_comprador(
    organismo_id: str,
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_id: str | None = Query(
        None, description="UUID empresa para postulación y estado hábil"
    ),
    db: AsyncSession = Depends(get_db),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
    current_user: User = Depends(get_current_active_user),
):
    _require_analytics()
    from uuid import UUID as _UUID

    from app.services import bi as bi_service

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

    # Inject empresa-specific data when empresa_id is provided
    if empresa_id:
        try:
            empresa_uuid = _UUID(empresa_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="empresa_id inválido")

        # Chequeo blando a propósito: si no es miembro simplemente no se enriquece
        # la respuesta, no se rechaza la petición.
        membership = await repo_empresas.membresia(db, empresa_uuid, current_user.id)
        if membership:
            existing = await repo_postulaciones.buscar_de_empresa_para_licitacion(
                db, empresa_uuid, lic.id
            )
            panel["postulacion_id"] = str(existing.id) if existing else None

            empresa = await repo_empresas.obtener(db, empresa_uuid)
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
    rubro: str | None = Query(None, description="Filtrar por RubroN2"),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

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
    texto: str = Query(
        ..., min_length=3, description="Texto a buscar (nombre producto, servicio, etc.)"
    ),
    top_n: int = Query(20, ge=1, le=100, description="Número máximo de proveedores a retornar"),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
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
    # "Matching semántico" se VENDE como capacidad del plan Pro
    # (`/api/billing/plans`), y este endpoint sólo comprobaba el flag de la
    # feature y la pertenencia a la empresa. Con FEATURE_TFIDF apagado no se
    # notaba —responde 503 para todos— pero encenderlo regalaba una capacidad
    # de pago. Lo detectó tests/test_contrato_bi.py.
    _plan: Empresa = Depends(require_plan("pro")),
):
    _require_tfidf_flag()
    from app.services import tfidf_matcher

    # Verify user membership in empresa
    await verificar_acceso_empresa(empresa_id, current_user, db)

    if not tfidf_matcher.is_available():
        return PerfilMatchResponse(
            disponible=False,
            codigo_externo=codigo_externo,
            motivo="Modelo TF-IDF no entrenado",
        )

    # Load empresa TF-IDF profile
    perfil = await repo_empresas.perfil_tfidf(db, empresa_id)
    if not perfil or not perfil.vector_bytes:
        return PerfilMatchResponse(
            disponible=True,
            codigo_externo=codigo_externo,
            licitacion_nombre=texto[:120],
            nivel="sin_perfil",
            motivo="La empresa no tiene perfil TF-IDF configurado. Configura tus rubros en Inteligencia BI.",
        )

    try:
        score, nivel = tfidf_matcher.score_empresa_licitacion(perfil.vector_bytes, texto)
    except Exception:
        return PerfilMatchResponse(
            disponible=True,
            codigo_externo=codigo_externo,
            licitacion_nombre=texto[:120],
            nivel="error",
            motivo="Error al calcular similitud — el perfil puede necesitar recalibración.",
        )
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
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    _require_tfidf_flag()
    empresa_id = ctx.empresa_id

    perfil = await repo_empresas.perfil_tfidf(db, empresa_id)
    if not perfil:
        return TFIDFPerfilResponse(
            empresa_id=str(empresa_id),
            descripcion=None,
            rubros_usados=None,
            modelo_version=None,
            actualizado_en=None,
            tiene_vector=False,
        )

    return TFIDFPerfilResponse(
        empresa_id=str(empresa_id),
        descripcion=perfil.descripcion,
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
    body: TFIDFPerfilUpdate,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    _require_tfidf_flag()
    from app.services import tfidf_matcher

    empresa_id = ctx.empresa_id

    # Try to build TF-IDF vector — best-effort, don't block saving rubros if unavailable
    # Use b'' as placeholder to satisfy NOT NULL constraint when model is unavailable
    vector_bytes: bytes = b""
    if tfidf_matcher.is_available():
        # **La descripción va primero y pesa el doble.** Repetirla es la forma
        # barata de ponderar en TF-IDF sin tocar el modelo, y hace falta: los
        # rubros son etiquetas de una taxonomía compartida, así que sin este
        # peso dos empresas del mismo rubro vuelven a tener casi el mismo
        # vector — que es justo el problema que la descripción viene a resolver.
        partes = [body.descripcion or "", body.descripcion or ""] + list(body.rubros_usados)
        rubros_text = " ".join(p for p in partes if p.strip())
        try:
            vector_bytes = tfidf_matcher.build_empresa_vector(rubros_text)
        except Exception:
            # Se mantiene el placeholder b''; el vector se puede reconstruir después.
            # `(ValueError, Exception)` era redundante — ValueError ya es Exception.
            # Sin log, un fallo permanente del matcher era invisible.
            logger.warning(
                "No se pudo construir el vector TF-IDF para la empresa %s; "
                "se guardan los rubros con vector vacío",
                empresa_id,
                exc_info=True,
            )

    # Upsert TFIDFPerfil — always save rubros regardless of vector availability
    perfil = await repo_empresas.perfil_tfidf(db, empresa_id)
    if perfil:
        if vector_bytes:  # Only overwrite existing vector if we built a real one
            perfil.vector_bytes = vector_bytes
        perfil.descripcion = body.descripcion
        perfil.rubros_usados = body.rubros_usados
        perfil.modelo_version = "v1"
    else:
        perfil = TFIDFPerfil(
            empresa_id=empresa_id,
            vector_bytes=vector_bytes,
            descripcion=body.descripcion,
            rubros_usados=body.rubros_usados,
            modelo_version="v1",
        )
        db.add(perfil)

    await db.commit()
    await db.refresh(perfil)

    return TFIDFPerfilResponse(
        empresa_id=str(empresa_id),
        descripcion=perfil.descripcion,
        rubros_usados=perfil.rubros_usados,
        modelo_version=perfil.modelo_version,
        actualizado_en=perfil.updated_at.isoformat() if perfil.updated_at else None,
        tiene_vector=bool(vector_bytes),
    )


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
    current_user: User = Depends(get_current_active_user),
):
    _require_analytics()
    from app.services import bi as bi_service

    result = bi_service.get_rubros(limit=limit)
    return result


@router.get(
    "/exportar/precio/{codigo_producto}",
    summary="Descargar en CSV la banda de precio de un producto",
    description=(
        "Devuelve el mismo análisis que `/bi/precio/{codigo_producto}` en un CSV "
        "listo para Excel. **Descuenta cuota de BI igual que la consulta en "
        "pantalla**: si no lo hiciera, sería la forma de saltarse el medidor."
    ),
    response_class=Response,
)
def exportar_precio(
    codigo_producto: str,
    organismo_id: str | None = Query(None),
    unidad_medida: str | None = Query(None),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service
    from app.services import exportar

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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service
    from app.services import exportar

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
    "/rubros/sugerir",
    response_model=SugerenciaRubrosResponse,
    summary="Rubros propuestos a partir de una descripción en lenguaje natural",
    description=(
        "Recibe lo que la empresa dice que hace y devuelve los rubros de la taxonomía "
        "de ChileCompra más cercanos, para que el usuario **corrija** en vez de elegir "
        "a ciegas entre 354 opciones que no escribió él."
    ),
)
def sugerir_rubros(
    descripcion: str = Query(..., min_length=10, max_length=2000),
    limit: int = Query(6, ge=1, le=20),
    current_user: User = Depends(get_current_active_user),
):
    _require_analytics()
    _require_tfidf_flag()
    from app.services import bi as bi_service
    from app.services import tfidf_matcher

    catalogo = bi_service.get_rubros(limit=354)
    if not catalogo.get("disponible"):
        return {"disponible": False, "sugerencias": [], "motivo": catalogo.get("motivo")}

    nombres = catalogo["rubros"]
    similitudes = tfidf_matcher.score_texts(descripcion, nombres)

    # Se desempata por nombre: muchos rubros dan la misma similitud sobre una
    # descripción corta, y con `head` el empate decide QUÉ rubros entran, no
    # sólo en qué orden. Sin esto, dos llamadas iguales devuelven listas
    # distintas según el orden físico de las filas.
    pares = sorted(zip(nombres, similitudes, strict=True), key=lambda p: (-p[1], p[0]))

    # Por debajo de esto la sugerencia es ruido: proponer un rubro al azar es
    # peor que no proponer ninguno, porque el usuario lo acepta sin mirar.
    UMBRAL = 0.05
    sugerencias = [
        {"codigo": None, "nombre": nombre, "similitud": round(sim, 4)}
        for nombre, sim in pares[:limit]
        if sim >= UMBRAL
    ]

    return {
        "disponible": True,
        "sugerencias": sugerencias,
        "motivo": None if sugerencias else "la descripción no se parece a ningún rubro conocido",
    }


@router.get(
    "/panorama",
    response_model=PanoramaResponse,
    summary="Panorama completo de un rubro",
    description=(
        "Tamaño y ticket del mercado, concentración real, estacionalidad agregada y "
        "compradores con banderas de riesgo — todo del **rubro**, no de un par "
        "organismo×rubro.\n\n"
        "Va en una sola llamada porque la pantalla los necesita juntos: cinco peticiones "
        "serían cinco estados de carga, cinco formas de fallar a medias y cinco descuentos "
        "de cuota por una sola pregunta del usuario."
    ),
)
def get_panorama(
    rubro: str = Query(..., min_length=1, description="RubroN2 de la taxonomía de ChileCompra"),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

    return bi_service.get_panorama(rubro)


@router.get(
    "/resumen",
    response_model=ResumenResponse,
    summary="Resumen narrativo de un rubro (para MarketSummaryCard + teasers paywall)",
    description=(
        "Combina time_series + market_concentration + buyer_scores + opportunity_scores + "
        "seasonality_patterns en una sola respuesta liviana. Incluye teasers para las "
        "secciones gated que el plan básico ve sin gastar quota."
    ),
)
def get_resumen(
    rubro: str = Query(..., min_length=1, description="RubroN2 a resumir"),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi as bi_service

    return bi_service.get_resumen(rubro)


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
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
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


@router.get(
    "/mi_posicion",
    response_model=MiPosicionResponse,
    summary="Posición de la empresa del usuario en un rubro (personalización)",
    description=(
        "Traduce el RUT de la empresa a su código de proveedor de Mercado Público y "
        "lo cruza con las tablas de competencia y diversificación. Devuelve puesto, "
        "participación en el rubro, compradores atendidos y concentración de cartera. "
        "Requiere acceso a la empresa (EmpresaUsuario)."
    ),
)
async def get_mi_posicion(
    empresa_id: UUID = Query(..., description="UUID de la empresa del usuario"),
    rubro: str = Query(..., min_length=1, description="RubroN2 a analizar"),
    db: AsyncSession = Depends(get_db),
    empresa_cuota: Empresa = Depends(check_bi_quota_dep),
    current_user: User = Depends(get_current_active_user),
):
    _require_analytics()
    from app.services import bi as bi_service

    # Verificar membership a la empresa
    await verificar_acceso_empresa(empresa_id, current_user, db)

    empresa = await repo_empresas.obtener(db, empresa_id)

    # La columna es `rut_empresa`. Esto decía `empresa.rut`, que no existe en el
    # modelo, así que el endpoint lanzaba AttributeError y devolvía 500 en TODAS
    # las llamadas — en la pantalla principal de BI. No lo destapó ningún test
    # porque los que había llamaban a la función del servicio, no al endpoint:
    # un atributo que no existe sólo aparece ejecutando la ruta.
    if not empresa or not empresa.rut_empresa:
        return {
            "disponible": False,
            "tiene_historial": False,
            "motivo": "La empresa no tiene RUT registrado",
        }

    # El RUT no sirve para cruzar con analytics: allí el proveedor se identifica
    # por `CodigoProveedor`, el código interno de Mercado Público. La traducción
    # sale de `ordenes_compra`, que guarda los dos.
    codigo = await repo_proveedores.codigo_por_rut(db, empresa.rut_empresa)
    if not codigo:
        return {
            "disponible": True,
            "tiene_historial": False,
            "motivo": (
                "No encontramos órdenes de compra a nombre de este RUT. "
                "Si tu empresa ya vendió al Estado, revisa que el RUT esté bien escrito."
            ),
        }

    return bi_service.get_mi_posicion(codigo, rubro)


@router.get(
    "/productos",
    response_model=ProductosResponse,
    summary="Buscar productos por nombre (autocomplete)",
    description="Busca en product_price_bands_L3 por substring en el nombre del producto.",
)
def get_productos(
    q: str = Query(..., min_length=2, description="Texto a buscar en el nombre del producto"),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_active_user),
):
    _require_analytics()
    from app.services import bi as bi_service

    return bi_service.get_productos(q, limit)


@router.get(
    "/radar_semanal",
    response_model=RadarResponse,
    summary="Radar semanal de movimientos para una empresa",
    description=(
        "Detecta los 3 movimientos más relevantes en los rubros de la empresa: "
        "nueva licitación con score TF-IDF alto, oportunidad destacada, comprador activo. "
        "Computado on-demand. Misma data que el email semanal del lunes."
    ),
)
async def get_radar_semanal(
    empresa_id: UUID = Query(..., description="UUID de la empresa"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_analytics()
    from app.services import radar_service

    # Verificar membership
    await verificar_acceso_empresa(empresa_id, current_user, db)

    # radar_service usa session síncrona → abrir una sesión sync para esto
    from app.db import SyncSessionLocal

    sync_db = SyncSessionLocal()
    try:
        return radar_service.compute_radar_for_empresa(sync_db, empresa_id)
    finally:
        sync_db.close()

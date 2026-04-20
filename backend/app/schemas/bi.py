"""Pydantic schemas for BI API responses."""
from typing import Any, Optional
from pydantic import BaseModel


class BINotAvailable(BaseModel):
    disponible: bool = False
    motivo: str


class PrecioBanda(BaseModel):
    codigoProductoONU: Optional[str] = None
    NombreProductoGenerico: Optional[str] = None
    p10: Optional[float] = None
    p25: Optional[float] = None
    p50: Optional[float] = None
    p75: Optional[float] = None
    p90: Optional[float] = None
    pu_mean: Optional[float] = None
    cv: Optional[float] = None
    confianza: Optional[str] = None
    n: Optional[int] = None


class PrecioResponse(BaseModel):
    disponible: bool
    codigo_producto: Optional[str] = None
    resultado: Optional[list[PrecioBanda]] = None
    total_registros: Optional[int] = None
    nivel_usado: Optional[str] = None  # "L1", "L2", "L3"
    fallback: bool = False
    fallback_motivo: Optional[str] = None
    motivo: Optional[str] = None


class Competidor(BaseModel):
    CodigoOrganismoPublico: Optional[str] = None
    OrganismoPublico: Optional[str] = None
    RubroN2: Optional[str] = None
    CodigoProveedor: Optional[str] = None
    NombreProveedor: Optional[str] = None
    market_share_pct: Optional[float] = None
    win_rate_pct: Optional[float] = None
    rank_monto: Optional[int] = None
    n_oc: Optional[int] = None
    monto_total: Optional[float] = None
    n_proveedores: Optional[int] = None


class Concentracion(BaseModel):
    RubroN2: Optional[str] = None
    hhi: Optional[float] = None
    tipo_mercado: Optional[str] = None
    n_proveedores: Optional[int] = None


class CompetidoresResponse(BaseModel):
    disponible: bool
    organismo_id: Optional[str] = None
    competidores: Optional[list[Competidor]] = None
    concentracion: Optional[list[Concentracion]] = None
    motivo: Optional[str] = None


class Oportunidad(BaseModel):
    CodigoOrganismoPublico: Optional[str] = None
    NombreOrganismo: Optional[str] = None
    RubroN2: Optional[str] = None
    opportunity_score: Optional[float] = None
    n_transacciones: Optional[int] = None
    coef_variacion: Optional[float] = None
    hhi: Optional[float] = None
    n_proveedores: Optional[int] = None
    cagr: Optional[float] = None


class FiltrosOportunidades(BaseModel):
    organismo_id: Optional[str] = None
    rubro: Optional[str] = None
    min_score: float


class OportunidadesResponse(BaseModel):
    disponible: bool
    oportunidades: Optional[list[Oportunidad]] = None
    total: Optional[int] = None
    filtros: Optional[FiltrosOportunidades] = None
    motivo: Optional[str] = None


class VentanaResponse(BaseModel):
    disponible: bool
    codigo_externo: Optional[str] = None
    alerta_ventana_corta: Optional[bool] = None
    presion_score: Optional[float] = None
    clasificacion_ventana: Optional[str] = None
    pct_del_tipico: Optional[float] = None
    window_days: Optional[int] = None
    motivo: Optional[str] = None


class PagoStats(BaseModel):
    mediana_dias_pago: Optional[float] = None
    p75_dias_pago: Optional[float] = None
    p90_dias_pago: Optional[float] = None
    tasa_aceptacion: Optional[float] = None
    tasa_cancelacion: Optional[float] = None
    tasa_adjudicacion: Optional[float] = None


class ScoresDetalle(BaseModel):
    velocidad_pago: Optional[float] = None
    tasa_aceptacion: Optional[float] = None
    no_cancelacion: Optional[float] = None
    adjudicacion: Optional[float] = None
    regularidad: Optional[float] = None
    volumen: Optional[float] = None
    satisfaccion: Optional[float] = None


class RiskFlags(BaseModel):
    n_flags: int = 0
    pago_lento: bool = False
    pago_impredecible: bool = False
    cancelaciones: bool = False
    licitaciones_fallidas: bool = False
    baja_calificacion: bool = False
    compras_irregulares: bool = False


class VolumenComprador(BaseModel):
    n_oc_total: Optional[int] = None
    n_meses_activo: Optional[int] = None
    prom_calificacion: Optional[float] = None
    prom_oferentes: Optional[float] = None


class TransparenciaComprador(BaseModel):
    transparencia_score: Optional[float] = None
    # muy_transparente | transparente | moderado | poco_transparente | opaco
    clasificacion: Optional[str] = None
    pct_trato_directo: Optional[float] = None
    tasa_fracaso: Optional[float] = None
    hhi: Optional[float] = None
    n_lic_total: Optional[int] = None


class CompradorResponse(BaseModel):
    disponible: bool
    organismo_id: Optional[str] = None
    nombre: Optional[str] = None
    buyer_score: Optional[float] = None
    clasificacion: Optional[str] = None
    pago: Optional[PagoStats] = None
    scores_detalle: Optional[ScoresDetalle] = None
    risk_flags: Optional[RiskFlags] = None
    volumen: Optional[VolumenComprador] = None
    transparencia: Optional[TransparenciaComprador] = None
    motivo: Optional[str] = None


# ─── TF-IDF Matching schemas ─────────────────────────────────────────────────

class ProveedorMatch(BaseModel):
    CodigoProveedor: str
    NombreProveedor: Optional[str] = None
    n_oc: Optional[int] = None
    similarity_score: float


class MatchingResponse(BaseModel):
    disponible: bool
    query: Optional[str] = None
    resultados: Optional[list[ProveedorMatch]] = None
    total: Optional[int] = None
    motivo: Optional[str] = None


class PerfilMatchResponse(BaseModel):
    disponible: bool
    codigo_externo: Optional[str] = None
    licitacion_nombre: Optional[str] = None
    score_encaje: Optional[float] = None
    # nivel ∈ {alto, medio, bajo, sin_encaje, sin_perfil}
    nivel: Optional[str] = None
    motivo: Optional[str] = None


class ClusterItem(BaseModel):
    cluster_id: Optional[int] = None
    label: Optional[str] = None
    keywords: Optional[str] = None
    n_productos: Optional[int] = None
    frecuencia_total: Optional[int] = None
    rubro_dominante: Optional[str] = None


class ClustersResponse(BaseModel):
    disponible: bool
    clusters: Optional[list[ClusterItem]] = None
    total: Optional[int] = None
    motivo: Optional[str] = None


class RubrosResponse(BaseModel):
    disponible: bool
    rubros: Optional[list[str]] = None
    total: Optional[int] = None


class TFIDFPerfilResponse(BaseModel):
    empresa_id: str
    rubros_usados: Optional[list[str]] = None
    modelo_version: Optional[str] = None
    actualizado_en: Optional[str] = None
    tiene_vector: bool = False


class TFIDFPerfilUpdate(BaseModel):
    rubros_usados: list[str] = []


# ─── Licitación BI Panel schemas ─────────────────────────────────────────────

class CompradorPanel(BaseModel):
    disponible: bool
    nombre: Optional[str] = None
    buyer_score: Optional[float] = None
    clasificacion: Optional[str] = None
    mediana_dias_pago: Optional[float] = None
    tasa_adjudicacion: Optional[float] = None
    n_flags: int = 0
    transparencia: Optional[TransparenciaComprador] = None
    motivo: Optional[str] = None


class VentanaPanel(BaseModel):
    disponible: bool
    alerta_ventana_corta: Optional[bool] = None
    presion_score: Optional[float] = None
    clasificacion_ventana: Optional[str] = None
    pct_del_tipico: Optional[float] = None
    window_days: Optional[int] = None
    motivo: Optional[str] = None


class CompetidoresPanel(BaseModel):
    disponible: bool
    top5: Optional[list[Competidor]] = None
    hhi: Optional[float] = None
    tipo_mercado: Optional[str] = None
    motivo: Optional[str] = None


class PrecioFallback(BaseModel):
    disponible: bool
    codigo_producto: Optional[str] = None
    nivel_usado: Optional[str] = None  # "L1", "L2", "L3"
    fallback: bool = False
    p10: Optional[float] = None
    p25: Optional[float] = None
    p50: Optional[float] = None
    p75: Optional[float] = None
    p90: Optional[float] = None
    confianza: Optional[str] = None
    n: Optional[int] = None


class LicitacionBIPanel(BaseModel):
    codigo_externo: str
    organismo_id: Optional[str] = None
    comprador: CompradorPanel
    ventana: VentanaPanel
    competidores: CompetidoresPanel
    precios: list[PrecioFallback] = []
    postulacion_id: Optional[str] = None
    estado_habil: Optional[str] = None


# ─── Paso D: extended BI schemas ─────────────────────────────────────────────

class EstacionalidadMes(BaseModel):
    mes: Optional[int] = None
    compras_mes: Optional[float] = None
    prob_mes: Optional[float] = None
    consistencia: Optional[float] = None
    z_score: Optional[float] = None
    es_pico_estacional: Optional[bool] = None


class EstacionalidadResponse(BaseModel):
    disponible: bool
    organismo_id: Optional[str] = None
    rubro: Optional[str] = None
    patrones: Optional[list[EstacionalidadMes]] = None
    motivo: Optional[str] = None


class TendenciaItem(BaseModel):
    CodigoOrganismoPublico: Optional[str] = None
    RubroN2: Optional[str] = None
    slope_mensual: Optional[float] = None
    r_squared: Optional[float] = None
    cagr: Optional[float] = None
    tendencia: Optional[str] = None


class SerieAnualPunto(BaseModel):
    anio: int
    monto_total: float
    n_oc: Optional[int] = None


class TendenciaResponse(BaseModel):
    disponible: bool
    tendencias: Optional[list[TendenciaItem]] = None
    emergentes: Optional[list[TendenciaItem]] = None
    serie_anual: Optional[list[SerieAnualPunto]] = None  # YoY sparkline when rubro is filtered
    total: Optional[int] = None
    motivo: Optional[str] = None


class DescuentoItem(BaseModel):
    CodigoTipo: Optional[str] = None
    Rubro2: Optional[str] = None
    n_oferentes_rango: Optional[str] = None
    n: Optional[int] = None
    p10: Optional[float] = None
    p25: Optional[float] = None
    p50: Optional[float] = None
    p75: Optional[float] = None
    p90: Optional[float] = None
    media: Optional[float] = None
    cv_descuento: Optional[float] = None
    senial_competencia: Optional[str] = None  # señal_competencia mapped for JSON


class DescuentoResponse(BaseModel):
    disponible: bool
    tipo: Optional[str] = None
    rubro: Optional[str] = None
    descuentos: Optional[list[DescuentoItem]] = None
    total: Optional[int] = None
    motivo: Optional[str] = None


class ForecastCompetidoresItem(BaseModel):
    CodigoOrganismo: Optional[str] = None
    NombreOrganismo: Optional[str] = None
    Rubro2: Optional[str] = None
    CodigoTipo: Optional[str] = None
    n: Optional[int] = None
    p10: Optional[float] = None
    p25: Optional[float] = None
    p50: Optional[float] = None
    p75: Optional[float] = None
    p90: Optional[float] = None
    media: Optional[float] = None
    pct_sin_competencia: Optional[float] = None
    pct_baja_competencia: Optional[float] = None
    nivel: Optional[str] = None


class ForecastCompetidoresResponse(BaseModel):
    disponible: bool
    nivel_usado: Optional[str] = None  # "L1", "L2", "L3"
    fallback: bool = False
    organismo_id: Optional[str] = None
    rubro: Optional[str] = None
    tipo: Optional[str] = None
    data: Optional[list[ForecastCompetidoresItem]] = None
    motivo: Optional[str] = None


class DiversificacionResponse(BaseModel):
    disponible: bool
    codigo_proveedor: Optional[str] = None
    nombre_proveedor: Optional[str] = None
    hhi_org: Optional[float] = None
    score_diversificacion: Optional[float] = None
    clasificacion: Optional[str] = None
    n_oc: Optional[int] = None
    n_organismos: Optional[int] = None
    alerta_dependencia: Optional[bool] = None
    motivo: Optional[str] = None


class SectorItem(BaseModel):
    sector: Optional[str] = None
    n_oc: Optional[int] = None
    monto_total: Optional[float] = None
    ticket_mediana: Optional[float] = None
    n_organismos: Optional[int] = None
    n_proveedores: Optional[int] = None


class SectorResponse(BaseModel):
    disponible: bool
    sectores: Optional[list[SectorItem]] = None
    total: Optional[int] = None
    motivo: Optional[str] = None

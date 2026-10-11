"""Pydantic schemas for BI API responses."""

from pydantic import BaseModel


class BINotAvailable(BaseModel):
    disponible: bool = False
    motivo: str


class PrecioBanda(BaseModel):
    codigoProductoONU: str | None = None
    NombreProductoGenerico: str | None = None
    #: Firma normalizada del producto. Sólo viene en los niveles L0 y L0N, que
    #: son los que agrupan por producto real y no por categoría UNSPSC.
    firma_producto: str | None = None
    #: Cómo escribió ese producto quien más veces lo compró. Es lo que se
    #: muestra: la firma es una bolsa de palabras ordenada, buena para agrupar
    #: y mala para leer.
    descripcion: str | None = None
    #: La unidad en la que está expresado el precio unitario (p10..p90,
    #: pu_mean). Se seleccionaba internamente en el repositorio pero no estaba
    #: declarada aquí, así que Pydantic la descartaba al serializar: un precio
    #: sin unidad es la misma clase de error que la categoría que mezclaba un
    #: calibrador y un criovial — "$2.380" significa algo distinto por unidad
    #: que por caja de 100. Ausente en L4, que agrega por rubro y no tiene una
    #: unidad única que reportar.
    UnidadMedida: str | None = None
    p10: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p90: float | None = None
    pu_mean: float | None = None
    cv: float | None = None
    #: Coeficiente cuartílico de dispersión, (p75−p25)/(p75+p25), en [0,1].
    #: Es la medida de dispersión que hay que mirar: `cv` se conserva por
    #: compatibilidad, pero sobre precios con cola larga mide el outlier que
    #: sobrevivió al filtro, no el mercado.
    qcd: float | None = None
    #: `alta` | `media` | `baja`. La lectura de producto de `qcd` y `n`.
    #: **Predictibilidad baja no es un hueco, es un hallazgo**: significa que
    #: este comprador paga precios muy distintos por lo mismo, y por tanto que
    #: el precio probablemente no sea lo que decide la adjudicación.
    predictibilidad: str | None = None
    # El pipeline produce confianza como Float64 (0–1), no como texto.
    # Declararla `str` hacía que /api/bi/precio devolviera siempre 500 con
    # ResponseValidationError en cuanto había datos. Nunca se detectó porque
    # FEATURE_ANALYTICS=false cortaba con 503 antes de llegar aquí.
    confianza: float | None = None
    n: int | None = None


class PrecioResponse(BaseModel):
    disponible: bool
    codigo_producto: str | None = None
    resultado: list[PrecioBanda] | None = None
    total_registros: int | None = None
    #: "L0" | "L0N" | "L1" | "L2" | "L3" | "L4", de más a menos específico.
    #: L0 y L0N agrupan por producto real; de L1 en adelante, por categoría
    #: UNSPSC — que puede contener artículos que difieren en varios órdenes de
    #: magnitud. El nivel dice cuánto vale el número.
    nivel_usado: str | None = None
    fallback: bool = False
    fallback_motivo: str | None = None
    motivo: str | None = None


class Competidor(BaseModel):
    CodigoOrganismoPublico: str | None = None
    OrganismoPublico: str | None = None
    RubroN2: str | None = None
    CodigoProveedor: str | None = None
    NombreProveedor: str | None = None
    market_share_pct: float | None = None
    win_rate_pct: float | None = None
    rank_monto: int | None = None
    n_oc: int | None = None
    monto_total: float | None = None
    n_proveedores: int | None = None


class Concentracion(BaseModel):
    RubroN2: str | None = None
    hhi: float | None = None
    tipo_mercado: str | None = None
    n_proveedores: int | None = None


class CompetidoresResponse(BaseModel):
    disponible: bool
    organismo_id: str | None = None
    competidores: list[Competidor] | None = None
    concentracion: list[Concentracion] | None = None
    motivo: str | None = None


class Oportunidad(BaseModel):
    CodigoOrganismoPublico: str | None = None
    NombreOrganismo: str | None = None
    RubroN2: str | None = None
    opportunity_score: float | None = None
    n_transacciones: int | None = None
    coef_variacion: float | None = None
    hhi: float | None = None
    n_proveedores: int | None = None
    cagr: float | None = None


class FiltrosOportunidades(BaseModel):
    organismo_id: str | None = None
    rubro: str | None = None
    min_score: float


class OportunidadesResponse(BaseModel):
    disponible: bool
    oportunidades: list[Oportunidad] | None = None
    total: int | None = None
    filtros: FiltrosOportunidades | None = None
    motivo: str | None = None


class VentanaResponse(BaseModel):
    disponible: bool
    codigo_externo: str | None = None
    alerta_ventana_corta: bool | None = None
    presion_score: float | None = None
    clasificacion_ventana: str | None = None
    pct_del_tipico: float | None = None
    window_days: int | None = None
    motivo: str | None = None


class TramitacionStats(BaseModel):
    """Cómo tramita sus órdenes este comprador.

    **No son días de pago.** Lo que mide el dato es `FechaEnvio →
    FechaAceptacion`: lo que tarda el proveedor en aceptar la orden. La mediana
    global es de 1,4 días, lo que ya delataba que no era un plazo de pago — y
    aun así el producto decía «paga a N días» en la pantalla, en el correo y en
    la web.

    **La fecha de pago no está en el dato de ChileCompra.** Las únicas fechas
    del archivo de órdenes son creación, envío, aceptación, cancelación y última
    modificación; `Forma de Pago` tampoco sirve, porque el 98,7 % de las órdenes
    dice lo mismo. Si algún día aparece, esta clase es donde va.
    """

    mediana_dias_aceptacion: float | None = None
    p75_dias_aceptacion: float | None = None
    p90_dias_aceptacion: float | None = None
    tasa_aceptacion: float | None = None
    tasa_cancelacion: float | None = None
    tasa_adjudicacion: float | None = None


class ScoresDetalle(BaseModel):
    velocidad_aceptacion: float | None = None
    tasa_aceptacion: float | None = None
    no_cancelacion: float | None = None
    adjudicacion: float | None = None
    regularidad: float | None = None
    volumen: float | None = None
    satisfaccion: float | None = None


class RiskFlags(BaseModel):
    n_flags: int = 0
    aceptacion_lenta: bool = False
    aceptacion_impredecible: bool = False
    cancelaciones: bool = False
    licitaciones_fallidas: bool = False
    baja_calificacion: bool = False
    compras_irregulares: bool = False


class VolumenComprador(BaseModel):
    n_oc_total: int | None = None
    n_meses_activo: int | None = None
    prom_calificacion: float | None = None
    prom_oferentes: float | None = None


class TransparenciaComprador(BaseModel):
    transparencia_score: float | None = None
    # muy_transparente | transparente | moderado | poco_transparente | opaco
    clasificacion: str | None = None
    pct_trato_directo: float | None = None
    tasa_fracaso: float | None = None
    hhi: float | None = None
    n_lic_total: int | None = None


class CompradorResponse(BaseModel):
    disponible: bool
    organismo_id: str | None = None
    nombre: str | None = None
    buyer_score: float | None = None
    clasificacion: str | None = None
    tramitacion: TramitacionStats | None = None
    scores_detalle: ScoresDetalle | None = None
    risk_flags: RiskFlags | None = None
    volumen: VolumenComprador | None = None
    transparencia: TransparenciaComprador | None = None
    motivo: str | None = None


# ─── TF-IDF Matching schemas ─────────────────────────────────────────────────


class ProveedorMatch(BaseModel):
    CodigoProveedor: str
    NombreProveedor: str | None = None
    n_oc: int | None = None
    similarity_score: float


class MatchingResponse(BaseModel):
    disponible: bool
    query: str | None = None
    resultados: list[ProveedorMatch] | None = None
    total: int | None = None
    motivo: str | None = None


class ClusterItem(BaseModel):
    cluster_id: int | None = None
    label: str | None = None
    keywords: str | None = None
    n_productos: int | None = None
    frecuencia_total: int | None = None
    rubro_dominante: str | None = None


class ClustersResponse(BaseModel):
    disponible: bool
    clusters: list[ClusterItem] | None = None
    total: int | None = None
    motivo: str | None = None


class RubrosResponse(BaseModel):
    disponible: bool
    rubros: list[str] | None = None
    total: int | None = None


# ─── Licitación BI Panel schemas ─────────────────────────────────────────────


class CompradorPanel(BaseModel):
    disponible: bool
    nombre: str | None = None
    buyer_score: float | None = None
    clasificacion: str | None = None
    #: Días hasta que la orden se acepta. **No es el plazo de pago** — ver
    #: `TramitacionStats`.
    mediana_dias_aceptacion: float | None = None
    tasa_adjudicacion: float | None = None
    n_flags: int = 0
    transparencia: TransparenciaComprador | None = None
    motivo: str | None = None


class VentanaPanel(BaseModel):
    disponible: bool
    alerta_ventana_corta: bool | None = None
    presion_score: float | None = None
    clasificacion_ventana: str | None = None
    pct_del_tipico: float | None = None
    window_days: int | None = None
    motivo: str | None = None


class CompetidoresPanel(BaseModel):
    disponible: bool
    top5: list[Competidor] | None = None
    hhi: float | None = None
    tipo_mercado: str | None = None
    motivo: str | None = None


class PrecioFallback(BaseModel):
    disponible: bool
    codigo_producto: str | None = None
    nivel_usado: str | None = None  # "L1", "L2", "L3"
    fallback: bool = False
    p10: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p90: float | None = None
    # El pipeline produce confianza como Float64 (0–1), no como texto.
    # Declararla `str` hacía que /api/bi/precio devolviera siempre 500 con
    # ResponseValidationError en cuanto había datos. Nunca se detectó porque
    # FEATURE_ANALYTICS=false cortaba con 503 antes de llegar aquí.
    confianza: float | None = None
    n: int | None = None


class LicitacionBIPanel(BaseModel):
    codigo_externo: str
    organismo_id: str | None = None
    comprador: CompradorPanel
    ventana: VentanaPanel
    competidores: CompetidoresPanel
    precios: list[PrecioFallback] = []


# ─── Paso D: extended BI schemas ─────────────────────────────────────────────


class EstacionalidadMes(BaseModel):
    mes: int | None = None
    compras_mes: float | None = None
    prob_mes: float | None = None
    consistencia: float | None = None
    z_score: float | None = None
    es_pico_estacional: bool | None = None


class EstacionalidadResponse(BaseModel):
    disponible: bool
    organismo_id: str | None = None
    rubro: str | None = None
    patrones: list[EstacionalidadMes] | None = None
    motivo: str | None = None


class TendenciaItem(BaseModel):
    CodigoOrganismoPublico: str | None = None
    RubroN2: str | None = None
    slope_mensual: float | None = None
    r_squared: float | None = None
    cagr: float | None = None
    tendencia: str | None = None


class SerieAnualPunto(BaseModel):
    anio: int
    monto_total: float
    n_oc: int | None = None


class TendenciaResponse(BaseModel):
    disponible: bool
    tendencias: list[TendenciaItem] | None = None
    emergentes: list[TendenciaItem] | None = None
    serie_anual: list[SerieAnualPunto] | None = None  # YoY sparkline when rubro is filtered
    cagr_rubro: float | None = (
        None  # CAGR rubro-level computed from serie_anual (complete years only)
    )
    total: int | None = None
    motivo: str | None = None


class DescuentoItem(BaseModel):
    CodigoTipo: str | None = None
    Rubro2: str | None = None
    n_oferentes_rango: str | None = None
    n: int | None = None
    p10: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p90: float | None = None
    media: float | None = None
    cv_descuento: float | None = None
    senial_competencia: str | None = None  # señal_competencia mapped for JSON


class DescuentoResponse(BaseModel):
    disponible: bool
    tipo: str | None = None
    rubro: str | None = None
    descuentos: list[DescuentoItem] | None = None
    total: int | None = None
    motivo: str | None = None


class ForecastCompetidoresItem(BaseModel):
    CodigoOrganismo: str | None = None
    NombreOrganismo: str | None = None
    Rubro2: str | None = None
    CodigoTipo: str | None = None
    n: int | None = None
    p10: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p90: float | None = None
    media: float | None = None
    pct_sin_competencia: float | None = None
    pct_baja_competencia: float | None = None
    # El pipeline emite el nivel de fallback como Int32 (1, 2, 3), no como texto.
    # Declararlo `str` hacía que /api/bi/forecast_competidores devolviera 500 en
    # cuanto había datos. No confundir con PerfilMatchResponse.nivel, que sí es
    # texto ("alto"/"medio"/"bajo").
    nivel: int | None = None


class ForecastCompetidoresResponse(BaseModel):
    disponible: bool
    nivel_usado: str | None = None  # "L1", "L2", "L3"
    fallback: bool = False
    organismo_id: str | None = None
    rubro: str | None = None
    tipo: str | None = None
    data: list[ForecastCompetidoresItem] | None = None
    motivo: str | None = None


class DiversificacionResponse(BaseModel):
    disponible: bool
    codigo_proveedor: str | None = None
    nombre_proveedor: str | None = None
    hhi_org: float | None = None
    score_diversificacion: float | None = None
    clasificacion: str | None = None
    n_oc: int | None = None
    n_organismos: int | None = None
    alerta_dependencia: bool | None = None
    motivo: str | None = None


class SectorItem(BaseModel):
    sector: str | None = None
    n_oc: int | None = None
    monto_total: float | None = None
    ticket_mediana: float | None = None
    n_organismos: int | None = None
    n_proveedores: int | None = None


class SectorResponse(BaseModel):
    disponible: bool
    sectores: list[SectorItem] | None = None
    total: int | None = None
    motivo: str | None = None


# ─── Resumen narrativo (MarketSummaryCard + paywall teasers) ──────────────────


class ResumenTopComprador(BaseModel):
    codigo: str | None = None
    nombre: str | None = None
    #: Se quitó `clasificacion_pago`: cortaba en 30 y 45 días un dato cuyo
    #: máximo es 12,8, así que todos los compradores salían «bueno» siempre.
    n_oc_total: int | None = None
    #: Órdenes de este comprador EN EL RUBRO consultado. `n_oc_total` son todas.
    n_oc_rubro: int | None = None


class ResumenTeaserCompetencia(BaseModel):
    #: Líder del RUBRO: el proveedor con más monto sumando todos sus
    #: compradores. Antes era el líder del par (organismo, rubro) más grande,
    #: publicado como si fuera el del rubro entero.
    lider_nombre: str | None = None
    lider_share_pct: float | None = None
    #: Índice de Herfindahl sobre las cuotas de todos los proveedores del rubro.
    hhi: int | None = None
    tipo_mercado: str | None = None  # "concentrado" | "moderado" | "fragmentado" | "competitivo"


class ResumenTeaserEstacionalidad(BaseModel):
    mes_pico_mayor: str | None = None
    consistencia_avg_pct: int | None = None


class ResumenResponse(BaseModel):
    disponible: bool
    rubro: str | None = None
    monto_anual_clp: float | None = None
    n_organismos: int | None = None
    cagr_pct: float | None = None
    yoy_pct: float | None = None  # último año completo vs año anterior
    n_proveedores_actual: int | None = None
    top_comprador: ResumenTopComprador | None = None
    teaser_competencia: ResumenTeaserCompetencia | None = None
    teaser_estacionalidad: ResumenTeaserEstacionalidad | None = None
    motivo: str | None = None


class ProductoItem(BaseModel):
    codigoProductoONU: str | None = None
    nombre: str | None = None
    n: int | None = None


class ProductosResponse(BaseModel):
    disponible: bool
    resultados: list[ProductoItem] | None = None
    total: int | None = None
    motivo: str | None = None


# ─── Panorama del rubro ──────────────────────────────────────────────────────


class PanoramaMercado(BaseModel):
    disponible: bool = False
    anio: int | None = None
    monto_clp: float | None = None
    n_oc: int | None = None
    #: Promedio y no mediana: `time_series` viene agregado por mes, así que no
    #: quedan órdenes individuales sobre las que sacar una mediana.
    ticket_promedio_clp: float | None = None


class PanoramaLider(BaseModel):
    nombre: str | None = None
    #: Cuota por MONTO. La puede dominar una sola compra enorme.
    share_pct: float | None = None
    #: Cuota por ÓRDENES: cuántas veces gana, no cuánto factura. Es la que
    #: importa cuando se compite por compras chicas y frecuentes.
    share_oc_pct: float | None = None
    n_oc: int | None = None
    n_compradores: int | None = None


class PanoramaCompetencia(BaseModel):
    disponible: bool = False
    n_proveedores: int | None = None
    n_compradores: int | None = None
    monto_clp: float | None = None
    n_oc: int | None = None
    #: Herfindahl sobre las cuotas de TODOS los proveedores del rubro.
    hhi: int | None = None
    tipo_mercado: str | None = None
    #: Cuota conjunta de los cinco primeros. Dice lo mismo que el HHI y se
    #: entiende sin explicarlo.
    share_top5_pct: float | None = None
    lideres: list[PanoramaLider] = []


class PanoramaMes(BaseModel):
    mes: int
    nombre: str
    pct: float


class PanoramaEstacionalidad(BaseModel):
    disponible: bool = False
    meses: list[PanoramaMes] = []
    mes_pico: str | None = None
    pct_pico: float | None = None
    #: Cuánto del año se juega en los tres meses más activos. Con reparto plano
    #: serían 25 %.
    pct_top3: float | None = None
    tiene_temporada: bool = False


class PanoramaCompradorVigilado(BaseModel):
    codigo: str
    nombre: str | None = None
    n_banderas: int = 0
    motivos: list[str] = []


class PanoramaVigilar(BaseModel):
    disponible: bool = False
    n_con_banderas: int = 0
    n_compradores_rubro: int | None = None
    compradores: list[PanoramaCompradorVigilado] = []


class PanoramaResponse(BaseModel):
    """Todo lo que hay que saber de un rubro, en una sola llamada."""

    disponible: bool
    rubro: str | None = None
    mercado: PanoramaMercado | None = None
    competencia: PanoramaCompetencia | None = None
    estacionalidad: PanoramaEstacionalidad | None = None
    vigilar: PanoramaVigilar | None = None
    motivo: str | None = None

// frontend/app/dashboard/bi/types.ts

export interface OportunidadItem {
  CodigoOrganismoPublico: string;
  NombreOrganismo?: string;
  RubroN2: string;
  opportunity_score: number;
  n_transacciones: number;
  coef_variacion: number;
  hhi: number;
  n_proveedores: number;
  cagr: number;
}

export interface TendenciaItem {
  CodigoOrganismoPublico?: string;
  RubroN2: string;
  cagr: number;
  tendencia: string;
  slope_mensual?: number;
  r_squared?: number;
  n_anios?: number;
  total_oc?: number;
  monto_acumulado?: number;
}

export interface CompetidorItem {
  CodigoProveedor: string;
  NombreProveedor: string;
  RubroN2: string;
  market_share_pct: number;
  win_rate_pct: number;
  rank_monto: number;
  n_oc: number;
  monto_total?: number;
}

export interface ConcentracionItem {
  RubroN2: string;
  hhi: number;
  tipo_mercado: string;
  n_proveedores: number;
}

export interface CompradorResult {
  disponible: boolean;
  nombre?: string;
  buyer_score?: number;
  clasificacion?: string;
  /** Antes `pago`. Ninguno de estos números es un plazo de pago: los días son
   *  los que tarda el PROVEEDOR en aceptar la orden, y ChileCompra no publica
   *  fecha de pago en ninguna parte. */
  tramitacion?: {
    mediana_dias_aceptacion?: number;
    p75_dias_aceptacion?: number;
    p90_dias_aceptacion?: number;
    tasa_aceptacion?: number;
    tasa_cancelacion?: number;
    tasa_adjudicacion?: number;
  };
  risk_flags?: {
    n_flags: number;
    aceptacion_lenta: boolean;
    aceptacion_impredecible: boolean;
    cancelaciones: boolean;
    licitaciones_fallidas: boolean;
    baja_calificacion: boolean;
    compras_irregulares: boolean;
  };
  motivo?: string;
}

export interface DescuentoItem {
  CodigoTipo?: string;
  Rubro2?: string;
  n_oferentes_rango?: string;
  p10?: number;
  p50?: number;
  p90?: number;
  media?: number;
  senial_competencia?: string;
  n?: number;
}

export interface EstacionalidadMes {
  mes: number;
  compras_mes?: number;
  prob_mes?: number;
  consistencia?: number;
  z_score?: number;
  es_pico_estacional?: boolean;
}

export interface ClusterItem {
  cluster_id: number;
  label: string;
  keywords?: string;
  n_productos?: number;
  rubro_dominante?: string;
}

export interface TFIDFPerfilData {
  empresa_id: string;
  /** El backend la devuelve y `PUT /bi/perfil` la reescribe entera: guardar sin
   *  mandarla la borra. Faltaba en este tipo, así que nada avisaba. */
  descripcion?: string | null;
  rubros_usados?: string[];
  modelo_version?: string;
  actualizado_en?: string;
  tiene_vector: boolean;
}

// Months in Spanish for chart labels
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Score color helper
export function scoreColor(score: number): string {
  if (score >= 7) return 'text-accent';
  if (score >= 4.5) return 'text-gold';
  return 'text-danger';
}

export function scoreBg(score: number): string {
  if (score >= 7) return 'bg-accent/15 text-accent border-accent/25';
  if (score >= 4.5) return 'bg-gold/15 text-gold border-gold/25';
  return 'bg-danger/15 text-danger border-danger/25';
}

// Plan check helpers
export type PlanTier = 'basico' | 'pyme' | 'pro' | 'enterprise';
export function isPaidPlan(tier: PlanTier | undefined): boolean {
  return tier === 'pyme' || tier === 'pro' || tier === 'enterprise';
}

export interface OrganismoConNombre {
  codigo: string;
  nombre: string;
}

export interface SerieAnualPunto {
  anio: number;
  monto_total: number;
  n_oc?: number | null;
}

export interface TendenciaApiResponse {
  disponible: boolean;
  tendencias?: TendenciaItem[];
  emergentes?: TendenciaItem[];
  serie_anual?: SerieAnualPunto[] | null;
  cagr_rubro?: number | null;
  total?: number;
  motivo?: string;
}

export interface MiPosicion {
  disponible: boolean;
  tiene_historial: boolean;
  /** Cuota sobre el monto de TODO el rubro. Antes era la cuota dentro de un
   *  solo comprador, presentada como si fuera la del rubro. */
  participacion_pct?: number | null;
  /** Posición entre los proveedores del rubro ordenados por monto. */
  rank?: number | null;
  /** Proveedores DISTINTOS. Antes contaba filas (organismo × proveedor). */
  total_proveedores?: number | null;
  monto_rubro_clp?: number | null;
  monto_propio_clp?: number | null;
  n_oc_propias?: number | null;
  n_organismos_atendidos?: number | null;
  /** Mediana y no media: la distribución tiene cola larga y la media la sigue. */
  n_organismos_mediana_rubro?: number | null;
  /** Explícito porque la tabla puede no estar materializada, y unos campos en
   *  `null` no distinguen «no lo sabemos» de «no tiene riesgo». */
  diversificacion_disponible?: boolean;
  diversificacion?: Diversificacion | null;
  motivo?: string;
}

/** Concentración de cartera del proveedor, sobre TODOS sus rubros. */
export interface Diversificacion {
  /** Herfindahl de sus compradores: 10.000 es «un único cliente». */
  hhi_compradores?: number | null;
  n_compradores_total?: number | null;
  n_rubros_total?: number | null;
  n_regiones_total?: number | null;
  score?: number | null;
  clasificacion?: string | null;
  alerta_dependencia: boolean;
}

export interface PanoramaLider {
  nombre?: string | null;
  /** Cuota por monto. La puede dominar una sola compra enorme. */
  share_pct?: number | null;
  /** Cuota por órdenes: cuántas veces gana, no cuánto factura. */
  share_oc_pct?: number | null;
  n_oc?: number | null;
  n_compradores?: number | null;
}

export interface Panorama {
  disponible: boolean;
  rubro?: string | null;
  motivo?: string | null;
  mercado?: {
    disponible: boolean;
    anio?: number | null;
    monto_clp?: number | null;
    n_oc?: number | null;
    ticket_promedio_clp?: number | null;
  } | null;
  competencia?: {
    disponible: boolean;
    n_proveedores?: number | null;
    n_compradores?: number | null;
    monto_clp?: number | null;
    n_oc?: number | null;
    hhi?: number | null;
    tipo_mercado?: string | null;
    share_top5_pct?: number | null;
    lideres: PanoramaLider[];
  } | null;
  estacionalidad?: {
    disponible: boolean;
    meses: { mes: number; nombre: string; pct: number }[];
    mes_pico?: string | null;
    pct_pico?: number | null;
    pct_top3?: number | null;
    tiene_temporada: boolean;
  } | null;
  vigilar?: {
    disponible: boolean;
    n_con_banderas: number;
    n_compradores_rubro?: number | null;
    compradores: {
      codigo: string;
      nombre?: string | null;
      n_banderas: number;
      motivos: string[];
    }[];
  } | null;
}

export interface ResumenMercado {
  disponible: boolean;
  rubro?: string;
  monto_anual_clp?: number | null;
  n_organismos?: number | null;
  cagr_pct?: number | null;
  yoy_pct?: number | null;  // último año completo vs año anterior
  n_proveedores_actual?: number | null;
  top_comprador?: {
    codigo?: string | null;
    nombre?: string | null;
    n_oc_total?: number | null;
    /** Sus órdenes en ESTE rubro; `n_oc_total` son todas. */
    n_oc_rubro?: number | null;
  } | null;
  teaser_competencia?: {
    lider_nombre?: string | null;
    lider_share_pct?: number | null;
    tipo_mercado?: 'concentrado' | 'moderado' | 'fragmentado' | 'competitivo' | null;
  } | null;
  teaser_estacionalidad?: {
    mes_pico_mayor?: string | null;
    consistencia_avg_pct?: number | null;
  } | null;
  motivo?: string;
}

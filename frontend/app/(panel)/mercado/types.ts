// frontend/app/(panel)/mercado/types.ts

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

// El panorama lo pintan el panel y la página pública de cada rubro: vive en
// `types/bi.ts` y se re-exporta aquí para no tocar a quien ya lo importaba.
export type { Panorama, PanoramaLider } from '@/types/bi';

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

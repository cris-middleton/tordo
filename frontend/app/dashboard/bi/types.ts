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
  pago?: {
    mediana_dias_pago?: number;
    tasa_cancelacion?: number;
    tasa_adjudicacion?: number;
    p75_dias_pago?: number;
  };
  risk_flags?: {
    n_flags: number;
    pago_lento: boolean;
    cancelaciones: boolean;
    baja_calificacion: boolean;
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
  total?: number;
  motivo?: string;
}

export type Severidad = 'rojo' | 'naranja' | 'amarillo';

export type UrgenciaTipo =
  | 'postulacion_cierre'
  | 'documento_vence'
  | 'match_alto'
  | 'estado_inhabil'
  | 'checklist_incompleto'
  | 'estado_habil_cambio';

export interface EmpresaSummary {
  id: string;
  nombre: string;
  rut: string;
  estado_habil: string;
  estado_habil_updated_at: string | null;
}

export interface ResumenStats {
  matches_semana: number;
  matches_72h: number;
  postulaciones_activas: number;
  postulaciones_cierran_72h: number;
  docs_por_vencer_30d: number;
  docs_por_vencer_7d: number;
  adjudicaciones_mes: number;
  enviadas_mes: number;
}

export interface UrgenciaItem {
  id: string;
  tipo: UrgenciaTipo;
  severidad: Severidad;
  tiempo_label: string;
  titulo: string;
  subtitulo: string;
  cta_label: string;
  cta_href: string;
}

export interface MatchItem {
  codigo_externo: string;
  nombre: string;
  organismo: string;
  monto_estimado: number | null;
  moneda: string;
  fecha_cierre: string | null;
  score: number;
  href: string;
}

export interface PipelineCounts {
  en_seguimiento: number;
  en_preparacion: number;
  enviada: number;
  adjudicada: number;
  no_adjudicada: number;
  tasa_adjudicacion_90d: number | null;
  decididas_90d: number;
}

export interface TrendStats {
  disponible: boolean;
  postulaciones_semana: number[];
  tasa_adjudicacion_actual: number | null;
  tasa_adjudicacion_anterior: number | null;
  delta_enviadas_pp: number | null;
}

export interface PlanInfo {
  tier: 'free' | 'paid';
  matches_visibles: number;
}

export interface DashboardHomeResponse {
  empresa: EmpresaSummary | null;
  resumen: ResumenStats;
  urgencias: UrgenciaItem[];
  matches: MatchItem[];
  matches_cached_at: string | null;
  matches_total_disponibles: number;
  pipeline: PipelineCounts;
  trend: TrendStats;
  plan: PlanInfo;
}

export interface RadarMovimiento {
  tipo: 'nueva_licitacion' | 'oportunidad_top' | 'comprador_activo';
  titulo: string;
  detalle: string;
  accion_url?: string | null;
}

export interface RadarResponse {
  disponible: boolean;
  empresa_id?: string | null;
  empresa_nombre?: string | null;
  semana_inicio?: string | null;
  movimientos?: RadarMovimiento[] | null;
  motivo?: string | null;
}

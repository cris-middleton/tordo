/**
 * Las formas que devuelve el detalle de una licitación y su panel de BI.
 *
 * Vivían dentro de la página, que pasaba de las 900 líneas. Sacarlas permite
 * que los componentes del detalle las importen sin arrastrar la pantalla
 * entera.
 */

export interface TenderDetail {
  id: number;
  codigo_externo: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion?: string;
  fecha_cierre?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  url_licitacion?: string;
  categoria?: string;
  tipo_licitacion?: string;
  dias_publicacion?: number;
  dias_cierre?: number;
  moneda?: string;
  codigo_organismo?: string;
  informacion_adicional?: Record<string, any>;
}

export interface Transparencia {
  transparencia_score?: number;
  clasificacion?: string;
  pct_trato_directo?: number;
  tasa_fracaso?: number;
  hhi?: number;
  n_lic_total?: number;
}

export interface CompradorPanel {
  disponible: boolean;
  nombre?: string;
  buyer_score?: number;
  clasificacion?: string;
  /** Días hasta que el proveedor acepta la orden. No es un plazo de pago. */
  mediana_dias_aceptacion?: number;
  tasa_adjudicacion?: number;
  n_flags?: number;
  transparencia?: Transparencia;
  motivo?: string;
}

export interface VentanaPanel {
  disponible: boolean;
  alerta_ventana_corta?: boolean;
  presion_score?: number;
  clasificacion_ventana?: string;
  pct_del_tipico?: number;
  window_days?: number;
  motivo?: string;
}

export interface Competidor {
  NombreProveedor?: string;
  market_share_pct?: number;
  win_rate_pct?: number;
  rank_monto?: number;
  n_oc?: number;
  monto_total?: number;
}

export interface CompetidoresPanel {
  disponible: boolean;
  top5?: Competidor[];
  hhi?: number;
  tipo_mercado?: string;
  motivo?: string;
}

export interface PrecioFallback {
  disponible: boolean;
  codigo_producto?: string;
  nivel_usado?: string;
  fallback?: boolean;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  confianza?: string;
  n?: number;
}

export interface BIPanel {
  codigo_externo: string;
  organismo_id?: string;
  comprador: CompradorPanel;
  ventana: VentanaPanel;
  competidores: CompetidoresPanel;
  precios: PrecioFallback[];
}

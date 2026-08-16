/** Las formas del listado de licitaciones y su panel de BI lateral. */

export interface TenderDetalle {
  id?: number;
  numero_actualizaciones?: number;
  estado_actual?: string;
  fecha_adjudicacion?: string;
  monto_adjudicado?: string;
  proveedor_adjudicado?: string;
  fecha_cierre_real?: string;
  items?: any[];
  participantes?: any[];
}

export type NivelEncaje = 'alto' | 'medio' | 'bajo' | 'sin_encaje';

export interface Tender {
  id: number;
  codigo_externo: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion: string;
  fecha_cierre?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  url_licitacion?: string;
  detalle?: TenderDetalle;
  similarity_score?: number | null;
  score_encaje?: number | null;
  nivel_encaje?: NivelEncaje | null;
}

export interface BIPanel {
  codigo_externo: string;
  organismo_id?: string;
  comprador: {
    disponible: boolean;
    buyer_score?: number | null;
    /** Días hasta que el proveedor acepta la orden. No es un plazo de pago. */
    mediana_dias_aceptacion?: number | null;
    tasa_adjudicacion?: number | null;
    n_flags?: number;
    transparencia?: { clasificacion?: string | null } | null;
    motivo?: string | null;
  };
  ventana: {
    disponible: boolean;
    window_days?: number | null;
    alerta_ventana_corta?: boolean | null;
    presion_score?: number | null;
    clasificacion_ventana?: string | null;
    pct_del_tipico?: number | null;
    motivo?: string | null;
  };
  competidores: {
    disponible: boolean;
    top5?: Array<{
      NombreProveedor?: string | null;
      market_share_pct?: number | null;
      n_oc?: number | null;
      n_proveedores?: number | null;
    }> | null;
    hhi?: number | null;
    tipo_mercado?: string | null;
    motivo?: string | null;
  };
  precios: Array<{
    disponible: boolean;
    codigo_producto?: string | null;
    nivel_usado?: string | null;
    fallback?: boolean;
    p25?: number | null;
    p50?: number | null;
    p75?: number | null;
    confianza?: string | null;
    n?: number | null;
  }>;
  postulacion_id?: string | null;
}

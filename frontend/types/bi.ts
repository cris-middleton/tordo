/**
 * Formas de la API de BI que comparten el panel (`app/(panel)/mercado/`) y las
 * páginas públicas (`app/(publico)/`).
 *
 * Espejan `backend/app/schemas/bi.py`. Viven aquí y no en
 * `app/(panel)/mercado/types.ts` porque una página pública no debería importar
 * de dentro de otra ruta.
 */

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

/** `CompradorResponse` de `GET /bi/comprador/{codigo}`. */
export interface CompradorPerfil {
  disponible: boolean;
  organismo_id?: string | null;
  nombre?: string | null;
  buyer_score?: number | null;
  clasificacion?: string | null;
  /** Días hasta que el PROVEEDOR acepta la orden. No es un plazo de pago. */
  tramitacion?: {
    mediana_dias_aceptacion?: number | null;
    p75_dias_aceptacion?: number | null;
    p90_dias_aceptacion?: number | null;
    tasa_aceptacion?: number | null;
    tasa_cancelacion?: number | null;
    tasa_adjudicacion?: number | null;
  } | null;
  scores_detalle?: Record<string, number | null> | null;
  risk_flags?: {
    n_flags: number;
    aceptacion_lenta: boolean;
    aceptacion_impredecible: boolean;
    cancelaciones: boolean;
    licitaciones_fallidas: boolean;
    baja_calificacion: boolean;
    compras_irregulares: boolean;
  } | null;
  volumen?: {
    n_oc_total?: number | null;
    n_meses_activo?: number | null;
    prom_calificacion?: number | null;
    prom_oferentes?: number | null;
  } | null;
  transparencia?: {
    transparencia_score?: number | null;
    clasificacion?: string | null;
    pct_trato_directo?: number | null;
    tasa_fracaso?: number | null;
    hhi?: number | null;
    n_lic_total?: number | null;
  } | null;
  motivo?: string | null;
}

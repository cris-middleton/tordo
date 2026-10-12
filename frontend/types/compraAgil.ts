/**
 * `GET /api/v1/compra-agil/destacadas` — «Lo mejor de hoy en Compra Ágil».
 *
 * Espeja `CompraAgilDestacadasResponse` del backend
 * (`backend/app/schemas/compra_agil.py`). Plana, sin envelope (ADR 0009).
 */

export interface CompradorCompraAgil {
  /** Órdenes de Compra Ágil adjudicadas en la ventana. */
  ordenes: number;
  /** Compras Ágiles publicadas en la ventana; null si no se sabe. */
  publicadas: number | null;
  proveedores_distintos: number;
  cuota_lider_pct: number | null;
  monto_mediana: number | null;
  monto_p25: number | null;
  monto_p75: number | null;
}

export interface FactoresCompraAgil {
  competencia: number;
  comprador: number;
  tiempo: number;
}

export interface CompraAgilDestacada {
  codigo_externo: string;
  nombre: string;
  nombre_organismo: string | null;
  region: string | null;
  monto_estimado: number | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  horas_restantes: number;
  /** Cotizaciones recibidas hasta ahora; null si no se sabe. */
  ofertas_recibidas: number | null;
  /** Historia del comprador en Compra Ágil; null si no hay. */
  comprador: CompradorCompraAgil | null;
  /** 0–1. Una heurística, no un modelo. */
  puntaje: number;
  factores: FactoresCompraAgil;
}

export interface CompraAgilDestacadasResponse {
  /** Última actualización de las Compras Ágiles en la base; null si no hay. */
  actualizado_en: string | null;
  ventana_desde: string | null;
  ventana_hasta: string | null;
  items: CompraAgilDestacada[];
}

export interface ParamsDestacadas {
  limite?: number;
  region?: string;
  search?: string;
  /**
   * Sólo las de este comprador (`CodigoOrganismoPublico`). Las Compras Ágiles
   * se guardan sin código de organismo: el backend lo cruza por el RUT.
   */
  codigo_organismo?: string;
}

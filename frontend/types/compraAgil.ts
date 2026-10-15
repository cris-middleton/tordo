/**
 * `GET /api/v1/compra-agil/destacadas` — «Lo mejor de hoy en Compra Ágil».
 *
 * Espeja `CompraAgilDestacadasResponse` del backend
 * (`backend/app/schemas/compra_agil.py`). Plana, sin envelope (ADR 0009).
 */

export interface CompradorCompraAgil {
  /** Órdenes de Compra Ágil adjudicadas en la ventana. */
  ordenes: number;
  /**
   * Siempre null desde 2026-10 en esta superficie (las publicadas son del
   * organismo, en su ficha).
   */
  publicadas: number | null;
  proveedores_distintos: number;
  cuota_lider_pct: number | null;
  monto_mediana: number | null;
  monto_p25: number | null;
  monto_p75: number | null;
  /** Qué parte de las unidades con Compra Ágil emitió MENOS órdenes en la ventana (0–1). */
  percentil_ordenes: number | null;
}

export interface FactoresCompraAgil {
  competencia: number;
  comprador: number;
  tiempo: number;
  monto: number;
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
  /** Cuándo se escribió por última vez la fila (la mejor cota de cuándo se vio el conteo); null si no se sabe. */
  ofertas_al: string | null;
  /** Historia de la unidad que compra; null si no tuvo órdenes o si `historia_disponible` es false. */
  comprador: CompradorCompraAgil | null;
  /** 0–1. Una heurística, no un modelo. **No se muestra**: sólo ordena. */
  puntaje: number;
  factores: FactoresCompraAgil;
}

export interface CompraAgilDestacadasResponse {
  /** Última actualización de las Compras Ágiles en la base; null si no hay. */
  actualizado_en: string | null;
  /**
   * ¿Ya hay historia de compras por unidad? `false` entre el despliegue de la API
   * y la primera corrida semanal que la calcula: no se sabe nada de ninguna unidad
   * y **no hay que decir nada del comprador** (ni «sin historial»). Con `true`, un
   * `comprador` nulo sí significa que la unidad no tuvo órdenes en la ventana.
   */
  historia_disponible: boolean;
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

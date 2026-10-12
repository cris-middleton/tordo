/**
 * El contrato de `/api/v1/publico/*` (backend `api/publico.py`, paso 10 del
 * pivote). Espeja `backend/app/schemas/publico.py`.
 *
 * **El frontend nunca des-slugifica**: el `slug` de un rubro o de un producto lo
 * da el backend, y lo resuelve el backend. Para enlazar se usa el `slug` o el
 * `codigo` que viene en la respuesta, nunca uno construido aquí.
 */

import type { CompradorPerfil, Panorama } from './bi';

/** `GET /publico/sitemap` — sólo lo indexable. */
export interface SitemapPublico {
  /** `ventana_hasta` de analytics (AAAA-MM-DD), o null sin analytics. */
  actualizado: string | null;
  compradores: string[];
  rubros: string[];
  productos: string[];
}

export interface PeriodoPublico {
  ventana_desde: string | null;
  ventana_hasta: string | null;
}

export interface CompraAgilComprador {
  ordenes: number;
  publicadas: number | null;
  proveedores_distintos: number | null;
  cuota_lider_pct: number | null;
  monto_p25: number | null;
  monto_mediana: number | null;
  monto_p75: number | null;
}

export interface RubroDeComprador {
  nombre: string;
  /** Nulo si el rubro perdió su slug en una colisión: no tiene página. */
  slug: string | null;
  monto: number;
  ordenes: number;
}

/** `GET /publico/compradores/{codigo}`. */
export interface CompradorPublico {
  codigo: string;
  nombre: string;
  indexable: boolean;
  periodo: PeriodoPublico;
  perfil: CompradorPerfil;
  compra_agil: CompraAgilComprador | null;
  /** Top 10, por monto. */
  rubros: RubroDeComprador[];
}

export interface CompradorDeRubro {
  codigo: string;
  nombre: string;
  monto: number;
  ordenes: number;
}

/** `GET /publico/rubros/{slug}`. */
export interface RubroPublico {
  slug: string;
  nombre: string;
  indexable: boolean;
  panorama: Panorama;
  /** Top 10. */
  compradores: CompradorDeRubro[];
}

export interface BandaUnidad {
  unidad: string;
  n: number;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  predictibilidad: string | null;
  confianza: string | null;
}

export interface CompradorDeProducto {
  codigo: string;
  nombre: string;
  unidad: string;
  n: number;
  p50: number | null;
}

/**
 * `GET /publico/productos/{slug}`. Un producto no indexable responde igual,
 * con `indexable: false`: la página existe, con `noindex`.
 */
export interface ProductoPublico {
  slug: string;
  firma: string;
  nombre_generico: string | null;
  codigo_onu: string | null;
  descripcion: string | null;
  indexable: boolean;
  /** Una banda por unidad: la misma firma se compra por caja y por unidad. */
  unidades: BandaUnidad[];
  /** Top 10 por n, desde L0. */
  compradores: CompradorDeProducto[];
}

/** Un resultado de `GET /publico/productos?q=&limite=`. */
export interface ProductoEncontrado {
  slug: string;
  firma: string;
  n: number;
  indexable: boolean;
}

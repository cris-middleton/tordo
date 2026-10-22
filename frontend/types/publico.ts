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
  /** Nula si el dato no la trae (el backend la declara `str | None`). */
  unidad: string | null;
  n: number;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  predictibilidad: string | null;
  /** De 0 a 1, como en el backend (`float | None`). */
  confianza: number | null;
  /**
   * Organismos distintos detrás de la banda. Opcionales los tres: un backend o
   * una tabla anteriores no los traen, y entonces no se dice de cuántos son.
   */
  compradores?: number | null;
  /** Fracción de las compras (0–1) del organismo que más compró. */
  cuota_mayor?: number | null;
  /**
   * La mediana de cada comprador de ESTA unidad, sin mínimo de compras, por `n`
   * descendente (tope de 200 en el backend: `TOPE_MEDIANAS_POR_BANDA`). Sin código
   * ni nombre. `null` si la tabla aún no existe (entonces el gráfico cae a
   * `compradores`, que sólo trae los diez con más compras); `[]` si no hay filas.
   */
  medianas_compradores?: { n: number; p50: number | null }[] | null;
  /**
   * Precio de mercado: ≥ 3 compradores y ninguno con más de la mitad. **La regla
   * vive en el backend** (`services/publico/indexables.py`); aquí no se recalcula.
   */
  de_mercado?: boolean;
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
  /**
   * De qué meses sale la banda (la ventana de la L0N, 12 meses). Opcional: un
   * backend anterior no la manda, y la portada oculta entonces su lectura de precio.
   */
  periodo?: PeriodoPublico | null;
}

/** Un resultado de `GET /publico/productos?q=&limite=`. */
export interface ProductoEncontrado {
  slug: string;
  firma: string;
  /** Cómo lo escribe el comprador (la de su unidad con más compras): el título. */
  descripcion?: string | null;
  n: number;
  indexable: boolean;
}

/**
 * Las Compras Ágiles abiertas por día de cierre en hora de Chile. Salen de la
 * misma pasada que `compra_agil_abiertas` y suman lo mismo.
 */
export interface CompraAgilPorCierre {
  hoy: number;
  manana: number;
  dos_tres_dias: number;
  despues: number;
}

/**
 * `GET /publico/portada` — la tira de cifras de la portada. Cada conteo es el
 * total de un enlace al catálogo (`urlCatalogoAbiertas` en `lib/filtrosCatalogo.ts`).
 */
export interface ResumenPortada {
  /** Licitaciones que no son Compra Ágil y se pueden postular ahora. */
  licitaciones_abiertas: number;
  compra_agil_abiertas: number;
  /** Última ingesta de Compra Ágil (ISO, hora de Chile), o null. Sin hora, la tira no se muestra. */
  actualizado_en: string | null;
  /** Opcionales (PR 1 de IDENTIDAD_Y_PORTADA): un backend anterior no los manda. */
  compra_agil_por_cierre?: CompraAgilPorCierre | null;
  /** Licitaciones y Compras Ágiles publicadas hoy (día de Chile). */
  publicadas_hoy?: number | null;
  /** El organismo que más publicó hoy, por nombre, tal como se guardó; null sin publicaciones. */
  mas_publica_hoy?: string | null;
}

/** Una fila de `GET /publico/mercado`: lo que compró un sector en un mes (órdenes de compra). */
export interface GastoMensual {
  anio: number;
  mes: number;
  sector: string;
  monto: number;
}

/** Los mercados cuyo proveedor principal se lleva entre `desde` y `hasta` % del monto. */
export interface TramoConcentracion {
  desde: number;
  hasta: number;
  mercados: number;
  monto: number;
}

/** La concentración de los mercados (un comprador en un rubro), en tramos de 10 puntos. */
export interface ConcentracionMercados {
  mercados: number;
  sobre_la_mitad: number;
  un_proveedor: number;
  monto_total: number;
  monto_sobre_la_mitad: number;
  tramos: TramoConcentracion[];
  /** De qué meses salen los montos; null si la tabla no trae su ventana. */
  ventana_desde?: string | null;
  ventana_hasta?: string | null;
}

/** `GET /publico/mercado`: los dos gráficos de mercado de la portada. Cada bloque puede faltar. */
/** Un organismo de la red de la portada: de los que más compran. */
export interface CompradorRed {
  codigo: string;
  nombre: string;
  sector: string | null;
  monto: number;
}

/** Un proveedor de la red: lo que les vendió a esos compradores y a cuántos de ellos. */
export interface ProveedorRed {
  codigo: string;
  nombre: string;
  monto: number;
  compradores: number;
}

/**
 * La red de la portada (`red` de `GET /publico/mercado`): los organismos que más
 * compran, sus proveedores más grandes y los que le venden a más de ellos, con lo
 * que se compraron. Sin personas naturales.
 */
export interface RedPortada {
  compradores: CompradorRed[];
  proveedores: ProveedorRed[];
  enlaces: { comprador: string; proveedor: string; monto: number }[];
  monto_total: number;
  monto_compradores: number;
  proveedores_total: number;
  a_la_mitad_o_mas: number;
  ventana_desde?: string | null;
  ventana_hasta?: string | null;
}

export interface MercadoPortada {
  gasto_mensual: GastoMensual[] | null;
  concentracion: ConcentracionMercados | null;
  /** Ausente en un backend anterior; `null` sin la tabla. Mal formada, se ignora (`esRed`). */
  red?: RedPortada | null;
}

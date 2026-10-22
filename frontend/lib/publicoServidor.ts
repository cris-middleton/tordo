/**
 * Lo que leen del backend las páginas públicas (`app/(publico)/`) y el
 * sitemap, con la caché de datos de Next.
 *
 * **Sólo lo importan componentes de servidor y rutas**: importa
 * `backendServidor.ts`, que lee `PROXY_SECRETO`.
 *
 * Distinto del de RSS (`rssServidor.ts`) en dos cosas, a propósito:
 *
 * - **Como renderizado del servidor** (`cabecerasHaciaElBackend(null)`), no
 *   como el visitante: la página se genera una vez y se sirve a muchos, así que
 *   no hay a quién contarla. El backend la deja exenta del límite por IP.
 * - **Con caché**: `next: { revalidate, tags }`. Una semana —el ritmo del cron
 *   semanal— y la etiqueta `analytics`, que el cron vacía con
 *   `POST /api/revalidar` al terminar de materializar.
 */

import { API } from './versionApi';
import { cabecerasHaciaElBackend, urlDelBackend } from './backendServidor';
import type { SectoresBI } from '@/types/bi';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { MercadoPortada, ProductoPublico, ResumenPortada } from '@/types/publico';

import { PRODUCTOS_ESCALERA } from './escaleraPrecios';
import { esConteo, esProductoPortada, esSectores, PRODUCTO_PORTADA } from './lecturasPortada';
import { esMercadoPortada } from './lecturasMercado';
import {
  ETIQUETA_ANALYTICS,
  ETIQUETA_COMPRA_AGIL,
  SEGUNDOS_CACHE_ANALYTICS,
  SEGUNDOS_CACHE_COMPRA_AGIL,
} from './revalidacion';

export class ErrorDelBackendPublico extends Error {
  constructor(readonly status: number, readonly ruta: string) {
    super(`El backend respondió ${status} a ${ruta}`);
  }
}

/**
 * `GET {API}/publico{ruta}`. Devuelve `null` en un 404 —la página llama a
 * `notFound()`— y lanza con cualquier otro fallo: un error no se cachea, así
 * que la siguiente visita lo vuelve a intentar en vez de servir una página
 * rota durante una semana.
 */
/**
 * Cuánto se espera al backend al generar una ficha. Sin tope, una ficha esperaba
 * para siempre en la fila de renderizados exentos de la API (`limite_ip.py`, que
 * responde 503 a los 5 s); con él, falla, lanza y no se cachea: el pedido
 * siguiente la rehace.
 */
export const TIEMPO_MAXIMO_FICHA_MS = 10_000;

export async function pedirPublico<T>(ruta: string): Promise<T | null> {
  const completa = `${API}/publico${ruta}`;
  const respuesta = await fetch(urlDelBackend(completa), {
    headers: { Accept: 'application/json', ...cabecerasHaciaElBackend(null) },
    next: { revalidate: SEGUNDOS_CACHE_ANALYTICS, tags: [ETIQUETA_ANALYTICS] },
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_FICHA_MS),
  });
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new ErrorDelBackendPublico(respuesta.status, completa);
  return (await respuesta.json()) as T;
}

/** Cuánto se guarda una pieza de la portada, con qué etiqueta se vacía y cuánto se la espera. */
interface CacheDeLaPortada {
  revalidate: number;
  tags: string[];
  /** Pasado esto, el bloque se oculta: que un backend colgado no deje colgado el render (ni el build). */
  esperaMs: number;
}

/** Lo vivo: media hora, y lo vacía el cron frecuente. */
const CACHE_COMPRA_AGIL: CacheDeLaPortada = {
  revalidate: SEGUNDOS_CACHE_COMPRA_AGIL,
  tags: [ETIQUETA_COMPRA_AGIL],
  esperaMs: 8000,
};

/**
 * Lo de analytics (lecturas 1 y 2 y la red): una semana, y lo vacía el cron semanal.
 * Se espera más: `GET /publico/mercado` recorre dos tablas grandes y, con su caché de
 * 10 min vacía, tardó 12,7 s en producción (2026-10-22). Con 8 s la portada salía sin la
 * red tras cada despliegue y quedaba así media hora. 25 s queda bajo los 30 s del
 * `statement_timeout` de la API; en una regeneración ISR la espera no la ve nadie.
 */
const CACHE_ANALYTICS: CacheDeLaPortada = {
  revalidate: SEGUNDOS_CACHE_ANALYTICS,
  tags: [ETIQUETA_ANALYTICS],
  esperaMs: 25000,
};

/**
 * Lo que pide la portada al backend: **nunca lanza** —devuelve `null` ante
 * cualquier fallo, también un 200 que no pasa `esValida`, y la portada oculta
 * ese bloque—. La portada es la puerta del sitio; que el backend esté caído no
 * puede tumbarla. (Las fichas sí lanzan: sin backend no tienen nada que enseñar.)
 * La caché la elige quien llama: lo vivo, media hora; lo de analytics, una semana.
 */
async function pedirParaLaPortada<T>(
  ruta: string,
  esValida: (datos: unknown) => datos is T,
  bloque: string,
  cache: CacheDeLaPortada,
): Promise<T | null> {
  try {
    const respuesta = await fetch(urlDelBackend(ruta), {
      headers: { Accept: 'application/json', ...cabecerasHaciaElBackend(null) },
      next: { revalidate: cache.revalidate, tags: [...cache.tags] },
      signal: AbortSignal.timeout(cache.esperaMs),
    });
    if (!respuesta.ok) throw new ErrorDelBackendPublico(respuesta.status, ruta);
    const datos: unknown = await respuesta.json();
    if (!esValida(datos)) throw new Error(`Respuesta inesperada de ${ruta}`);
    return datos;
  } catch (error) {
    console.error(`portada: ${bloque} no respondió; se oculta el bloque`, error);
    return null;
  }
}

function esTextoONulo(valor: unknown): valor is string | null {
  return valor === null || typeof valor === 'string';
}

function esNumeroONulo(valor: unknown): valor is number | null {
  return valor === null || (typeof valor === 'number' && Number.isFinite(valor));
}

/**
 * Un item con los campos que la portada LEE (`BloqueHoy`), del tipo que los
 * lee: un `null` o un campo ausente haría lanzar el render, y la portada no
 * puede caerse por la API. Lo que la portada no lee no se mira.
 */
function esDestacada(dato: unknown): dato is CompraAgilDestacada {
  if (!dato || typeof dato !== 'object') return false;
  const d = dato as Record<string, unknown>;
  return (
    typeof d.codigo_externo === 'string' &&
    typeof d.nombre === 'string' &&
    esTextoONulo(d.nombre_organismo) &&
    esNumeroONulo(d.monto_estimado) &&
    // Opcional: una API anterior no lo trae, y eso es «no es el tope».
    (d.monto_es_tope === undefined || typeof d.monto_es_tope === 'boolean') &&
    typeof d.horas_restantes === 'number' &&
    Number.isFinite(d.horas_restantes) &&
    esNumeroONulo(d.ofertas_recibidas) &&
    esTextoONulo(d.ofertas_al)
  );
}

function esDestacadas(datos: unknown): datos is CompraAgilDestacadasResponse {
  if (!datos || typeof datos !== 'object') return false;
  const r = datos as Record<string, unknown>;
  return esTextoONulo(r.actualizado_en) && Array.isArray(r.items) && r.items.every(esDestacada);
}

function esResumenPortada(datos: unknown): datos is ResumenPortada {
  if (!datos || typeof datos !== 'object') return false;
  const r = datos as Record<string, unknown>;
  return (
    esConteo(r.licitaciones_abiertas) &&
    esConteo(r.compra_agil_abiertas) &&
    (r.actualizado_en === null || typeof r.actualizado_en === 'string')
  );
}

/** Las primeras `limite` de «Lo mejor de hoy en Compra Ágil», para la portada. */
export async function pedirDestacadas(limite: number): Promise<CompraAgilDestacadasResponse | null> {
  return pedirParaLaPortada(
    `${API}/compra-agil/destacadas?limite=${limite}`,
    esDestacadas,
    '«Lo mejor de hoy»',
    CACHE_COMPRA_AGIL,
  );
}

/**
 * El resumen de la portada (`GET /publico/portada`): la tira de cifras con su
 * hora.
 */
export async function pedirResumenPortada(): Promise<ResumenPortada | null> {
  return pedirParaLaPortada(`${API}/publico/portada`, esResumenPortada, 'el resumen', CACHE_COMPRA_AGIL);
}

/** Lectura 1: el gasto por sector (`GET /bi/sector`). */
export async function pedirSectoresPortada(): Promise<SectoresBI | null> {
  return pedirParaLaPortada(`${API}/bi/sector`, esSectores, 'el gasto por sector', CACHE_ANALYTICS);
}

/** `GET /publico/mercado`: el gasto mensual por sector y la concentración, o null. Analytics: una semana. */
export async function pedirMercadoPortada(): Promise<MercadoPortada | null> {
  return pedirParaLaPortada(`${API}/publico/mercado`, esMercadoPortada, 'el mercado', CACHE_ANALYTICS);
}

/** Lectura 2: la ficha pública de `PRODUCTO_PORTADA`. Un 404 la oculta, no lanza. */
export async function pedirProductoPortada(): Promise<ProductoPublico | null> {
  return pedirParaLaPortada(
    `${API}/publico/productos/${segmento(PRODUCTO_PORTADA.slug)}`,
    esProductoPortada,
    'el producto de la portada',
    CACHE_ANALYTICS,
  );
}

/**
 * Las fichas de la escalera de precios (`PRODUCTOS_ESCALERA`), en su orden, sin
 * la de `PRODUCTO_PORTADA`, que ya pide `pedirProductoPortada` (va en su sitio).
 * Cada una cachea una semana con la etiqueta `analytics`, como la del producto; una
 * que falla es un `null` y una fila menos.
 */
export async function pedirProductosEscalera(producto: ProductoPublico | null): Promise<(ProductoPublico | null)[]> {
  return Promise.all(
    PRODUCTOS_ESCALERA.map((p) =>
      p.slug === PRODUCTO_PORTADA.slug
        ? Promise.resolve(producto)
        : pedirParaLaPortada(`${API}/publico/productos/${segmento(p.slug)}`, esProductoPortada, `«${p.nombre}»`, CACHE_ANALYTICS),
    ),
  );
}

/** Un segmento de ruta del backend, escapado. El slug y el código vienen de la URL. */
export function segmento(valor: string): string {
  return encodeURIComponent(valor);
}

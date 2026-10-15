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
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { ResumenPortada } from '@/types/publico';

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
export async function pedirPublico<T>(ruta: string): Promise<T | null> {
  const completa = `${API}/publico${ruta}`;
  const respuesta = await fetch(urlDelBackend(completa), {
    headers: { Accept: 'application/json', ...cabecerasHaciaElBackend(null) },
    next: { revalidate: SEGUNDOS_CACHE_ANALYTICS, tags: [ETIQUETA_ANALYTICS] },
  });
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new ErrorDelBackendPublico(respuesta.status, completa);
  return (await respuesta.json()) as T;
}

/**
 * Lo que pide la portada al backend: media hora de caché, etiqueta
 * `compra-agil` (la vacía el cron frecuente) y **nunca lanza** —devuelve
 * `null` ante cualquier fallo y la portada oculta el bloque—. La portada es
 * la puerta del sitio; que el backend esté caído no puede tumbarla. (Las
 * fichas sí lanzan: sin backend no tienen nada que enseñar.)
 */
async function pedirParaLaPortada<T>(
  ruta: string,
  esValida: (datos: unknown) => datos is T,
  bloque: string,
): Promise<T | null> {
  try {
    const respuesta = await fetch(urlDelBackend(ruta), {
      headers: { Accept: 'application/json', ...cabecerasHaciaElBackend(null) },
      next: { revalidate: SEGUNDOS_CACHE_COMPRA_AGIL, tags: [ETIQUETA_COMPRA_AGIL] },
      // Que un backend colgado no deje colgado el render (ni el build).
      signal: AbortSignal.timeout(8000),
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

function esConteo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
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
  return pedirParaLaPortada(`${API}/compra-agil/destacadas?limite=${limite}`, esDestacadas, '«Lo mejor de hoy»');
}

/**
 * La tira de cifras de la portada (`GET /publico/portada`): cuántas
 * licitaciones y Compras Ágiles se pueden postular ahora, con su hora.
 */
export async function pedirResumenPortada(): Promise<ResumenPortada | null> {
  return pedirParaLaPortada(`${API}/publico/portada`, esResumenPortada, 'el resumen');
}

/** Un segmento de ruta del backend, escapado. El slug y el código vienen de la URL. */
export function segmento(valor: string): string {
  return encodeURIComponent(valor);
}

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
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';

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
 * Las primeras `limite` de «Lo mejor de hoy en Compra Ágil», para la portada.
 * Media hora de caché y la etiqueta `compra-agil`, que vacía el cron frecuente.
 *
 * **Nunca lanza**: devuelve `null` ante cualquier fallo y la portada oculta el
 * bloque. La portada es la puerta del sitio; que el backend esté caído no puede
 * tumbarla. (Las fichas sí lanzan: sin backend no tienen nada que enseñar.)
 */
export async function pedirDestacadas(limite: number): Promise<CompraAgilDestacadasResponse | null> {
  const ruta = `${API}/compra-agil/destacadas?limite=${limite}`;
  try {
    const respuesta = await fetch(urlDelBackend(ruta), {
      headers: { Accept: 'application/json', ...cabecerasHaciaElBackend(null) },
      next: { revalidate: SEGUNDOS_CACHE_COMPRA_AGIL, tags: [ETIQUETA_COMPRA_AGIL] },
      // Que un backend colgado no deje colgado el render (ni el build).
      signal: AbortSignal.timeout(8000),
    });
    if (!respuesta.ok) throw new ErrorDelBackendPublico(respuesta.status, ruta);
    const datos = (await respuesta.json()) as CompraAgilDestacadasResponse;
    if (!Array.isArray(datos?.items)) throw new Error(`Respuesta inesperada de ${ruta}`);
    return datos;
  } catch (error) {
    console.error('portada: «Lo mejor de hoy» no respondió; se oculta el bloque', error);
    return null;
  }
}

/** Un segmento de ruta del backend, escapado. El slug y el código vienen de la URL. */
export function segmento(valor: string): string {
  return encodeURIComponent(valor);
}

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
import { ETIQUETA_ANALYTICS, SEGUNDOS_CACHE_ANALYTICS } from './revalidacion';

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

/** Un segmento de ruta del backend, escapado. El slug y el código vienen de la URL. */
export function segmento(valor: string): string {
  return encodeURIComponent(valor);
}

/**
 * Lo que comparten los dos feeds RSS del lado del servidor: llamar al backend
 * y responder. `pedirAlBackend` lo usa también `/buscar` (`buscarServidor.ts`).
 *
 * **Sólo lo importa código de servidor** —los route handlers de `app/rss/*` y
 * `lib/buscarServidor.ts`, que importa la página `/buscar`—: importa
 * `backendServidor.ts`, que lee `PROXY_SECRETO`.
 *
 * El feed llama al backend **como el visitante** (`ipDelVisitante`), igual que
 * el proxy: con la caché del CDN el backend casi no lo ve, y cuando lo ve, lo
 * cuenta contra la IP de quien pidió el feed y no contra la del sitio entero.
 */

import { API } from './versionApi';
import { cabecerasHaciaElBackend, ipDelVisitante, urlDelBackend } from './backendServidor';
import { CACHE_RSS } from './rss';

export const NOMBRE_SITIO = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export class ErrorDelBackend extends Error {
  constructor(readonly status: number) {
    super(`El backend respondió ${status}`);
  }
}

export interface OpcionesPedido {
  /**
   * Corta la petición —y la lectura del cuerpo— pasado este tiempo. Sin él se
   * espera lo que tarde el backend (los feeds, que viven detrás de la caché del
   * CDN). Lo usa `/buscar`: una página que espera para siempre a una API caída
   * se cae con ella.
   */
  tiempoMaximoMs?: number;
}

/** `GET {API}{ruta}?{params}` al backend, como el visitante. Lanza si no es 2xx. */
export async function pedirAlBackend<T>(
  ruta: string,
  params: URLSearchParams,
  cabecerasDelVisitante: Headers,
  opciones: OpcionesPedido = {},
): Promise<T> {
  const consulta = params.toString();
  const respuesta = await fetch(urlDelBackend(`${API}${ruta}${consulta ? `?${consulta}` : ''}`), {
    headers: {
      Accept: 'application/json',
      ...cabecerasHaciaElBackend(ipDelVisitante(cabecerasDelVisitante)),
    },
    cache: 'no-store',
    ...(opciones.tiempoMaximoMs !== undefined ? { signal: AbortSignal.timeout(opciones.tiempoMaximoMs) } : {}),
  });
  if (!respuesta.ok) throw new ErrorDelBackend(respuesta.status);
  return (await respuesta.json()) as T;
}

export function respuestaRss(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': CACHE_RSS,
    },
  });
}

/**
 * Un fallo del backend, como texto. Un filtro inválido (400/422) es un 400;
 * cualquier otra cosa —el límite por IP incluido— es 502. Se cachea un minuto: un lector que
 * reintenta en bucle no debería llegar al backend en cada intento.
 */
export function respuestaDeError(error: unknown): Response {
  const status =
    error instanceof ErrorDelBackend && (error.status === 400 || error.status === 422) ? 400 : 502;
  return new Response(
    status === 502 ? 'El feed no está disponible ahora mismo.' : 'Los filtros del feed no son válidos.',
    {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60',
      },
    },
  );
}

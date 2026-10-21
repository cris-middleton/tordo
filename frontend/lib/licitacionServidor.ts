/**
 * ¿Existe esta licitación? Lo pregunta el servidor antes de pintar la ficha,
 * para que una que no está responda con un 404 de verdad (y `noindex`) y no
 * con una página 200 que dice «no la encontramos»: un buscador indexaba esas
 * páginas vacías, y las licitaciones salen del catálogo 90 días después de
 * cerrar (`etl/retencion.py`).
 *
 * **Sólo lo importa código de servidor**: `pedirAlBackend` lee `PROXY_SECRETO`.
 * Llama **como el visitante** (`ipDelVisitante`): la ficha se genera en cada
 * petición, y exenta sería una forma gratis de saltarse el límite por IP.
 */

import { ErrorDelBackend, pedirAlBackend } from './rssServidor';

/**
 * Lo que se espera antes de pintar la ficha de todos modos: la página no se cae con la
 * API. Corto a propósito: la ficha no tiene `loading.tsx` y la espera es pantalla en
 * blanco; buscar por código es una consulta por índice único, de milisegundos.
 */
export const TIEMPO_MAXIMO_EXISTENCIA_MS = 2000;

/**
 * `false` sólo si el backend dice que no existe (404, o 422 con un código
 * imposible). Con cualquier otro fallo —caída, límite, tiempo agotado— no se
 * sabe, y la ficha se pinta: el navegador lo intenta y ofrece reintentar.
 */
export async function licitacionExiste(codigo: string, cabeceras: Headers): Promise<boolean> {
  try {
    await pedirAlBackend(`/tenders/codigo/${encodeURIComponent(codigo)}`, new URLSearchParams(), cabeceras, {
      tiempoMaximoMs: TIEMPO_MAXIMO_EXISTENCIA_MS,
    });
    return true;
  } catch (error) {
    return !(error instanceof ErrorDelBackend && (error.status === 404 || error.status === 422));
  }
}

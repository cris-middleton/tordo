/**
 * Revalidación bajo demanda de las páginas cacheadas (paso 10 del pivote).
 *
 * Las páginas públicas (`/compradores`, `/rubros`, `/productos`) y el sitemap
 * se guardan una semana en la caché de datos de Next, con la etiqueta
 * `analytics`. El cron semanal (`etl/cron.py`) re-materializa analytics y
 * avisa a `POST /api/revalidar`; sin ese aviso las páginas mostrarían la
 * semana anterior hasta que caducaran solas.
 *
 * **Sólo lo importan rutas de servidor**: `REVALIDAR_SECRETO` es de servidor,
 * sin prefijo `NEXT_PUBLIC_` y sin valor por defecto. `npm run check:secreto`
 * lo busca en lo que se sirve al navegador.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export const CABECERA_REVALIDAR = 'X-Revalidar-Secreto';

/** Lo que se cachea con datos de analytics (se renueva una vez por semana). */
export const ETIQUETA_ANALYTICS = 'analytics';
/** Lo que se cachea con datos de Compra Ágil (se renueva en cada cron frecuente). */
export const ETIQUETA_COMPRA_AGIL = 'compra-agil';

/**
 * Lista blanca. Una etiqueta que no está aquí no se revalida: el endpoint es
 * público (lo protege el secreto), y aun con el secreto no tiene por qué poder
 * vaciar cualquier entrada de la caché.
 */
export const ETIQUETAS_REVALIDABLES: readonly string[] = [ETIQUETA_ANALYTICS, ETIQUETA_COMPRA_AGIL];

/** Una semana: el ritmo del cron semanal. El aviso del cron la adelanta. */
export const SEGUNDOS_CACHE_ANALYTICS = 604800;

/**
 * Compara en tiempo constante. Se comparan los SHA-256 y no las cadenas: así
 * los dos lados miden lo mismo y `timingSafeEqual` no delata la longitud del
 * secreto lanzando con largos distintos.
 */
export function secretoCoincide(recibido: string | null, esperado: string): boolean {
  if (recibido === null) return false;
  const a = createHash('sha256').update(recibido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Las etiquetas del cuerpo `{"etiquetas": [...]}`, o `null` si el cuerpo no
 * vale: no es un objeto, la lista viene vacía, o trae algo fuera de la lista
 * blanca. Todo o nada: revalidar la mitad de lo pedido y responder 200 haría
 * creer al cron que salió bien.
 */
export function etiquetasDelCuerpo(cuerpo: unknown): string[] | null {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) return null;
  const etiquetas = (cuerpo as { etiquetas?: unknown }).etiquetas;
  if (!Array.isArray(etiquetas) || etiquetas.length === 0) return null;
  if (!etiquetas.every((e) => typeof e === 'string' && ETIQUETAS_REVALIDABLES.includes(e))) {
    return null;
  }
  return [...new Set(etiquetas as string[])];
}

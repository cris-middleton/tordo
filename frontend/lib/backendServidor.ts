/**
 * Cabeceras con que el SERVIDOR de Next se identifica ante el backend.
 *
 * El backend limita por IP (`backend/app/core/limite_ip.py`). Sin esto, todo el
 * tráfico del sitio le llegaría con la IP del servidor de Next —en Vercel, IP
 * compartidas— y el sitio entero sería un solo cubo de 60 peticiones/minuto.
 *
 * - `X-Tordo-Proxy` lleva el secreto compartido (`PROXY_SECRETO`). Es lo único
 *   que hace que el backend crea lo que viene detrás.
 * - `X-Tordo-Visitante` lleva la IP del visitante cuya petición se reenvía. Sin
 *   ella —un renderizado del servidor, SSR/ISR— el backend la deja exenta.
 *
 * Una cabecera propia y no `X-Forwarded-For`: el borde de Railway reescribe
 * `X-Forwarded-For` con la IP de quien le abre la conexión (aquí, Vercel), así
 * que la del visitante no llegaría.
 *
 * **`PROXY_SECRETO` es de servidor.** Nunca con prefijo `NEXT_PUBLIC_`, que se
 * inlinea en el bundle; y este módulo sólo lo importan rutas de servidor. Un
 * test de CI construye con un valor centinela y lo busca en `.next/static`.
 */

export const CABECERA_SECRETO = 'X-Tordo-Proxy';
export const CABECERA_VISITANTE = 'X-Tordo-Visitante';

/** Lo que se manda cuando no se sabe la IP. El backend no lo exime. */
export const VISITANTE_DESCONOCIDO = 'desconocido';

const PARECE_IP = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * La IP del visitante según la plataforma.
 *
 * En Vercel, `x-real-ip` y `x-forwarded-for` los pone Vercel y **sobrescribe**
 * lo que mande el cliente, así que la primera entrada es de fiar. Fuera de
 * Vercel (Next detrás de otro proxy) esa confianza es de quien lo despliegue.
 *
 * Si no se puede saber, `VISITANTE_DESCONOCIDO` y no nada: una petición de
 * navegador sin visitante se confundiría con un renderizado del servidor y
 * quedaría exenta del límite.
 */
export function ipDelVisitante(cabeceras: Headers): string {
  const candidatas = [
    cabeceras.get('x-real-ip'),
    cabeceras.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const candidata of candidatas) {
    const ip = candidata?.trim();
    if (ip && PARECE_IP.test(ip)) return ip;
  }
  return VISITANTE_DESCONOCIDO;
}

/**
 * Las cabeceras para una petición al backend. `visitante` es la IP de quien
 * originó la petición, o `null` si la origina el propio servidor (SSR/ISR).
 *
 * Sin `PROXY_SECRETO` no se manda nada: la IP del visitante sin el secreto el
 * backend no la cree, y mandarla sólo aparentaría que funciona.
 */
export function cabecerasHaciaElBackend(visitante: string | null): Record<string, string> {
  const secreto = process.env.PROXY_SECRETO;
  if (!secreto) return {};
  const cabeceras: Record<string, string> = { [CABECERA_SECRETO]: secreto };
  if (visitante !== null) cabeceras[CABECERA_VISITANTE] = visitante;
  return cabeceras;
}

/**
 * La URL de una ruta del backend, para las rutas de servidor que lo llaman
 * directamente (el proxy y los feeds RSS). `API_URL` es de servidor: nunca con
 * prefijo `NEXT_PUBLIC_`.
 */
export function urlDelBackend(ruta: string): string {
  const base = process.env.API_URL || 'http://localhost:8000';
  return `${base}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

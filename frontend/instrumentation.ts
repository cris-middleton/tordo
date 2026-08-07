/**
 * Sentry en el servidor de Next.
 *
 * Es donde vive lo que de verdad puede romperse sin que nadie lo vea: el proxy
 * de `/api/proxy`, los handlers de sesión y los server components. Un fallo ahí
 * no llega a ninguna consola del navegador.
 *
 * `register` corre una vez por instancia, y `NEXT_RUNTIME` distingue Node de
 * edge — cada uno necesita su propia inicialización.
 */

import * as Sentry from '@sentry/nextjs';

import { esRuido, OPCIONES_COMUNES } from '@/lib/sentry-comun';

export async function register() {
  const comunes = {
    ...OPCIONES_COMUNES,
    beforeSend(evento: Sentry.ErrorEvent, pista: Sentry.EventHint) {
      const mensaje =
        (pista?.originalException as Error | undefined)?.message ??
        evento.exception?.values?.[0]?.value;
      return esRuido(mensaje) ? null : evento;
    },
  };

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init(comunes);
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(comunes);
  }
}

/**
 * Los errores que Next captura al renderizar en el servidor no pasan por
 * `beforeSend` si no se los entrega explícitamente: sin esto, un fallo en un
 * server component se queda en el log del contenedor.
 */
export const onRequestError = Sentry.captureRequestError;

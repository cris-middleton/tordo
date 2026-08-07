/**
 * Sentry en el navegador.
 *
 * `instrumentation-client.ts` es el fichero que Next 16 ejecuta antes de que la
 * aplicación sea interactiva — antes existía como `sentry.client.config.ts`, que
 * ya no se lee.
 */

import * as Sentry from '@sentry/nextjs';

import { esRuido, OPCIONES_COMUNES } from '@/lib/sentry-comun';

Sentry.init({
  ...OPCIONES_COMUNES,

  // Sin replay de sesión, y es deliberado: graba la pantalla, y la pantalla
  // tiene RUTs, montos y documentos de la empresa. Un `maskAllText` es una
  // salvaguarda que hay que acertar; no grabar no hay que acertarlo.

  beforeSend(evento, pista) {
    const original = pista?.originalException;
    const mensaje =
      (original as Error | undefined)?.message ?? evento.exception?.values?.[0]?.value;
    if (esRuido(mensaje)) return null;

    // El 401 es el camino normal cuando caduca la sesión: el proxy renueva o
    // manda al login. No es un fallo que haya que mirar.
    const estado = (original as { response?: { status?: number } } | undefined)?.response?.status;
    if (estado === 401) return null;

    return evento;
  },
});

/**
 * Sin esto, una navegación del App Router aparece como una transacción sin
 * origen y no se puede saber desde qué pantalla salió.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

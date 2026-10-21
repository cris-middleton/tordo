'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { RotateCcw } from 'lucide-react';

import { Contenedor } from '@/components/cascara/Contenedor';

/**
 * La frontera de error de la aplicación.
 *
 * No había ninguna: un fallo al renderizar dejaba la pantalla de Next —"a
 * client-side exception has occurred"— y **nada quedaba registrado**. El
 * usuario veía una página en blanco y nosotros no nos enterábamos.
 *
 * «Reintentar» llama a `retry()`, que vuelve a pedir al servidor el segmento y
 * lo pinta de nuevo. Desde Next 16 `reset()` sólo vuelve a pintar lo que ya
 * había, sin pedir nada: si lo que falló fue la respuesta del servidor, el
 * botón no arreglaba nada. Vale la pena porque muchos de estos fallos son
 * transitorios (una respuesta a medias, el backend reiniciando).
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Contenedor pagina>
      <div className="max-w-3xl">
        <h1 className="page-title">Algo se rompió</h1>
        <p className="mt-2 text-sm text-muted">
          El fallo quedó registrado. Puedes reintentar: muchas veces es pasajero.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={() => retry()} className="btn-primary gap-2">
            <RotateCcw size={15} />
            Reintentar
          </button>
          <Link href="/" className="btn-secondary">
            Ir al inicio
          </Link>
        </div>
        {error.digest && (
          // El `digest` es lo único que identifica este fallo concreto en los
          // logs del servidor: sin él, un reporte de soporte no se puede cruzar
          // con nada.
          <p className="text-xs text-subtle mt-6">
            Referencia: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </Contenedor>
  );
}

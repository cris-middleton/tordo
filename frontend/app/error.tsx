'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { RotateCcw } from 'lucide-react';

/**
 * La frontera de error de la aplicación.
 *
 * No había ninguna: un fallo al renderizar dejaba la pantalla de Next —"a
 * client-side exception has occurred"— y **nada quedaba registrado**. El
 * usuario veía una página en blanco y nosotros no nos enterábamos.
 *
 * `reset()` vuelve a montar el segmento. Vale la pena porque muchos de estos
 * fallos son transitorios (una respuesta a medias, una carrera al cambiar de
 * empresa) y reintentar los resuelve sin perder la sesión.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="page-title mb-2">Algo se rompió</h1>
        <p className="text-sm text-muted mb-6">
          El fallo quedó registrado. Puedes reintentar: muchas veces es pasajero.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary gap-2">
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
    </div>
  );
}

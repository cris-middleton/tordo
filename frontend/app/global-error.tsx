'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * La última red: un fallo en el propio layout raíz.
 *
 * `error.tsx` no lo cubre — vive DENTRO del layout que se rompió. Por eso este
 * fichero reemplaza el documento entero y tiene que traer su `<html>` y su
 * `<body>` propios.
 *
 * Aquí no se usan tokens ni clases de Tailwind: si lo que falló es el layout,
 * puede que las hojas de estilo no hayan llegado. Los estilos van en línea a
 * propósito, para que esta pantalla se vea aunque no se vea nada más.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fff',
          color: '#111',
        }}
      >
        <div style={{ textAlign: 'center', padding: '1.5rem', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>La aplicación no pudo cargar</h1>
          <p style={{ fontSize: '0.875rem', color: '#555', marginBottom: '1.5rem' }}>
            El fallo quedó registrado. Vuelve a intentarlo en un momento.
          </p>
          {/* `<a>` y no `<Link/>` a propósito: `Link` navega por el router, y
              lo que acaba de fallar es el layout que lo sostiene. Aquí hace
              falta una recarga completa, que es justamente lo que el linter
              intenta evitar en el resto de la aplicación. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              background: '#111',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Recargar
          </a>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '1.5rem' }}>
              Referencia: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

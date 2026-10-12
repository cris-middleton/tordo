import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

/*
 * Las cabeceras de seguridad de `next.config.js`. Se comprueba la configuración,
 * no una respuesta: borrar el bloque no rompe ninguna página y sólo se notaría
 * el día que alguien enmarcara el sitio.
 */
vi.mock('@sentry/nextjs', () => ({ withSentryConfig: (c: unknown) => c }));

describe('cabeceras de seguridad', () => {
  it('todas las rutas llevan las cinco', async () => {
    const require = createRequire(import.meta.url);
    const config = require('../next.config.js');
    const reglas = await config.headers();
    const todas = reglas.find((r: { source: string }) => r.source === '/:path*');
    const valor = (k: string) =>
      todas.headers.find((h: { key: string; value: string }) => h.key === k)?.value;
    expect(valor('X-Content-Type-Options')).toBe('nosniff');
    expect(valor('X-Frame-Options')).toBe('DENY');
    expect(valor('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valor('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(valor('Permissions-Policy')).toContain('camera=()');
  });
});

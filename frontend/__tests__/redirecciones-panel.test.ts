import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

/*
 * Las redirecciones de `next.config.js` desde las URL viejas del panel
 * (`/dashboard/*`) a las públicas. Esas URL ya circulan —lectores de RSS,
 * marcadores, enlaces compartidos—, así que borrar una regla no rompe ninguna
 * página propia: rompe las de los demás, y nadie se enteraría.
 *
 * Que de verdad redirija con la query la comprueba `e2e/redirecciones.spec.ts`.
 */
vi.mock('@sentry/nextjs', () => ({ withSentryConfig: (c: unknown) => c }));

interface Regla {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
}

const ESPERADAS: [string, string][] = [
  ['/dashboard', '/licitaciones'],
  ['/dashboard/tenders', '/licitaciones'],
  ['/dashboard/tenders/:codigo', '/licitaciones/:codigo'],
  ['/dashboard/compra-agil', '/compra-agil'],
  ['/dashboard/bi', '/mercado'],
  ['/dashboard/guardados', '/guardados'],
];

async function reglas(): Promise<Regla[]> {
  const require = createRequire(import.meta.url);
  const config = require('../next.config.js');
  return config.redirects();
}

describe('redirecciones de /dashboard', () => {
  it.each(ESPERADAS)('%s → %s, permanente', async (origen, destino) => {
    const regla = (await reglas()).find((r) => r.source === origen);
    expect(regla).toBeDefined();
    expect(regla!.destination).toBe(destino);
    // `permanent: true` es 308: permanente para el buscador, y sin cambiar el
    // método. Un 307 dejaría la URL vieja indexada para siempre.
    expect(regla!.permanent).toBe(true);
    expect(regla!.statusCode).toBeUndefined();
  });

  it('no hay más reglas que las declaradas', async () => {
    expect((await reglas()).map((r) => r.source).sort()).toEqual(ESPERADAS.map(([o]) => o).sort());
  });

  it('cada destino es una página que existe en el grupo (panel)', () => {
    const app = join(__dirname, '..', 'app', '(panel)');
    for (const [, destino] of ESPERADAS) {
      const carpeta = destino.replace(':codigo', '[codigo]').slice(1);
      expect(existsSync(join(app, carpeta, 'page.tsx')), destino).toBe(true);
    }
  });

  it('ya no queda ninguna página bajo app/dashboard', () => {
    // Si volviera, sería código muerto: la redirección corre antes que las páginas.
    expect(existsSync(join(__dirname, '..', 'app', 'dashboard'))).toBe(false);
  });
});

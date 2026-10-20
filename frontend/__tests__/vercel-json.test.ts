// @vitest-environment node
/**
 * `vercel.json` sólo deja desplegar `main` (docs/DESPLIEGUE.md, «Por qué casi
 * no hay archivos de configuración»).
 *
 * Vercel compara las ramas con un glob, y en un glob `*` no cruza una `/`. Con
 * `"*": false` todas las ramas `feat/…` siguieron construyendo un Preview: 100
 * en la semana del 13 al 19 de octubre de 2026, contra el tope de 100
 * despliegues al día de Hobby. `path.matchesGlob` aplica la misma regla.
 */
import { readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';

import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as {
  git: { deploymentEnabled: Record<string, boolean> };
};

/** La regla de Vercel: despliega si alguna regla que la abarca dice `true`. */
function despliega(rama: string): boolean {
  const reglas = Object.entries(config.git.deploymentEnabled).filter(([patron]) =>
    matchesGlob(rama, patron),
  );
  if (reglas.length === 0) return true;
  return reglas.some(([, valor]) => valor);
}

describe('vercel.json', () => {
  it('despliega main', () => {
    expect(despliega('main')).toBe(true);
  });

  it.each(['feat/micro-buscar', 'fix/hora', 'dependabot/npm_and_yarn/next-16.3.9', 'prueba'])(
    'no despliega %s',
    (rama) => {
      expect(despliega(rama)).toBe(false);
    },
  );
});

/**
 * `REPOSITORIO_URL` — el enlace «Código» (spec del rediseño §6.1, §6.5).
 *
 * El repositorio sigue privado hasta limpiar su historia (R8): el sitio tiene
 * que poder desplegarse sin la variable y sin un enlace roto. Mismo criterio
 * que los medios de `/apoyar`: sólo `https://`; si no, nada.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { urlRepositorio } from '@/lib/repositorio';

describe('urlRepositorio', () => {
  it('devuelve la URL https', () => {
    expect(urlRepositorio({ REPOSITORIO_URL: 'https://github.com/x/tordo' })).toBe('https://github.com/x/tordo');
    expect(urlRepositorio({ REPOSITORIO_URL: '  https://github.com/x/tordo  ' })).toBe('https://github.com/x/tordo');
  });

  it.each([
    ['sin variable', {}],
    ['vacía', { REPOSITORIO_URL: '' }],
    ['http', { REPOSITORIO_URL: 'http://github.com/x/tordo' }],
    ['javascript', { REPOSITORIO_URL: 'javascript:alert(1)' }],
    ['texto', { REPOSITORIO_URL: 'pronto' }],
  ])('%s → null', (_, entorno) => {
    expect(urlRepositorio(entorno)).toBeNull();
  });

  it('por defecto lee process.env', () => {
    const antes = process.env.REPOSITORIO_URL;
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    try {
      expect(urlRepositorio()).toBe('https://github.com/x/tordo');
    } finally {
      if (antes === undefined) delete process.env.REPOSITORIO_URL;
      else process.env.REPOSITORIO_URL = antes;
    }
  });
});

describe('lib/repositorio.ts no llega al navegador', () => {
  // Lee una variable de servidor: en un componente cliente valdría siempre
  // `undefined` y «Código» no aparecería nunca, sin error.
  const RAIZ = join(__dirname, '..');
  function fuentes(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const r = join(dir, e);
      if (statSync(r).isDirectory()) return fuentes(r);
      return /\.tsx?$/.test(r) ? [r] : [];
    });
  }
  const clientes = ['app', 'components', 'hooks', 'lib']
    .flatMap((d) => fuentes(join(RAIZ, d)))
    .filter((r) => /^\s*['"]use client['"]/.test(readFileSync(r, 'utf-8')));

  it('ningún componente cliente lo importa', () => {
    expect(clientes.length).toBeGreaterThanOrEqual(10);
    const infractores = clientes.filter((r) => /from\s+['"][^'"]*\/repositorio['"]/.test(readFileSync(r, 'utf-8')));
    expect(infractores).toEqual([]);
  });
});

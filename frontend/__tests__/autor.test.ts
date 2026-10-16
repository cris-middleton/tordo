/**
 * Quién hace el sitio (spec PORTADA_V7 §7, V5): `AUTOR_NOMBRE` y `AUTOR_URL`,
 * variables de SERVIDOR y opcionales. La autoría no es el responsable legal:
 * así se firma sin tocar los términos. Sin la variable no se pinta nada.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { nombreAutor, nombreDelEnlace, urlAutor } from '@/lib/autor';
import { commitDelSitio } from '@/lib/repositorio';

describe('nombreAutor', () => {
  it('devuelve el nombre, sin espacios a los lados', () => {
    expect(nombreAutor({ AUTOR_NOMBRE: '  Nombre De Prueba ' })).toBe('Nombre De Prueba');
  });

  it.each([
    ['sin variable', {}],
    ['vacía', { AUTOR_NOMBRE: '' }],
    ['sólo espacios', { AUTOR_NOMBRE: '   ' }],
    ['más de 60 caracteres', { AUTOR_NOMBRE: 'x'.repeat(61) }],
  ])('%s → null', (_, entorno) => {
    expect(nombreAutor(entorno)).toBeNull();
  });

  it('no lee RESPONSABLE_LEGAL: firmar y responder por el sitio son cosas distintas', () => {
    expect(nombreAutor({ RESPONSABLE_LEGAL: 'Otra Persona' })).toBeNull();
  });
});

describe('urlAutor', () => {
  it('sólo https', () => {
    expect(urlAutor({ AUTOR_URL: 'https://github.com/alguien' })).toBe('https://github.com/alguien');
  });

  it.each([
    ['sin variable', {}],
    ['http', { AUTOR_URL: 'http://github.com/alguien' }],
    ['javascript', { AUTOR_URL: 'javascript:alert(1)' }],
    ['texto', { AUTOR_URL: 'alguien' }],
  ])('%s → null', (_, entorno) => {
    expect(urlAutor(entorno)).toBeNull();
  });
});

describe('nombreDelEnlace', () => {
  it.each([
    ['https://github.com/alguien', 'GitHub'],
    ['https://www.github.com/alguien', 'GitHub'],
    ['https://www.linkedin.com/in/alguien', 'LinkedIn'],
    ['https://cl.linkedin.com/in/alguien', 'LinkedIn'],
    ['https://alguien.cl/', 'alguien.cl'],
    ['https://www.alguien.dev/sobre-mi', 'alguien.dev'],
  ])('%s → %s', (url, esperado) => {
    expect(nombreDelEnlace(url)).toBe(esperado);
  });

  it('no confunde un dominio que sólo contiene el nombre', () => {
    expect(nombreDelEnlace('https://notgithub.com/x')).toBe('notgithub.com');
  });
});

describe('commitDelSitio', () => {
  const SHA = '0123456789abcdef0123456789abcdef01234567';

  it('sin VERCEL_GIT_COMMIT_SHA no hay commit', () => {
    expect(commitDelSitio({})).toBeNull();
    expect(commitDelSitio({ VERCEL_GIT_COMMIT_SHA: '' })).toBeNull();
    expect(commitDelSitio({ VERCEL_GIT_COMMIT_SHA: 'no-es-un-sha' })).toBeNull();
  });

  it('con la variable, los siete primeros caracteres', () => {
    expect(commitDelSitio({ VERCEL_GIT_COMMIT_SHA: SHA })).toEqual({ corto: '0123456', url: null });
  });

  it('con repositorio, enlazado al commit', () => {
    expect(
      commitDelSitio({ VERCEL_GIT_COMMIT_SHA: SHA, REPOSITORIO_URL: 'https://github.com/x/tordo' }),
    ).toEqual({ corto: '0123456', url: `https://github.com/x/tordo/commit/${SHA}` });
    expect(
      commitDelSitio({ VERCEL_GIT_COMMIT_SHA: SHA, REPOSITORIO_URL: 'https://github.com/x/tordo/' })?.url,
    ).toBe(`https://github.com/x/tordo/commit/${SHA}`);
  });
});

describe('lib/autor.ts no llega al navegador', () => {
  // Variables de servidor: en un componente cliente valdrían `undefined` y la
  // firma no saldría nunca, sin error.
  const RAIZ = join(__dirname, '..');
  function fuentes(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const r = join(dir, e);
      if (statSync(r).isDirectory()) return fuentes(r);
      return /\.tsx?$/.test(r) ? [r] : [];
    });
  }

  it('ningún componente cliente lo importa', () => {
    const clientes = ['app', 'components', 'hooks', 'lib']
      .flatMap((d) => fuentes(join(RAIZ, d)))
      .filter((r) => /^\s*['"]use client['"]/.test(readFileSync(r, 'utf-8')));
    expect(clientes.length).toBeGreaterThanOrEqual(10);
    const infractores = clientes.filter((r) => /from\s+['"][^'"]*\/autor['"]/.test(readFileSync(r, 'utf-8')));
    expect(infractores).toEqual([]);
  });
});

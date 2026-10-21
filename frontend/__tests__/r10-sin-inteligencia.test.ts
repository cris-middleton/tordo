/**
 * R10 del rediseño: «Inteligencia de compras públicas» sale de títulos,
 * metadatos e imagen de vista previa. Vocabulario llano: el sitio no vende
 * «inteligencia», responde qué se compra, a qué precio y quién lo compra.
 *
 * Se lee el código en vez de importarlo: `app/layout.tsx` arrastra `next/font`
 * y `opengraph-image.tsx` arrastra `next/og`, frágiles en jsdom.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

const PIEZAS = readdirSync(join(RAIZ, 'components', 'portada'))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => `components/portada/${f}`);

const FICHEROS = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/opengraph-image.tsx',
  'app/twitter-image.tsx',
  'app/(publico)/acerca/page.tsx',
  'lib/portada.ts',
  'lib/acerca.ts',
  ...PIEZAS,
];

describe('R10: sin «Inteligencia» en la portada, los metadatos y la tarjeta', () => {
  it('guarda: hay piezas de la portada que revisar', () => {
    expect(PIEZAS.length).toBeGreaterThanOrEqual(6);
  });

  it.each(FICHEROS)('%s no dice «inteligencia»', (f) => {
    expect(leer(f)).not.toMatch(/inteligencia/i);
  });

  it('la tarjeta de vista previa dice el titular de la portada', () => {
    expect(leer('app/opengraph-image.tsx')).toContain('Cuánto paga el Estado por lo que vendes');
  });

  it('la de X/Twitter sigue siendo la misma tarjeta, con el mismo alt', () => {
    const twitter = leer('app/twitter-image.tsx');
    expect(twitter).toMatch(/from '\.\/opengraph-image'/);
    expect(twitter).toMatch(/alt = altOg/);
  });
});

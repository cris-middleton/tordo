/**
 * La forma de un slug y de un código de comprador antes de llamar al backend.
 *
 * Las fichas públicas piden exentas del límite por IP (`lib/publicoServidor.ts`),
 * así que lo que no puede existir se corta antes: un 404 sin salir de Next.
 * El slug sigue `backend/app/utils/slug.py`; el largo máximo lo compara con el
 * del backend `backend/tests/test_parametros_publicos_del_frontend.py`.
 */

import { describe, expect, it } from 'vitest';

import { esCodigoComprador, esSlugPublico, LARGO_MAXIMO_SLUG } from '@/lib/parametrosPublicos';

describe('esSlugPublico', () => {
  it.each(['equipos-medicos-insumos', 'nandu-arbol', 'guantes-de-nitrilo-talla-m-100', 'x', '2024'])(
    'acepta lo que sale de slug(): %s',
    (slug) => {
      expect(esSlugPublico(slug)).toBe(true);
    },
  );

  it('acepta hasta el largo máximo, no más', () => {
    expect(esSlugPublico('a'.repeat(LARGO_MAXIMO_SLUG))).toBe(true);
    expect(esSlugPublico('a'.repeat(LARGO_MAXIMO_SLUG + 1))).toBe(false);
  });

  it.each([
    '',
    'Equipos-medicos',
    'equipos medicos',
    'equipos--medicos',
    '-equipos',
    'equipos-',
    'café',
    '../bi/x',
    'x?y=1',
    'x%2Fy',
    'equipos_medicos',
  ])('rechaza lo que slug() nunca produce: %j', (slug) => {
    expect(esSlugPublico(slug)).toBe(false);
  });
});

describe('esCodigoComprador', () => {
  it.each(['7297', '111875', '1342660', '123456789012'])('acepta un código numérico: %s', (codigo) => {
    expect(esCodigoComprador(codigo)).toBe(true);
  });

  it.each(['', '0', '07297', '1234567890123', 'no-existe', '7297a', '72 97', '7297/../x', '-7297', '7.297'])(
    'rechaza %j',
    (codigo) => {
      expect(esCodigoComprador(codigo)).toBe(false);
    },
  );
});

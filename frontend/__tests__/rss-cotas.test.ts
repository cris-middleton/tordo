// @vitest-environment node
/**
 * El feed no le pide al backend lo que rechaza (la búsqueda se recorta como en
 * `/buscar`), y una nota con sólo día no sale la tarde anterior en Chile.
 */
import { describe, expect, it } from 'vitest';

import { MAXIMO_CARACTERES_BUSCAR, MAXIMO_TERMINOS_BUSCAR } from '@/lib/buscar';
import { fechaRfc822, filtrarParams, PARAMS_RSS_LICITACIONES } from '@/lib/rss';

describe('cotas del feed', () => {
  it(`search, como mucho ${MAXIMO_CARACTERES_BUSCAR} caracteres y ${MAXIMO_TERMINOS_BUSCAR} palabras`, () => {
    const largo = filtrarParams(new URLSearchParams({ search: 'x'.repeat(150) }), PARAMS_RSS_LICITACIONES);
    expect(largo.get('search')).toHaveLength(MAXIMO_CARACTERES_BUSCAR);
    const muchas = filtrarParams(new URLSearchParams({ search: 'a b c d e f g h i j' }), PARAMS_RSS_LICITACIONES);
    expect(muchas.get('search')!.split(' ')).toHaveLength(MAXIMO_TERMINOS_BUSCAR);
  });

  it('los demás parámetros, hasta 200', () => {
    const p = filtrarParams(new URLSearchParams({ region: 'r'.repeat(300) }), PARAMS_RSS_LICITACIONES);
    expect(p.get('region')).toHaveLength(200);
  });
});

describe('fecha de un ítem', () => {
  it('un día solo se fecha a las 09:00 de Santiago', () => {
    expect(fechaRfc822('2026-10-20')).toBe('Tue, 20 Oct 2026 12:00:00 GMT');
  });

  it('un instante, tal cual', () => {
    expect(fechaRfc822('2026-10-20T15:00:00Z')).toBe('Tue, 20 Oct 2026 15:00:00 GMT');
    expect(fechaRfc822('no')).toBeNull();
  });
});

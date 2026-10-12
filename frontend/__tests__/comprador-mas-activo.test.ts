/**
 * «El comprador más activo» se cuenta en el rubro, que es por lo que se le elige.
 *
 * La frase usaba `n_oc_total` —todas sus órdenes, de cualquier rubro— y en
 * «Suministros de limpieza», un rubro con 6.377 órdenes en total, decía «con
 * 1.596.100 órdenes emitidas».
 */

import { describe, expect, it } from 'vitest';

import { frase3 } from '@/app/(panel)/mercado/narrative/templates';
import type { ResumenMercado } from '@/app/(panel)/mercado/types';

describe('frase del comprador más activo', () => {
  it('usa las órdenes del rubro y lo dice', () => {
    const r = {
      top_comprador: { nombre: 'Hospital X', n_oc_total: 1_596_100, n_oc_rubro: 812 },
    } as ResumenMercado;

    const frase = frase3(r) ?? '';

    expect(frase).toContain('812 órdenes</b> en este rubro');
    expect(frase).not.toContain('1.596.100');
  });

  it('sin el dato del rubro, no inventa uno con el total', () => {
    const r = { top_comprador: { nombre: 'Hospital X', n_oc_total: 1_596_100 } } as ResumenMercado;

    expect(frase3(r)).toBe('El comprador más activo es <b>Hospital X</b>.');
  });
});

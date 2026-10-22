/**
 * El resumen de `/mercado` no repite las cifras de justo debajo.
 *
 * Decía «movió $X entre 312 compradores» (los del último año) sobre la cifra
 * «Compradores en 36 meses: 540»: dos conteos de compradores con dos periodos,
 * uno al lado del otro, más el monto y los proveedores repetidos. Ahora dice lo
 * que las cifras no dicen: cuánto crece y quién compra más, con su periodo.
 */

import { describe, expect, it } from 'vitest';

import { buildFrases, frase2, frase3 } from '@/app/(panel)/mercado/narrative/templates';
import type { ResumenMercado } from '@/app/(panel)/mercado/types';
import { MESES_ANALISIS } from '@/lib/periodo';

const resumen: ResumenMercado = {
  disponible: true,
  rubro: 'Artículos de aseo',
  monto_anual_clp: 4_200_000_000,
  n_organismos: 312,
  n_proveedores_actual: 1_480,
  cagr_pct: 12.44,
  yoy_pct: 8.1,
  top_comprador: { nombre: 'HOSPITAL X', n_oc_rubro: 812 },
};

describe('resumen del rubro', () => {
  it('no repite el monto, los compradores ni los proveedores de las cifras', () => {
    const texto = buildFrases(resumen).join(' ');
    expect(texto).not.toMatch(/312|1\.480|millones|compradores|proveedores/);
  });

  it('dice el crecimiento con un decimal, como el gráfico por año', () => {
    expect(frase2(resumen)).toBe(
      'Las compras de <b>Artículos de aseo</b> han crecido <b>12,4 % al año</b> en promedio (el último año, +8,1 %).',
    );
  });

  it('las órdenes del comprador más activo llevan su periodo', () => {
    expect(frase3(resumen)).toContain(`en este rubro en los últimos ${MESES_ANALISIS} meses.`);
  });

  it('sin crecimiento ni comprador no hay frases (y la tarjeta no se pinta)', () => {
    expect(buildFrases({ disponible: true, rubro: 'X', monto_anual_clp: 1, n_organismos: 2 })).toEqual([]);
  });
});

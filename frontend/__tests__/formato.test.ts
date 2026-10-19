import { describe, expect, it } from 'vitest';

import { decimal, monto } from '@/lib/formato';

describe('decimal', () => {
  it('escribe con coma decimal', () => {
    expect(decimal(6.6, 1)).toBe('6,6');
    expect(decimal(0.9, 1)).toBe('0,9');
    expect(decimal(0.123, 2)).toBe('0,12');
  });

  it('fija los decimales, como toFixed', () => {
    expect(decimal(7, 1)).toBe('7,0');
    expect(decimal(2.25, 0)).toBe('2');
    expect(decimal(2.5, 0)).toBe('3');
  });

  it('pone punto de miles', () => {
    expect(decimal(1234.5, 0)).toBe('1.235');
    expect(decimal(12345.67, 1)).toBe('12.345,7');
  });

  it('sirve para las cifras compactas de plata', () => {
    // Lo que se veía como «CLP 1.5M» y «$1.5 mil millones».
    expect(`CLP ${decimal(1_500_000 / 1e6, 1)}M`).toBe('CLP 1,5M');
    expect(`$${decimal(1.5e9 / 1e9, 1)} mil millones`).toBe('$1,5 mil millones');
  });

  it('respeta el signo', () => {
    expect(decimal(-3.14, 1)).toBe('-3,1');
  });

  it('un decimal por defecto', () => {
    expect(decimal(9.87)).toBe('9,9');
  });
});

describe('monto: el formato de montos del sitio', () => {
  it('bajo un millón, la cifra entera con punto de miles', () => {
    expect(monto(0)).toBe('$0');
    expect(monto(825_000)).toBe('$825.000');
    expect(monto(999_949)).toBe('$999.949');
  });

  it('millones con un decimal, sin «,0», y «millón» en singular', () => {
    expect(monto(1_000_000)).toBe('$1 millón');
    expect(monto(999_950)).toBe('$1 millón');
    expect(monto(1_500_000)).toBe('$1,5 millones');
    expect(monto(7_215_100)).toBe('$7,2 millones');
    expect(monto(48_500_000)).toBe('$48,5 millones');
  });

  it('mil millones y billones a la chilena: nunca «B» ni «K»', () => {
    expect(monto(1_500_000_000)).toBe('$1,5 mil millones');
    expect(monto(2_100_000_000_000)).toBe('$2,1 billones');
    expect(monto(1_000_000_000_000)).toBe('$1 billón');
    for (const v of [1_000, 999_999, 1_000_000_000, 5e12]) expect(monto(v)).not.toMatch(/[KMB]$|K\b/);
  });

  it('un negativo lleva el signo menos tipográfico', () => {
    expect(monto(-2_500_000)).toBe('−$2,5 millones');
  });
});

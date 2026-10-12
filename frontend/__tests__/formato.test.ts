import { describe, expect, it } from 'vitest';

import { decimal } from '@/lib/formato';

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

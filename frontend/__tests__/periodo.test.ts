/**
 * Una banda o una cuota sin periodo se lee como «de siempre». El texto dice de
 * qué meses sale: 12 las bandas por producto, 36 las cuotas.
 */

import { describe, expect, it } from 'vitest';

import { textoPeriodo } from '@/lib/periodo';

describe('textoPeriodo', () => {
  it('dice los meses y cuántos son', () => {
    expect(textoPeriodo({ desde: '2025-04-01', hasta: '2026-03-31' })).toBe(
      'abr 2025 – mar 2026 (12 meses)',
    );
    expect(textoPeriodo({ desde: '2023-04-01', hasta: '2026-03-31' })).toMatch(/\(36 meses\)$/);
  });

  it('sin periodo no inventa uno', () => {
    expect(textoPeriodo(undefined)).toBeNull();
    expect(textoPeriodo(null)).toBeNull();
    expect(textoPeriodo({ desde: '2025-04-01', hasta: null })).toBeNull();
  });
});

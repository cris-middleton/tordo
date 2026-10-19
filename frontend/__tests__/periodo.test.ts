/**
 * Una banda o una cuota sin periodo se lee como «de siempre». El texto dice de
 * qué meses sale: 12 las bandas por producto, 36 las cuotas.
 */

import { describe, expect, it } from 'vitest';

import { etiquetaPublicadas, textoPeriodo } from '@/lib/periodo';

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

describe('etiquetaPublicadas', () => {
  it('dice desde cuándo mientras la ventana de 6 meses incluya oct 2026 (a medias) o antes', () => {
    expect(etiquetaPublicadas('2026-10-04')).toBe('Publicadas desde oct 2026');
    expect(etiquetaPublicadas('2027-03-31')).toBe('Publicadas desde oct 2026');
  });

  it('cuando la ventana empieza después de oct 2026, a secas', () => {
    expect(etiquetaPublicadas('2027-04-30')).toBe('Publicadas');
    expect(etiquetaPublicadas('2028-01-31')).toBe('Publicadas');
  });

  it('sin fecha, o ilegible, con la fecha: es lo seguro', () => {
    expect(etiquetaPublicadas(null)).toBe('Publicadas desde oct 2026');
    expect(etiquetaPublicadas('nunca')).toBe('Publicadas desde oct 2026');
  });
});

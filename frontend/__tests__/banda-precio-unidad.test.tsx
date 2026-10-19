import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { metadataProducto, tituloDeBanda, unidadDeclarada } from '@/lib/publico';
import type { BandaUnidad, ProductoPublico } from '@/types/publico';

const banda = (unidad: string | null): BandaUnidad => ({
  unidad,
  n: 40,
  p10: 1000,
  p25: 2000,
  p50: 3000,
  p75: 4000,
  p90: 5000,
  predictibilidad: 'alta',
  confianza: 0.8,
});

describe('título de la banda según la unidad', () => {
  it.each([
    ['Caja', 'Por caja'],
    ['  UNIDAD ', 'Por unidad'],
    [null, 'Sin unidad declarada'],
    ['', 'Sin unidad declarada'],
    // El pipeline escribe la ausencia como texto, no como nulo.
    ['sin unidad declarada', 'Sin unidad declarada'],
    ['Sin Unidad Declarada', 'Sin unidad declarada'],
    [' sin  unidad declarada ', 'Sin unidad declarada'],
  ])('%j → «%s»', (unidad, esperado) => {
    expect(tituloDeBanda(unidad)).toBe(esperado);
  });

  it('nunca dice «Por sin unidad declarada»', () => {
    expect(tituloDeBanda('sin unidad declarada')).not.toMatch(/por sin unidad/i);
  });

  it('el literal tampoco entra en la descripción de la ficha', () => {
    const p = {
      slug: 'x',
      firma: 'guantes nitrilo',
      nombre_generico: null,
      indexable: true,
      unidades: [banda('sin unidad declarada')],
    } as unknown as ProductoPublico;
    const descripcion = String(metadataProducto(p).description);
    expect(descripcion).toContain('precio mediano');
    expect(descripcion).not.toMatch(/por sin unidad/i);
  });

  it('unidadDeclarada devuelve null sin unidad que decir', () => {
    expect(unidadDeclarada('sin unidad declarada')).toBeNull();
    expect(unidadDeclarada(undefined)).toBeNull();
    expect(unidadDeclarada('Kilo')).toBe('kilo');
  });
});

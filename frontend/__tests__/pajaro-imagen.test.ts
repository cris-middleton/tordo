import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { OJO_PAJARO, TRAZOS_PAJARO } from '@/lib/pajaroImagen';

/*
 * La tarjeta de vista previa no puede leer el SVG del logo en tiempo de dibujo,
 * así que lleva una copia de sus trazos. Esto falla si el logo cambia y la copia no.
 */
const svg = readFileSync(join(__dirname, '..', 'public', 'images', 'tordo-logo-3-opened.svg'), 'utf8');

describe('el pájaro de la tarjeta de vista previa', () => {
  it('copia, en orden, todos los trazos del logo', () => {
    const delLogo = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    expect(delLogo.length).toBeGreaterThanOrEqual(7);
    expect(TRAZOS_PAJARO.map((t) => t.d)).toEqual(delLogo);
  });

  it('el ala y el pico son los trazos turquesa del logo', () => {
    const turquesas = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*fill:rgb\((?:51,187,187|61,185,187)\)/g)].map((m) => m[1]);
    expect(turquesas).toHaveLength(2);
    expect(TRAZOS_PAJARO.filter((t) => t.parte === 'ala').map((t) => t.d)).toEqual(turquesas);
  });

  it('el ojo está donde lo pone el logo', () => {
    const { cx, cy, rx, ry } = OJO_PAJARO;
    expect(svg).toContain(`cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`);
  });
});

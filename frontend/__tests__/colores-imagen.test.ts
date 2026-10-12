import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COLORES_IMAGEN } from '@/lib/coloresImagen';

/*
 * La imagen de vista previa no puede leer los tokens (se dibuja sin CSS), así que
 * lleva una copia. Esto falla si el token cambia y la copia no.
 */
const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

describe('colores de la imagen de vista previa', () => {
  for (const [nombre, c] of Object.entries(COLORES_IMAGEN)) {
    it(`${nombre} sigue al token ${c.token}`, () => {
      const linea = new RegExp(`${c.token}:\\s*${c.rgb.replace(/ /g, '\\s+')};`);
      expect(css).toMatch(linea);
      const [r, g, b] = c.rgb.split(' ').map(Number);
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      expect(c.hex.toUpperCase()).toBe(hex);
    });
  }
});

/**
 * Un `<select>` nativo mide lo que su opción más larga. Con nombres reales de
 * organismos («I MUNICIPALIDAD DE …», 40 caracteres) el de Competencia medía 379 px
 * dentro de una tarjeta y `/mercado` se salía a 432 px de ancho en un móvil de 390:
 * el E2E no lo veía porque el fixture trae nombres cortos. Todo `<select>` lleva
 * un tope de ancho (`w-full`, `max-w-*` o `.input-field`, que ya es `w-full`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) return tsx(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

const ACOTADO = /(^|\s)(w-full|max-w-[\w[\]()%.-]+|input-field)(\s|$)/;

describe('los <select> no ensanchan la página', () => {
  const selects = ['app', 'components'].flatMap((d) => tsx(join(RAIZ, d))).flatMap((f) => {
    const s = readFileSync(f, 'utf8');
    return [...s.matchAll(/<select\b/g)].map((m) => {
      const tramo = s.slice(m.index! + 7, m.index! + 600);
      const clase = /className=(?:\{`|")([^"`]*)/.exec(tramo)?.[1] ?? '';
      return { donde: `${relative(RAIZ, f)}:${s.slice(0, m.index).split('\n').length}`, clase };
    });
  });

  it('encuentra los select del sitio (guarda contra un recorrido vacío)', () => {
    expect(selects.length).toBeGreaterThanOrEqual(10);
  });

  it('todos llevan un tope de ancho', () => {
    expect(selects.filter((x) => !ACOTADO.test(x.clase)).map((x) => x.donde)).toEqual([]);
  });
});

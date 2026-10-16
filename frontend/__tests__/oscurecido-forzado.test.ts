import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * El tema claro no se deja oscurecer por el navegador.
 *
 * Chrome en Android con «oscurecer sitios web» (y las WebView que heredan ese ajuste)
 * invierte cualquier página cuyo `color-scheme` no diga `dark` ni `only`. next-themes
 * escribía `style="color-scheme: light"` en `<html>`: con el teléfono en oscuro, el
 * tema claro por defecto se veía negro. En Blink
 * (`ComputedStyleBuilder::SetUsedColorScheme`) sólo dos declaraciones lo evitan: `only`,
 * que prohíbe al navegador cambiar el esquema, y `dark`, que dice que la página ya trae
 * el suyo.
 *
 * Lo que fija:
 * - `:root` declara `only light` y `:root.dark`, `dark`; ninguna otra regla toca el
 *   esquema (una tercera con `light` a secas lo volvería a abrir).
 * - next-themes no escribe su `color-scheme` en línea: le ganaría a la hoja.
 * - La etiqueta `<meta name="color-scheme">` dice `only light`, para el primer pintado.
 *
 * El navegador lo comprueba con el oscurecido encendido en `e2e/oscurecido-forzado.spec.ts`.
 */

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Cada declaración de `color-scheme` de la hoja, con el selector de su regla. */
function declaracionesColorScheme(css: string): { selector: string; valor: string }[] {
  const salida: { selector: string; valor: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const d of m[2].matchAll(/(?:^|;)\s*color-scheme\s*:\s*([^;]+)/g)) {
      salida.push({ selector: m[1].trim(), valor: d[1].trim() });
    }
  }
  return salida;
}

describe('el oscurecido automático del navegador', () => {
  it('globals.css declara only light en la raíz y dark sólo con el tema oscuro', () => {
    const css = sinComentarios(leer('app/globals.css'));
    expect(declaracionesColorScheme(css)).toEqual([
      { selector: ':root', valor: 'only light' },
      { selector: ':root.dark', valor: 'dark' },
    ]);
  });

  it('next-themes no escribe color-scheme en línea', () => {
    const providers = sinComentarios(leer('app/providers.tsx'));
    expect(providers).toMatch(/<ThemeProvider[\s\S]*?enableColorScheme=\{false\}[\s\S]*?>/);
  });

  it('la etiqueta meta color-scheme dice only light', () => {
    const layout = sinComentarios(leer('app/layout.tsx'));
    expect(layout).toMatch(
      /export const viewport: Viewport = \{[^}]*colorScheme: 'only light'[^}]*\}/,
    );
  });
});

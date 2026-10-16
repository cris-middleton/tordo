/**
 * Los campos de formulario miden 16 px en móvil (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §4).
 *
 * Safari en iOS amplía la página al enfocar un campo de menos de 16 px, y no la
 * devuelve sola: quien busca en `/licitaciones` desde el teléfono terminaba con
 * la pantalla corrida. `.input-field` es `text-base sm:text-sm`, y un `text-sm`
 * suelto en el elemento lo deshace (las utilidades ganan a los componentes), así
 * que esto mira cada `<input>`, `<select>` y `<textarea>` de `app/` y
 * `components/`: un tamaño de letra menor de 16 px sólo vale desde `sm:`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    if (statSync(r).isDirectory()) return fuentes(r);
    return /\.tsx$/.test(r) ? [r] : [];
  });
}

/** Las etiquetas de apertura de los campos, con llaves de JSX dentro (`onChange={(e) => …}`). */
function camposDe(texto: string): string[] {
  const campos: string[] = [];
  for (const m of texto.matchAll(/<(input|select|textarea)\b/g)) {
    let profundidad = 0;
    let i = m.index! + m[0].length;
    for (; i < texto.length; i++) {
      const c = texto[i];
      if (c === '{') profundidad++;
      else if (c === '}') profundidad--;
      else if (c === '>' && profundidad === 0) break;
    }
    campos.push(texto.slice(m.index!, i + 1));
  }
  return campos;
}

/** Un campo de texto con letra de menos de 16 px en móvil. Las casillas no tienen texto. */
function chicoEnMovil(campo: string): boolean {
  if (/type=["'](checkbox|radio|hidden)["']/.test(campo)) return false;
  return /(?:^|[\s"'`])text-(?:xs|sm|\[(?:1[0-5]|\d)px\])(?=[\s"'`])/.test(campo);
}

const ARCHIVOS = ['app', 'components'].flatMap((d) => fuentes(join(RAIZ, d)));

describe('campos a 16 px en móvil', () => {
  it('.input-field es text-base y vuelve a text-sm desde sm', () => {
    const css = readFileSync(join(RAIZ, 'app', 'globals.css'), 'utf8');
    const regla = css.match(/\.input-field\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(regla).toMatch(/\btext-base\b/);
    expect(regla).toMatch(/\bsm:text-sm\b/);
    expect(regla).not.toMatch(/(^|\s)text-(xs|sm)\b/);
  });

  it('ningún campo baja de 16 px sin prefijo sm:', () => {
    const campos = ARCHIVOS.flatMap((ruta) =>
      camposDe(readFileSync(ruta, 'utf8')).map((c) => ({ ruta: relative(RAIZ, ruta), c })),
    );
    // Guarda: el buscador de la portada, el de /licitaciones, el de /compra-agil…
    expect(campos.length).toBeGreaterThanOrEqual(15);
    const chicos = campos.filter(({ c }) => chicoEnMovil(c)).map(({ ruta, c }) => `${ruta}: ${c.slice(0, 80)}`);
    expect(chicos).toEqual([]);
  });

  it('los detectores ven lo que tienen que ver', () => {
    expect(camposDe('<input onChange={(e) => x(e)} className="a" />')).toEqual([
      '<input onChange={(e) => x(e)} className="a" />',
    ]);
    expect(chicoEnMovil('<input className="input-field pl-9 text-sm" />')).toBe(true);
    expect(chicoEnMovil('<select className="px-2 text-xs" />')).toBe(true);
    expect(chicoEnMovil('<select className="px-2 text-base sm:text-xs" />')).toBe(false);
    expect(chicoEnMovil('<input type="checkbox" className="text-sm" />')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los rellenos de color se invierten con el tema: en claro `bg-accent` es el
 * teal oscuro y la etiqueta va blanca; en oscuro es el teal claro y la etiqueta
 * va navy. Por eso existen los tokens `--color-on-*`.
 *
 * Escribir `text-white` sobre un fondo de token funciona en tema claro —donde
 * `on-accent` justamente ES blanco— y falla en oscuro, así que el error pasa
 * inadvertido si sólo se revisa el tema por defecto. Ya ocurrió una vez: la
 * migración de la landing a tokens conservó siete `text-white` literales y
 * dejó los CTA en 2.37:1 en tema oscuro.
 *
 * La regla estaba escrita en un comentario de globals.css, que no la hace
 * cumplir. Este test sí.
 */

const RAIZ = join(__dirname, '..');
const CARPETAS = ['app', 'components'];
const RELLENOS = ['primary', 'accent', 'gold', 'success', 'danger', 'warning', 'info', 'dato'];

// `bg-<token>` y `text-white` dentro del mismo atributo de clase, en cualquier orden.
const PATRONES = RELLENOS.flatMap((t) => [
  new RegExp(`bg-${t}\\b[^"'\`]*text-white`),
  new RegExp(`text-white[^"'\`]*bg-${t}\\b`),
]);

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (ruta.endsWith('.tsx')) salida.push(ruta);
  }
  return salida;
}

describe('etiquetas sobre rellenos de color', () => {
  it('ningún componente fija text-white sobre un fondo de token', () => {
    const infractores: string[] = [];

    for (const carpeta of CARPETAS) {
      for (const archivo of archivosTsx(join(RAIZ, carpeta))) {
        const lineas = readFileSync(archivo, 'utf-8').split('\n');
        lineas.forEach((linea, i) => {
          if (PATRONES.some((re) => re.test(linea))) {
            infractores.push(`${archivo.replace(RAIZ + '/', '')}:${i + 1}`);
          }
        });
      }
    }

    expect(
      infractores,
      `Usa text-onAccent / text-onPrimary / text-onDato… en vez de text-white:\n  ${infractores.join('\n  ')}`,
    ).toEqual([]);
  });
});

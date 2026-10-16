/**
 * La voz del sitio (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md §6, D11 y D13), en
 * lo que se puede comprobar sin leer:
 *
 *   1. «gratis y sin cuenta» (y «sin registrarte») no vuelve a un título, una
 *      descripción ni a la portada: dice lo que el sitio NO cobra, no lo que es;
 *   2. los textos de la portada (`lib/portada.ts`, `lib/lecturasPortada.ts`) no
 *      llevan signos de exclamación, y ninguna pieza de la portada abre una.
 *
 * Se lee el código en vez de importarlo, como `r10-sin-inteligencia.test.ts`:
 * `app/layout.tsx` arrastra `next/font`, frágil en jsdom.
 *
 * Lo que se queda a propósito (spec §6.2) no entra aquí: «sin registrarte» en
 * una respuesta de `lib/acerca.ts` y «sin cuenta» en `/guardados` responden una
 * duda donde se tiene; no son títulos, ni descripciones, ni la portada.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/page';

const RAIZ = join(__dirname, '..');
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

function archivos(dir: string, extension: RegExp): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extension));
    else if (extension.test(ruta)) salida.push(ruta);
  }
  return salida;
}

/** Sin comentarios de bloque ni de línea (`//` que no sea parte de una URL). */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const COLETILLA = /gratis y sin cuentas?|sin registrarte/i;

/** Todo lo que pone un título o una descripción: `app/` entero y los metadatos de las fichas. */
const CON_METADATOS = [...archivos(join(RAIZ, 'app'), /\.tsx?$/), join(RAIZ, 'lib', 'publico.ts')];

const PIEZAS_PORTADA = archivos(join(RAIZ, 'components', 'portada'), /\.tsx$/);

// `lib/lecturasPortada.ts` lo añade el PR de las lecturas de la portada. Mientras
// una rama no lo tenga se salta, pero `lib/portada.ts` siempre cuenta (el suelo de
// abajo). Tras el rebase sobre ese PR, `existsSync` es verdadero y se vigila solo.
const TEXTOS_PORTADA = ['lib/portada.ts', 'lib/lecturasPortada.ts']
  .map((r) => join(RAIZ, r))
  .filter((f) => existsSync(f));

describe('D11: fuera «gratis y sin cuenta» de títulos, descripciones y la portada', () => {
  it('guarda: hay ficheros que revisar (un test sin guarda se queda mudo comprobando el vacío)', () => {
    expect(CON_METADATOS.length).toBeGreaterThanOrEqual(50);
    expect(PIEZAS_PORTADA.length).toBeGreaterThanOrEqual(6);
    expect(TEXTOS_PORTADA.length).toBeGreaterThanOrEqual(1);
  });

  it.each([...CON_METADATOS, ...PIEZAS_PORTADA, ...TEXTOS_PORTADA].map((f) => [relative(RAIZ, f), f]))(
    '%s no lo dice',
    (_, fichero) => {
      expect(sinComentarios(readFileSync(fichero, 'utf8'))).not.toMatch(COLETILLA);
    },
  );

  it('el título y la descripción de la portada dicen qué es, no qué no cobra', () => {
    expect(metadata.title).toEqual({ absolute: `${APP_NAME} — Qué compra el Estado de Chile y a qué precio` });
    expect(metadata.description).toBe(
      'Busca lo que vendes y mira cuánto ha pagado el Estado, quién lo compra y qué está abierto hoy. Con los datos públicos de ChileCompra.',
    );
  });
});

/** Cada literal de texto ('…', "…" o `…`) de un fuente sin comentarios. */
const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

describe('§6.1: sin exclamaciones en los textos de la portada', () => {
  it.each(TEXTOS_PORTADA.map((f) => [relative(RAIZ, f), f]))('%s', (_, fichero) => {
    const literales = sinComentarios(readFileSync(fichero, 'utf8')).match(LITERAL) ?? [];
    expect(literales.length, 'guarda: el fichero tiene textos').toBeGreaterThan(5);
    expect(literales.filter((t) => /[!¡]/.test(t))).toEqual([]);
  });

  it.each(PIEZAS_PORTADA.map((f) => [relative(RAIZ, f), f]))('%s no abre una exclamación', (_, fichero) => {
    expect(sinComentarios(readFileSync(fichero, 'utf8'))).not.toMatch(/¡/);
  });
});

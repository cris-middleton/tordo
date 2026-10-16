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

/**
 * La coletilla de «lo que el sitio NO cobra», con sus variantes: «sin cuenta.»
 * cerrando una frase, «sin clave y sin cuenta» y «sin cuentas, sin planes».
 */
const COLETILLA = /gratis y sin cuentas?|sin registrarte|sin cuenta\.|sin clave y sin cuenta|sin cuentas, sin planes/i;

/** Todo lo que pone un título o una descripción: `app/` entero y los metadatos de las fichas. */
const CON_METADATOS = [
  ...archivos(join(RAIZ, 'app'), /\.tsx?$/),
  join(RAIZ, 'lib', 'publico.ts'),
  join(RAIZ, 'lib', 'compraAgil.ts'),
];

/** Título y descripción de cada guía (el frontmatter de `content/explicativos/*.mdx`). */
const GUIAS = archivos(join(RAIZ, 'content', 'explicativos'), /\.mdx$/);
const frontmatterDeGuia = (fuente: string) => (/^---\n([\s\S]*?)\n---/.exec(fuente)?.[1] ?? '');

/**
 * Las notas de datos (`content/notas/*.mdx`): se revisan enteras, no sólo el
 * título, porque se leen enteras — y su resumen sale en la portada y en el feed.
 */
const NOTAS = archivos(join(RAIZ, 'content', 'notas'), /\.mdx$/);
const sinBloquesDeCodigo = (fuente: string) => fuente.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

// Las piezas de la portada y las que comparte con la ficha de producto (spec PORTADA_V7 §9).
const PIEZAS_PORTADA = ['portada', 'metodo', 'precio'].flatMap((d) => archivos(join(RAIZ, 'components', d), /\.tsx$/));

// Los dos ficheros de textos de la portada existen desde el PR 3: si uno falta,
// el test falla (no se salta), porque un test que filtra lo que no existe se queda
// mudo comprobando el vacío.
const TEXTOS_PORTADA = ['lib/portada.ts', 'lib/lecturasPortada.ts', 'lib/metodo.ts', 'lib/graficoPrecio.ts'].map((r) =>
  join(RAIZ, r),
);

describe('D11: fuera «gratis y sin cuenta» de títulos, descripciones y la portada', () => {
  it('guarda: hay ficheros que revisar (un test sin guarda se queda mudo comprobando el vacío)', () => {
    expect(CON_METADATOS.length).toBeGreaterThanOrEqual(50);
    expect(PIEZAS_PORTADA.length).toBeGreaterThanOrEqual(10);
    expect(GUIAS.length).toBeGreaterThanOrEqual(5);
    expect(NOTAS.length).toBeGreaterThanOrEqual(4);
    for (const f of TEXTOS_PORTADA) expect(existsSync(f), `${f} tiene que existir`).toBe(true);
  });

  it.each([...CON_METADATOS, ...PIEZAS_PORTADA, ...TEXTOS_PORTADA].map((f) => [relative(RAIZ, f), f]))(
    '%s no lo dice',
    (_, fichero) => {
      expect(sinComentarios(readFileSync(fichero, 'utf8'))).not.toMatch(COLETILLA);
    },
  );

  it.each(GUIAS.map((f) => [relative(RAIZ, f), f]))('%s: título y descripción no lo dicen', (_, fichero) => {
    const frontmatter = frontmatterDeGuia(readFileSync(fichero, 'utf8'));
    expect(frontmatter, 'guarda: la guía tiene frontmatter').toMatch(/descripcion:/);
    expect(frontmatter).not.toMatch(COLETILLA);
  });

  it.each(NOTAS.map((f) => [relative(RAIZ, f), f]))('%s: ni en el frontmatter ni en el cuerpo', (_, fichero) => {
    expect(readFileSync(fichero, 'utf8')).not.toMatch(COLETILLA);
  });

  it('el título y la descripción de la portada dicen qué es, no qué no cobra', () => {
    expect(metadata.title).toEqual({ absolute: `${APP_NAME} — Qué compra el Estado de Chile y a qué precio` });
    expect(metadata.description).toBe(
      'Busca lo que vendes y mira cuánto ha pagado el Estado, quién lo compra y qué está abierto hoy. Con los datos públicos de ChileCompra.',
    );
  });
});

/** Cada literal de texto ('…', "…" o `…`) de un fuente sin comentarios. */
const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/**
 * El texto suelto de un JSX: lo que queda entre un `>` que cierra una etiqueta y el
 * siguiente `<`, sin llaves. El `>` de una flecha (`=>`) o de una anotación de tipo no
 * abre texto, y el `!` de `!=`, `!==` o del no-nulo de TS (`x!.y`) no es una exclamación.
 */
const TEXTO_JSX = /(?:(?<![=\-])>|\})([^<>{}]*)(?=[<{])/g;
const exclamaciones = (fuente: string) =>
  [...fuente.matchAll(TEXTO_JSX)]
    .map((m) => m[1])
    .filter((t) => /¡|[\p{L}\p{N}]!(?![=.\[)\];,])/u.test(t));

describe('§6.1: sin exclamaciones en los textos de la portada', () => {
  it.each(TEXTOS_PORTADA.map((f) => [relative(RAIZ, f), f]))('%s', (_, fichero) => {
    const literales = sinComentarios(readFileSync(fichero, 'utf8')).match(LITERAL) ?? [];
    expect(literales.length, 'guarda: el fichero tiene textos').toBeGreaterThan(5);
    expect(literales.filter((t) => /[!¡]/.test(t))).toEqual([]);
  });

  it.each(PIEZAS_PORTADA.map((f) => [relative(RAIZ, f), f]))('%s: ni en el texto JSX ni en un literal', (_, fichero) => {
    const fuente = sinComentarios(readFileSync(fichero, 'utf8'));
    expect(fuente).not.toMatch(/¡/);
    expect(exclamaciones(fuente)).toEqual([]);
    // Un literal con «!» dentro (aria-label, alt, title…); el `!` de código queda fuera de las comillas.
    expect((fuente.match(LITERAL) ?? []).filter((t) => /!/.test(t) && !/!=/.test(t))).toEqual([]);
  });

  it.each(NOTAS.map((f) => [relative(RAIZ, f), f]))('%s: sin exclamaciones fuera del código', (_, fichero) => {
    expect(sinBloquesDeCodigo(readFileSync(fichero, 'utf8'))).not.toMatch(/[!¡]/);
  });

  it('el detector ve una exclamación en JSX y no confunde el código', () => {
    expect(exclamaciones('<p>Hola!</p>')).toHaveLength(1);
    expect(exclamaciones('<p>\n  Mira esto!\n</p>')).toHaveLength(1);
    expect(exclamaciones('const f = (a) => a != null ? <b>ok</b> : null;')).toEqual([]);
    expect(exclamaciones('const f = (a) => a!.x ? <b>ok</b> : null;')).toEqual([]);
    expect(exclamaciones('<p>Sin exclamación</p>')).toEqual([]);
    // Junto a una expresión: el texto queda entre `>` y `{`, o entre `}` y `<`.
    expect(exclamaciones('<p>Mira esto! {x}</p>')).toHaveLength(1);
    expect(exclamaciones('<p>{x} gratis!</p>')).toHaveLength(1);
    expect(exclamaciones('<p>Busca ya!{" "}</p>')).toHaveLength(1);
    expect(exclamaciones('<p>{x} y {y}</p>')).toEqual([]);
    expect(exclamaciones('const b = {a: 1}; if (!c) { d(); }')).toEqual([]);
  });
});

/**
 * Fuera las señales de plantilla (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md, V10).
 *
 * El dueño las vetó y seguían en `/productos`, `/acerca`, `/abierto`, las guías y
 * el pie: antetítulos en mayúsculas («PRECIO DE REFERENCIA», «ACERCA»),
 * encabezados de tabla en versalitas con espaciado, y metadatos separados por
 * punto medio («Confianza alta · N=90», «Tordo · Chile · …»). Una etiqueta va en
 * caja normal y en `muted`; varios datos seguidos se escriben como frase.
 *
 * Mira TODO el texto de cada fichero de `app/` y `components/`, comentarios
 * incluidos: un comentario con el patrón es el que se copia en la siguiente
 * pieza. Si de verdad hace falta una excepción, va en `PERMITIDOS` con su motivo.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    if (statSync(r).isDirectory()) return fuentes(r);
    return /\.(ts|tsx|css)$/.test(r) ? [r] : [];
  });
}

const ARCHIVOS = ['app', 'components'].flatMap((d) => fuentes(join(RAIZ, d)));

/** Patrón → qué es. `first-letter:uppercase` no es versalita: capitaliza la etiqueta de una cifra. */
const PROHIBIDOS: [RegExp, string][] = [
  [/(?<![\w:-])uppercase\b|(?<=[\s"'`])(?:sm|md|lg|xl):uppercase\b/, 'texto en mayúsculas por CSS (antetítulo o encabezado en versalitas)'],
  [/text-transform:\s*uppercase|font-variant(?:-caps)?:\s*(?:all-)?small-caps|\bsmall-caps\b/, 'mayúsculas o versalitas en CSS'],
  [/\btracking-(?:wide|wider|widest)\b|letter-spacing:\s*0?\.\d+em/, 'espaciado de letras de antetítulo'],
  [/·/, 'punto medio como separador: escríbelo como frase'],
];

/** Fichero relativo a frontend/ → motivo. Vacío: no hace falta ninguna excepción. */
const PERMITIDOS: Record<string, string> = {};

describe('sin señales de plantilla en app/ y components/', () => {
  it('recorre los fuentes (guarda contra comprobar el vacío)', () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100);
  });

  it.each(PROHIBIDOS)('ningún %s', (patron, que) => {
    const hallazgos = ARCHIVOS.flatMap((ruta) => {
      const rel = relative(RAIZ, ruta).split('\\').join('/');
      if (rel in PERMITIDOS) return [];
      return readFileSync(ruta, 'utf8')
        .split('\n')
        .flatMap((linea, i) => (patron.test(linea) ? [`${rel}:${i + 1}`] : []));
    });
    expect(hallazgos, que).toEqual([]);
  });

  /**
   * El borde lateral grueso de color sobre una tarjeta o un aviso («side-tab»): la
   * señal de plantilla más reconocible según el detector de Impeccable
   * (`make diseno`). Salía en el aviso «Mirando en detalle» de `/mercado`, en la
   * franja de color de cada tarjeta de `/licitaciones` y en `.alert-critical`.
   * Desde 3 px: el filete de 2 px de una cita (`components/guias/Markdown.tsx`)
   * es la convención tipográfica de siempre, sin caja ni fondo, y el detector no
   * lo marca. La franja de las tarjetas era un `div` de `w-1`, que esto no ve:
   * para eso está `make diseno` sobre el render.
   */
  const BORDE_LATERAL = /\bborder-[lr]-(?:[3-9]|\[)|border-(?:left|right)-width:\s*[3-9]/;
  /** Fichero → motivo. */
  const BORDE_LATERAL_PERMITIDO: Record<string, string> = {
    // Un filete junto a una cifra suelta, sin caja ni fondo: no es una tarjeta.
    // El dueño lo vio en la portada y no lo objetó (2026-10-17), y el detector
    // no lo marca en el render.
    'components/portada/TiraCifras.tsx': 'filete de las cifras de la portada',
  };

  it('ningún borde lateral grueso de color (side-tab)', () => {
    const hallazgos = ARCHIVOS.flatMap((ruta) => {
      const rel = relative(RAIZ, ruta).split('\\').join('/');
      if (rel in BORDE_LATERAL_PERMITIDO) return [];
      return readFileSync(ruta, 'utf8')
        .split('\n')
        .flatMap((linea, i) => (BORDE_LATERAL.test(linea) ? [`${rel}:${i + 1}`] : []));
    });
    expect(hallazgos).toEqual([]);
    expect(BORDE_LATERAL.test('rounded-xl border-l-4 border-accent')).toBe(true);
    expect(BORDE_LATERAL.test('border-left-width: 3px;')).toBe(true);
    expect(BORDE_LATERAL.test('border-l border-border')).toBe(false);
    expect(BORDE_LATERAL.test('border-l-2 border-accent pl-4')).toBe(false);
  });

  it('el patrón detecta lo que tiene que detectar', () => {
    const [mayus, , espaciado, punto] = PROHIBIDOS.map(([p]) => p);
    expect(mayus.test('className="text-xs uppercase text-muted"')).toBe(true);
    expect(mayus.test('className="sm:uppercase"')).toBe(true);
    expect(mayus.test('className="first-letter:uppercase"')).toBe(false);
    expect(espaciado.test('tracking-wider')).toBe(true);
    expect(espaciado.test('tracking-tight')).toBe(false);
    expect(punto.test('Confianza alta · N=90')).toBe(true);
  });
});

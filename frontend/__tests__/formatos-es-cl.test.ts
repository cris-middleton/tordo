/**
 * Toda cifra y toda fecha visibles, en `es-CL` (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §6).
 *
 * La auditoría del 2026-10-16 vio «29,586 resultados» (`toLocaleString()` sin
 * locale: el navegador elige, y en uno en inglés sale la coma) al lado de «4.409»
 * en la portada, y «16 Oct 26» (`format` de date-fns sin `locale`: inglés, con
 * mayúscula). En Chile «29,586» se lee como veintinueve coma algo.
 *
 * Falla si aparece un `toLocale*String(` o un `new Intl.*(` cuyo primer argumento
 * no sea `'es-CL'`, o un `format(` de date-fns con nombres de mes o de día y sin
 * `locale`. Una excepción que no se muestra va en `PERMITIDOS` con su motivo.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    if (statSync(r).isDirectory()) return fuentes(r);
    return /\.(ts|tsx)$/.test(r) ? [r] : [];
  });
}

const ARCHIVOS = ['app', 'components', 'lib'].flatMap((d) => fuentes(join(RAIZ, d)));

/** «fichero:patrón» → por qué. */
const PERMITIDOS: Record<string, string> = {
  // `formatToParts` con `timeZone`: lee año, mes, día y hora de Chile como números, no
  // escribe nada visible. `en-US` porque sus partes son cifras ASCII sin sorpresas.
  'lib/compraAgil.ts:Intl.DateTimeFormat': 'partes numéricas de una fecha, no texto visible',
};

const rel = (ruta: string) => relative(RAIZ, ruta).split('\\').join('/');
const linea = (texto: string, indice: number) => texto.slice(0, indice).split('\n').length;

/** Llamadas cuyo primer argumento no es 'es-CL' (o que no lo traen). */
function sinLocale(texto: string): { que: string; indice: number }[] {
  const hallazgos: { que: string; indice: number }[] = [];
  for (const m of texto.matchAll(/\.(toLocale(?:Date|Time)?String)\(\s*([^)]?)/g)) {
    if (!texto.slice(m.index! + m[0].length - m[2].length).match(/^['"]es-CL['"]/)) {
      hallazgos.push({ que: m[1], indice: m.index! });
    }
  }
  for (const m of texto.matchAll(/new\s+Intl\.(\w+)\(\s*/g)) {
    if (!texto.slice(m.index! + m[0].length).match(/^['"]es-CL['"]/)) {
      hallazgos.push({ que: `Intl.${m[1]}`, indice: m.index! });
    }
  }
  return hallazgos;
}

/** `format(fecha, 'd MMM yyyy')` de date-fns sin opciones: nombres de mes o de día en inglés. */
function fechasEnIngles(texto: string): number[] {
  if (!/from\s+['"]date-fns['"]/.test(texto)) return [];
  return [...texto.matchAll(/\bformat\(([^;]*?)['"`]([^'"`]*)['"`]\s*(,\s*\{[^}]*\})?\s*\)/g)]
    .filter((m) => /MMM|LLL|EEE|eee|ccc|PP/.test(m[2]) && !/\blocale\b/.test(m[3] ?? ''))
    .map((m) => m.index!);
}

describe('cifras y fechas en es-CL', () => {
  it('recorre los fuentes (guarda contra comprobar el vacío)', () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100);
  });

  it('ningún toLocale*String ni Intl.* sin es-CL', () => {
    const malos = ARCHIVOS.flatMap((ruta) => {
      const texto = readFileSync(ruta, 'utf8');
      return sinLocale(texto)
        .filter((h) => !(`${rel(ruta)}:${h.que}` in PERMITIDOS))
        .map((h) => `${rel(ruta)}:${linea(texto, h.indice)} ${h.que}`);
    });
    expect(malos, "escribe el locale: toLocaleString('es-CL')").toEqual([]);
  });

  it('ningún format de date-fns con nombres de mes o de día sin locale', () => {
    const malos = ARCHIVOS.flatMap((ruta) => {
      const texto = readFileSync(ruta, 'utf8');
      return fechasEnIngles(texto).map((i) => `${rel(ruta)}:${linea(texto, i)}`);
    });
    expect(malos, "añade { locale: es } (import es from 'date-fns/locale/es')").toEqual([]);
  });

  it('los detectores ven lo que tienen que ver', () => {
    expect(sinLocale('{total.toLocaleString()}')).toHaveLength(1);
    expect(sinLocale("{total.toLocaleString('en-US')}")).toHaveLength(1);
    expect(sinLocale("{total.toLocaleString('es-CL')}")).toHaveLength(0);
    expect(sinLocale('new Intl.NumberFormat(undefined, {})')).toHaveLength(1);
    expect(sinLocale("new Intl.NumberFormat('es-CL', {})")).toHaveLength(0);
    const conImport = "import { format } from 'date-fns';\n";
    expect(fechasEnIngles(`${conImport}format(new Date(x), 'dd MMM yy')`)).toHaveLength(1);
    expect(fechasEnIngles(`${conImport}format(new Date(x), 'd MMM yyyy', { locale: es })`)).toHaveLength(0);
    expect(fechasEnIngles(`${conImport}format(new Date(x), 'yyyy-MM-dd')`)).toHaveLength(0);
  });

  it('la excepción sigue existiendo (si se fue, sale de la lista)', () => {
    for (const clave of Object.keys(PERMITIDOS)) {
      const [fichero, que] = clave.split(':');
      const texto = readFileSync(join(RAIZ, fichero), 'utf8');
      expect(sinLocale(texto).some((h) => h.que === que), clave).toBe(true);
    }
  });
});

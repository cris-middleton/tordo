import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Ninguna cifra llega a la vista por `.toFixed(`.
 *
 * `toFixed` escribe siempre con punto decimal: «0.9/10», «6.6», «CLP 1.5M». El
 * resto del sitio formatea con `es-CL` («6,6»), así que una misma pantalla
 * mezclaba las dos notaciones — y en Chile «1.5» se lee como mil quinientos.
 * Había 76 llamadas repartidas por componentes y pantallas; ahora todas pasan
 * por `decimal()` de `lib/formato.ts`.
 *
 * Esto falla si aparece una nueva. Si de verdad hace falta `toFixed` para algo
 * que NO se muestra (una clave, un valor que va a la API, CSS), añade el
 * fichero a `PERMITIDOS` con el motivo; para redondear un número, mejor
 * `Math.round(v * 10) / 10`, que no pasa por texto.
 */

const RAIZ = join(__dirname, '..');
const CARPETAS = ['app', 'components', 'lib'];

/** Fichero (relativo a frontend/) → por qué puede usar `toFixed`. */
const PERMITIDOS: Record<string, string> = {};

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.(ts|tsx)$/.test(ruta)) salida.push(ruta);
  }
  return salida;
}

describe('sin toFixed en la vista', () => {
  const archivos = CARPETAS.flatMap((c) => fuentes(join(RAIZ, c)));

  it('recorre los fuentes (guarda contra comprobar el vacío)', () => {
    expect(archivos.length).toBeGreaterThan(50);
  });

  it('ningún .toFixed( fuera de la lista de permitidos', () => {
    const hallazgos = archivos.flatMap((ruta) => {
      const rel = relative(RAIZ, ruta);
      if (rel in PERMITIDOS) return [];
      return readFileSync(ruta, 'utf8')
        .split('\n')
        .flatMap((linea, i) => (linea.includes('.toFixed(') ? [`${rel}:${i + 1}`] : []));
    });
    expect(hallazgos, 'usa decimal() de lib/formato.ts').toEqual([]);
  });
});

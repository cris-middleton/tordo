/**
 * Un solo formato de montos en todo el sitio: `monto()` (`lib/formato.ts`) —
 * «$825.000», «$7,2 millones», «$1,5 mil millones»— o `plata()` en las bandas de
 * precio. Convivían «$825K», «$7,2M», «$1,5B» (en Chile un billón es 10¹²),
 * «CLP 42,1 billones» y hasta «$1.000K», cada uno armado a mano en su fichero.
 * Este test falla si alguien vuelve a escribir un sufijo K/M/B o un «CLP » en una
 * plantilla.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    if (statSync(r).isDirectory()) return fuentes(r);
    return /\.tsx?$/.test(r) && !/\.test\.tsx?$/.test(r) ? [r] : [];
  });
}

const ARCHIVOS = ['app', 'components', 'lib'].flatMap((d) => fuentes(join(RAIZ, d)));
/** Un `}K`, `}M`, `}B`, `} MM` o `} mil M` justo antes del cierre de la plantilla, o un «CLP ${». */
const MONTO_A_MANO = /\}\s?(?:K|M|B|MM|mil M)`|CLP \$\{/;

describe('montos', () => {
  it('recorre el código (guarda contra comprobar el vacío)', () => {
    expect(ARCHIVOS.length).toBeGreaterThan(50);
  });

  it('ningún monto armado a mano con K, M, B o «CLP»: se usa monto() o plata()', () => {
    const fuera = ARCHIVOS.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((linea, i) => (MONTO_A_MANO.test(linea) ? [`${relative(RAIZ, f)}:${i + 1}`] : [])),
    );
    expect(fuera).toEqual([]);
  });
});

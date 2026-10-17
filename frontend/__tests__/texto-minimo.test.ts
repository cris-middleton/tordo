/**
 * Ningún texto de menos de 12 px (`text-xs`).
 *
 * El detector de Impeccable (`make diseno`) marcó en el render las insignias de
 * 10 px de la ficha de producto y las fechas de 11 px de las tarjetas de
 * `/licitaciones`; quedaban también en `/mercado` y en el panel de la
 * licitación. La Royal Statistical Society pide 12 como mínimo en la web y
 * Datawrapper «más de 12 px» (docs/GUIA_GRAFICOS.md). Lo chico se resuelve con
 * menos texto, no con letra más chica.
 *
 * Mira las clases arbitrarias de Tailwind (`text-[11px]`, `text-[0.6rem]`) en
 * `app/` y `components/`. Los `fontSize` de Recharts en `/mercado` son deuda de
 * la guía de gráficos y no se miran aquí.
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
const MINIMO_PX = 12;
const TAMANO = /text-\[(\d+(?:\.\d+)?)(px|rem)\]/g;

function chicos(texto: string): string[] {
  return [...texto.matchAll(TAMANO)]
    .filter((m) => (m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])) < MINIMO_PX)
    .map((m) => m[0]);
}

describe('texto de 12 px como mínimo', () => {
  it('recorre los fuentes (guarda contra comprobar el vacío)', () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100);
  });

  it('ninguna clase de tamaño arbitrario bajo 12 px en app/ ni components/', () => {
    const hallazgos = ARCHIVOS.flatMap((ruta) =>
      readFileSync(ruta, 'utf8')
        .split('\n')
        .flatMap((linea, i) => chicos(linea).map((c) => `${relative(RAIZ, ruta)}:${i + 1} ${c}`)),
    );
    expect(hallazgos).toEqual([]);
  });

  it('el patrón detecta lo que tiene que detectar', () => {
    expect(chicos('text-[11px] text-[0.6rem]')).toEqual(['text-[11px]', 'text-[0.6rem]']);
    expect(chicos('text-[12px] text-[0.95rem] text-xs')).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La tipografía del rediseño (docs/REDISENO_PUBLICO_2026-10.md §5.1), fijada:
 *
 * - **Newsreader** (`--font-display`, `font-display`) sólo para titulares
 *   editoriales: `h1` y `h2`. **Nunca un número.**
 * - **Public Sans** (`--font-sans`, `font-sans`) para todo lo demás, `h3`–`h6` y
 *   todas las cifras: `.cifra` va sobre ella con `tnum`.
 * - **IBM Plex Mono** (`--font-mono`, `font-mono`) sólo para identificadores,
 *   cargada en 400 y 500.
 *
 * Lo que se rompe sin que falle nada más: un precio en serif (`cifra` junto a
 * `font-display`, o un `fontFamily` en línea que le gana a `.cifra`), los
 * subtítulos en serif (una regla o una clase que alcance a `h3`), los ejes de
 * los gráficos en serif y una negrita sintética en mono (600 no está cargado).
 * El navegador lo comprueba además en `e2e/tipografia.spec.ts`.
 */

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const layout = leer('app/layout.tsx');
const css = sinComentarios(leer('app/globals.css'));

/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function regla(selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[\\n}])\\s*${escapado}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`globals.css no tiene la regla «${selector}»`);
  return m[1];
}

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (ruta.endsWith('.tsx')) salida.push(ruta);
  }
  return salida;
}

const FUENTES = ['app', 'components'].flatMap((c) => archivosTsx(join(RAIZ, c)));

describe('familias tipográficas', () => {
  it('layout.tsx carga Newsreader, Public Sans e IBM Plex Mono con sus tres variables', () => {
    expect(layout).toMatch(/import\s*\{[^}]*\bNewsreader\b[^}]*\}\s*from\s*'next\/font\/google'/);
    expect(layout).toMatch(/import\s*\{[^}]*\bPublic_Sans\b[^}]*\}\s*from\s*'next\/font\/google'/);
    expect(layout).toMatch(/import\s*\{[^}]*\bIBM_Plex_Mono\b[^}]*\}\s*from\s*'next\/font\/google'/);
    for (const variable of ['--font-display', '--font-sans', '--font-mono']) {
      expect(layout).toContain(`variable: '${variable}'`);
    }
    expect(layout).not.toMatch(/\bArchivo\b|\bDM_Sans\b|--font-dm-sans/);
  });

  it('Newsreader lleva el eje óptico; Plex Mono, sólo 400 y 500', () => {
    expect(layout).toMatch(/Newsreader\(\{[^}]*axes:\s*\['opsz'\]/);
    expect(layout).toMatch(/IBM_Plex_Mono\(\{[^}]*weight:\s*\['400',\s*'500'\]/);
  });

  it('tailwind: sans, display y mono salen de las tres variables', () => {
    const config = createRequire(__filename)(join(RAIZ, 'tailwind.config.js'));
    const familias = config.theme.extend.fontFamily;
    expect(familias.sans[0]).toBe('var(--font-sans)');
    expect(familias.display[0]).toBe('var(--font-display)');
    expect(familias.mono[0]).toBe('var(--font-mono)');
  });

  it('ningún sitio nombra la variable vieja de DM Sans', () => {
    const infractores = [join(RAIZ, 'app', 'globals.css'), ...FUENTES]
      .filter((f) => readFileSync(f, 'utf8').includes('--font-dm-sans'))
      .map((f) => relative(RAIZ, f));
    expect(infractores).toEqual([]);
  });
});

describe('titulares: serif sólo en h1 y h2', () => {
  it('la regla base aplica font-display a h1 y h2, y a nada más', () => {
    const selectores = [...css.matchAll(/([^{}]+)\{[^}]*@apply[^;}]*\bfont-display\b/g)].map((m) =>
      m[1].trim().replace(/\s+/g, ' '),
    );
    // `.section-title` y `.page-title` NO: van en h1/h2 (que ya son serif) y en
    // h3 (BuyerProfilePanel, CompetitorsList…), que tienen que quedar en sans.
    expect(selectores).toEqual(['h1, h2']);
  });

  it('ninguna regla del CSS pide un rasgo OpenType que las fuentes no traen', () => {
    // Medido con fontTools sobre los woff2 latinos de Google Fonts (2026-10-14):
    // ni Newsreader ni Public Sans traen ss01 ni cv02–cv11 (Archivo y DM Sans
    // tampoco: esas dos líneas no hacían nada).
    expect(css).not.toMatch(/"ss0\d"|"cv\d\d"/);
  });
});

describe('cifras: Public Sans con tnum', () => {
  it('.cifra va sobre --font-sans con cifras tabulares', () => {
    const cuerpo = regla('.cifra');
    expect(cuerpo).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(cuerpo).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(cuerpo).toMatch(/font-feature-settings:\s*"tnum"/);
  });

  it('los ejes de Recharts van en sans, con tnum', () => {
    const cuerpo = regla('.recharts-cartesian-axis-tick text');
    expect(cuerpo).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(cuerpo).toMatch(/"tnum"/);
  });
});

/** Cada literal de `className` (comillas, comillas simples o plantilla), con su fichero y línea. */
function clases(): { donde: string; valor: string }[] {
  const salida: { donde: string; valor: string }[] = [];
  for (const archivo of FUENTES) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
      const linea = texto.slice(0, m.index).split('\n').length;
      salida.push({ donde: `${relative(RAIZ, archivo)}:${linea}`, valor: m[1] ?? m[2] ?? m[3] });
    }
  }
  return salida;
}

const tiene = (valor: string, clase: string) => new RegExp(`(^|\\s)${clase}(\\s|$)`).test(valor);

describe('cifras y titulares en los componentes', () => {
  it('guarda: el recorrido encuentra los className del proyecto', () => {
    // Sin esta guarda, un cambio en la expresión regular dejaría los tests de
    // abajo comprobando una lista vacía. Medido el 2026-10-14: 1.172.
    expect(clases().length).toBeGreaterThan(500);
  });

  it('nunca cifra y font-display en el mismo className', () => {
    const infractores = clases()
      .filter((c) => tiene(c.valor, 'cifra') && tiene(c.valor, 'font-display'))
      .map((c) => c.donde);
    expect(infractores, `font-display es «titular editorial», nunca número:\n  ${infractores.join('\n  ')}`).toEqual([]);
  });

  it('ninguna familia en línea: un style={{ fontFamily }} le gana a cualquier clase', () => {
    const infractores = FUENTES.filter((f) => /fontFamily:\s*['"`]var\(--font-/.test(readFileSync(f, 'utf8'))).map(
      (f) => relative(RAIZ, f),
    );
    expect(infractores, `Usa font-display / font-sans / cifra en className:\n  ${infractores.join('\n  ')}`).toEqual([]);
  });
});

describe('identificadores en mono', () => {
  it('nunca cifra y font-mono en el mismo className: un monto en mono parece un log', () => {
    const infractores = clases()
      .filter((c) => tiene(c.valor, 'cifra') && tiene(c.valor, 'font-mono'))
      .map((c) => c.donde);
    expect(infractores).toEqual([]);
  });

  it('font-mono nunca con negrita: Plex Mono está cargada en 400 y 500, y 600+ sale sintética', () => {
    const infractores = clases()
      .filter((c) => tiene(c.valor, 'font-mono') && /(^|\s)font-(semibold|bold|extrabold|black)(\s|$)/.test(c.valor))
      .map((c) => c.donde);
    expect(infractores, `Usa font-medium como mucho:\n  ${infractores.join('\n  ')}`).toEqual([]);
  });

  it('el listado muestra el código en mono cuando cae al código por falta de organismo', () => {
    const pagina = leer('app/(panel)/licitaciones/page.tsx');
    expect(pagina).toMatch(
      /nombre_organismo \?\? \(\s*<span className="font-mono">\{selectedTender\.codigo_externo\}<\/span>/,
    );
  });
});

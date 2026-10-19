import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La tipografía de la identidad (docs/IDENTIDAD_Y_PORTADA_2026-10.md §4), fijada:
 *
 * - **Archivo** (`--font-sans`) para todo. Los titulares —`h1`, `h2` y la clase
 *   `font-display`— van semiexpandidos (`font-stretch: 112.5%`) y en 800; el resto, a
 *   ancho normal. **Nunca un número en `font-display`.**
 * - **IBM Plex Mono** (`--font-mono`, `font-mono`) sólo para identificadores,
 *   cargada en 400 y 500.
 * - **Varien**, sólo la marca (sin cambio, `@font-face` propio).
 *
 * Lo que se rompe sin que falle nada más: un precio semiexpandido (`cifra` junto a
 * `font-display`, o un `fontFamily` en línea que le gana a `.cifra`), un titular que
 * vuelve a 700 porque alguien le puso `font-bold`, una etiqueta en un h2 que sale
 * expandida, y una negrita sintética en mono (600 no está cargado). El navegador lo
 * comprueba además en `e2e/tipografia.spec.ts`.
 */

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const layout = leer('app/layout.tsx');
const css = sinComentarios(leer('app/globals.css'));

/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function regla(selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[\\n{}])\\s*${escapado}\\s*\\{([^}]*)\\}`));
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
  it('layout.tsx carga Archivo (con el eje de ancho) e IBM Plex Mono, y nada más', () => {
    expect(layout).toMatch(/import\s*\{\s*Archivo,\s*IBM_Plex_Mono\s*\}\s*from\s*'next\/font\/google'/);
    expect(layout).toMatch(/Archivo\(\{[^}]*variable:\s*'--font-sans'/);
    expect(layout).toMatch(/Archivo\(\{[^}]*axes:\s*\['wdth'\]/);
    expect(layout).toMatch(/IBM_Plex_Mono\(\{[^}]*variable:\s*'--font-mono'/);
    expect(layout).toMatch(/IBM_Plex_Mono\(\{[^}]*weight:\s*\['400',\s*'500'\]/);
  });

  it('se fueron Newsreader, Public Sans, DM Sans y la variable --font-display', () => {
    expect(layout).not.toMatch(/\bNewsreader\b|\bPublic_Sans\b|\bDM_Sans\b|--font-display|--font-dm-sans/);
    const infractores = [join(RAIZ, 'app', 'globals.css'), join(RAIZ, 'tailwind.config.js'), ...FUENTES]
      .filter((f) => /Newsreader|Public Sans|--font-display|--font-dm-sans/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RAIZ, f));
    expect(infractores).toEqual([]);
  });

  it('tailwind: sans y display son la misma familia (Archivo); mono, Plex Mono', () => {
    const config = createRequire(__filename)(join(RAIZ, 'tailwind.config.js'));
    const familias = config.theme.extend.fontFamily;
    expect(familias.sans[0]).toBe('var(--font-sans)');
    expect(familias.display[0]).toBe('var(--font-sans)');
    expect(familias.mono[0]).toBe('var(--font-mono)');
    expect(familias.display).not.toContain('serif');
  });
});

describe('titulares: h1 y h2 semiexpandidos y en 800', () => {
  it('font-display fija el ancho (112,5 %) y el peso (800); font-sans vuelve al ancho normal', () => {
    expect(regla('.font-display')).toMatch(/font-stretch:\s*112\.5%/);
    expect(regla('.font-display')).toMatch(/font-weight:\s*800/);
    expect(regla('.font-sans')).toMatch(/font-stretch:\s*100%/);
  });

  it('la regla base aplica font-display a h1 y h2, y a nada más', () => {
    const selectores = [...css.matchAll(/([^{}]+)\{[^}]*@apply[^;}]*\bfont-display\b/g)].map((m) =>
      m[1].trim().replace(/\s+/g, ' '),
    );
    // `.section-title` y `.page-title` NO: van en h1/h2 (que ya son titulares) y en
    // h3 (BuyerProfilePanel, CompetitorsList…), que tienen que quedar a ancho normal.
    expect(selectores).toEqual(['h1, h2']);
  });

  it('.page-title no fija peso (va en h1) y .section-title sube a 800 sólo en un h2', () => {
    expect(regla('.page-title')).not.toMatch(/\bfont-(thin|light|normal|medium|semibold|bold)\b/);
    expect(regla('h2.section-title')).toMatch(/@apply\s+font-extrabold/);
  });

  it('ningún h1/h2 baja de 800 con una clase de peso, salvo que declare que no es titular', () => {
    // Un `font-bold` en el elemento le gana a la regla base: el titular sale en 700.
    // Las excepciones se declaran con la familia: `font-mono` (un código como título)
    // o `font-sans` (una etiqueta, como «Fuentes» en una guía).
    const infractores: string[] = [];
    let titulares = 0;
    for (const archivo of FUENTES) {
      const texto = readFileSync(archivo, 'utf8');
      for (const m of texto.matchAll(/<h[12]\b([^>]*)>/g)) {
        titulares++;
        const clase = m[1].match(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
        const valor = clase ? (clase[1] ?? clase[2] ?? clase[3]) : '';
        const conPeso = /(^|\s)font-(thin|extralight|light|normal|medium|semibold|bold|black)(\s|$)/.test(valor);
        const declarado = /(^|\s)font-(mono|sans)(\s|$)/.test(valor);
        if (conPeso && !declarado) {
          infractores.push(`${relative(RAIZ, archivo)}:${texto.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    // Guarda: sin titulares encontrados, el test comprobaría el vacío. Medido el 2026-10-15: 56.
    expect(titulares).toBeGreaterThan(40);
    expect(infractores, `Quita la clase de peso del titular (ya es 800):\n  ${infractores.join('\n  ')}`).toEqual([]);
  });

  it('ninguna regla del CSS pide un rasgo OpenType que las fuentes no traen', () => {
    expect(css).not.toMatch(/"ss0\d"|"cv\d\d"/);
  });
});

describe('cifras: Archivo con tnum', () => {
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
    expect(infractores, `font-display es «titular», nunca número:\n  ${infractores.join('\n  ')}`).toEqual([]);
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

  it('cada fila del listado muestra el código en mono', () => {
    const fila = leer('components/licitacion/FilaLicitacion.tsx');
    expect(fila).toMatch(/<span className="font-mono[^"]*">\{tender\.codigo_externo\}<\/span>/);
  });
});

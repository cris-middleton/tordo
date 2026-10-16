import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COLORES_IMAGEN, PARES_IMAGEN } from '@/lib/coloresImagen';

/**
 * Contraste WCAG 2.x de la paleta, leído de los tokens de `app/globals.css`.
 *
 * Los pares se comprobaban a mano —«166 pares verificados»— y una comprobación a
 * mano no se repite cuando alguien toca un token. Ya pasó: `.alert-info` quedó en
 * 1.05:1 en tema claro por cambiar un valor a ojo, y el error era invisible en el
 * tema que se revisa por defecto. Este test lee los dos temas del CSS real, así
 * que un token nuevo o un valor cambiado se comprueba solo.
 *
 * Los pares se declaran por lo que el token SIGNIFICA, no por cada combinación
 * que aparece en un componente:
 *
 * - toda tinta de texto sobre toda superficie neutra (fondo, tarjeta y elevada);
 * - cada etiqueta `on-*` sobre su relleno, y sobre el hover del relleno;
 * - cada tinta semántica sobre su superficie tenue (`.alert-*`, `.badge-*`), y el
 *   texto normal y el apagado sobre esas mismas superficies (`.card-accent`);
 * - el borde de un control contra las superficies donde se pinta un control
 *   (WCAG 1.4.11, 3:1);
 * - `.badge-primary`: la tinta primaria sobre su propio relleno al 10 %;
 * - la tarjeta de vista previa (`app/opengraph-image.tsx`): los pares de texto
 *   sobre fondo que declara `PARES_IMAGEN` en `lib/coloresImagen.ts` (la marca y el
 *   dominio sobre el panel `brand-blue`, el titular sobre el lienzo, la píldora).
 *   Se dibuja sin CSS y copia los tokens (`colores-imagen.test.ts` vigila la
 *   copia); su contraste se mide aquí.
 *
 * Umbrales AA: 4,5:1 texto normal; 3:1 texto grande (≥ 24 px, o ≥ 18,66 px en
 * negrita) y límites de controles.
 *
 * **Un token de color nuevo hace fallar el test** hasta que alguien decida sus
 * pares o lo declare decorativo en `SIN_PAR`, con su motivo.
 */

const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

type Rgb = [number, number, number];
type Tokens = Record<string, Rgb>;

function bloqueDe(selector: ':root' | '.dark'): string {
  const escapado = selector.replace('.', '\\.');
  const bloque = css.match(new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`));
  if (!bloque) throw new Error(`globals.css no tiene un bloque ${selector} de primer nivel`);
  return bloque[1];
}

/** Los `--color-x: R G B;` de un bloque de primer nivel (`:root` o `.dark`). */
function tokensDe(selector: ':root' | '.dark'): Tokens {
  const tokens: Tokens = {};
  for (const m of bloqueDe(selector).matchAll(/--color-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return tokens;
}

/** TODA declaración `--color-x: valor;` de un bloque, con su valor literal. */
function declaracionesDe(selector: ':root' | '.dark'): Record<string, string> {
  const decl: Record<string, string> = {};
  for (const m of bloqueDe(selector).matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    decl[m[1]] = m[2].trim();
  }
  return decl;
}

const CLARO = tokensDe(':root');
// `.dark` hereda de `:root` lo que no redefine, como en el navegador.
const OSCURO = { ...CLARO, ...tokensDe('.dark') };

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa, WCAG 2.x. */
function luminancia([r, g, b]: Rgb): number {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: Rgb, b: Rgb): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** `color` con opacidad `alfa` pintado sobre `base` (lo que hace `bg-primary/10`). */
function sobre(color: Rgb, alfa: number, base: Rgb): Rgb {
  return color.map((c, i) => Math.round(c * alfa + base[i] * (1 - alfa))) as Rgb;
}

type Uso = 'texto' | 'texto-grande' | 'borde-control';
const UMBRAL: Record<Uso, number> = { texto: 4.5, 'texto-grande': 3, 'borde-control': 3 };

interface Par {
  tema: 'claro' | 'oscuro';
  tinta: string;
  fondo: string;
  uso: Uso;
  /** Opacidad del fondo sobre `base` (p. ej. `bg-primary/10`). */
  alfa?: { valor: number; base: string };
}

const TINTAS = ['text', 'muted', 'subtle', 'primary', 'accent', 'gold', 'info', 'danger', 'warning', 'success', 'dato'];
const NEUTRAS = ['background', 'surface', 'surface-elevated'];
const RELLENOS = ['primary', 'accent', 'success', 'danger', 'warning', 'gold', 'info', 'dato'];
const TENUES = ['accent', 'gold', 'info', 'danger', 'warning', 'success'];

function paresDelTema(tema: 'claro' | 'oscuro'): Par[] {
  const pares: Par[] = [];
  for (const tinta of TINTAS) for (const fondo of NEUTRAS) pares.push({ tema, tinta, fondo, uso: 'texto' });
  for (const r of RELLENOS) pares.push({ tema, tinta: `on-${r}`, fondo: r, uso: 'texto' });
  pares.push({ tema, tinta: 'on-primary', fondo: 'primary-dark', uso: 'texto' });
  pares.push({ tema, tinta: 'on-accent', fondo: 'accent-dark', uso: 'texto' });
  for (const t of TENUES) {
    pares.push({ tema, tinta: t, fondo: `${t}-light`, uso: 'texto' });
    pares.push({ tema, tinta: 'text', fondo: `${t}-light`, uso: 'texto' });
    pares.push({ tema, tinta: 'muted', fondo: `${t}-light`, uso: 'texto' });
  }
  for (const fondo of ['background', 'surface']) {
    pares.push({ tema, tinta: 'border-input', fondo, uso: 'borde-control' });
    pares.push({ tema, tinta: 'primary', fondo: 'primary', uso: 'texto', alfa: { valor: 0.1, base: fondo } });
  }
  return pares;
}

const sinPrefijo = (token: string) => token.replace(/^--color-/, '');

/**
 * Los pares de la tarjeta de vista previa, DERIVADOS de `PARES_IMAGEN` y no
 * copiados: tinta y fondo salen del token que la tarjeta declara, y el tema es
 * aquel donde LOS DOS tokens valen lo que la tarjeta pinta. Si alguien cambia un
 * color o un token allí, el par cambia con él y el test lo mide (o falla, en el
 * test «cada par de la tarjeta…»), en vez de seguir midiendo una copia vieja.
 * `brand-navy` y `brand-blue` son invariantes de tema.
 */
const PARES_TARJETA: Par[] = PARES_IMAGEN.map(({ tinta, fondo }) => {
  const t = COLORES_IMAGEN[tinta];
  const f = COLORES_IMAGEN[fondo];
  const vale = (tema: Tokens, c: { token: string; rgb: string }) => tema[sinPrefijo(c.token)]?.join(' ') === c.rgb;
  return {
    tema: vale(CLARO, t) && vale(CLARO, f) ? 'claro' : 'oscuro',
    tinta: sinPrefijo(t.token),
    fondo: sinPrefijo(f.token),
    uso: 'texto',
  };
});

/**
 * El panel navy de la portada (identidad §5) se fue con la portada v7 (spec
 * PORTADA_V7 V1): las lecturas van sobre blanco, y sus pares —`dato` sobre la
 * superficie— ya están entre los del tema. Ninguna superficie del sitio pinta
 * texto sobre `brand-navy`; lo que queda de navy es la marca y la tarjeta de
 * vista previa, cuyos pares son los de `PARES_IMAGEN`.
 */
const PARES: Par[] = [...paresDelTema('claro'), ...paresDelTema('oscuro'), ...PARES_TARJETA];

/** Tokens de color que no van en ningún par, y por qué. */
const SIN_PAR: Record<string, string> = {
  border: 'decorativo: tarjetas y divisores, sin requisito de contraste (WCAG 1.4.11 no aplica)',
  'border-light': 'decorativo, como border',
  'dato-tenue': 'decorativo: la parte de un gráfico que la conclusión no nombra; nunca lleva texto encima y el valor va escrito al lado',
  'brand-teal': 'decorativo: el ala del pájaro de la cabecera; ni es texto ni lleva texto encima',
};

/**
 * Declaraciones `--color-*` que NO son un triplete `R G B` y por tanto no entran en
 * los pares. Todas se declaran aquí: una que se reescribe de triplete a hex (o a
 * `16, 40, 88`) saldría del recorrido sin avisar.
 */
const FUERA_DE_ALCANCE: Record<string, string> = {
  scrollbar: 'decorativo: barra de desplazamiento del navegador',
  'scrollbar-hover': 'decorativo: barra de desplazamiento del navegador',
};

/** Copias hex de un token triplete, usadas en estilos en línea (donde no hay `rgb(var())`). */
const GEMELOS_HEX: Record<string, string> = {
  'border-hex': 'border',
  'surface-elevated-hex': 'surface-elevated',
  'text-hex': 'text',
};

function aHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function paleta(tema: Par['tema']): Tokens {
  return tema === 'claro' ? CLARO : OSCURO;
}

describe('contraste WCAG AA de los tokens de color', () => {
  it('lee los dos temas (guarda: sin tokens, el test no comprobaría nada)', () => {
    // 36 por tema desde la identidad de octubre (dato, dato-tenue, on-dato, brand-teal).
    expect(Object.keys(CLARO).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(tokensDe('.dark')).length).toBeGreaterThanOrEqual(30);
  });

  it('declara todos los pares (guarda: un recorrido vacío pasa siempre)', () => {
    // 2 temas × (33 tinta/neutra + 10 on-* + 18 tenues + 2 bordes + 2 badge) + 4 de la tarjeta.
    expect(PARES).toHaveLength(134);
  });

  it('cada par de la tarjeta mide el color que la tarjeta pinta, en el tema donde ese token lo vale', () => {
    expect(PARES_TARJETA).toHaveLength(4);
    PARES_TARJETA.forEach((p, i) => {
      const { tinta, fondo } = PARES_IMAGEN[i];
      expect(paleta(p.tema)[p.tinta]?.join(' '), `tinta ${tinta}`).toBe(COLORES_IMAGEN[tinta].rgb);
      expect(paleta(p.tema)[p.fondo]?.join(' '), `fondo ${fondo}`).toBe(COLORES_IMAGEN[fondo].rgb);
    });
  });

  it('cada token de los pares existe en su tema', () => {
    const faltan = PARES.flatMap((p) =>
      [p.tinta, p.fondo, p.alfa?.base]
        .filter((t): t is string => Boolean(t) && !(t! in paleta(p.tema)))
        .map((t) => `${p.tema}: --color-${t}`),
    );
    expect(faltan, `Tokens que no existen (un par con un token inexistente daría NaN y pasaría):\n  ${faltan.join('\n  ')}`).toEqual([]);
  });

  it('todo token de color está en algún par o declarado decorativo', () => {
    const usados = new Set(PARES.flatMap((p) => [p.tinta, p.fondo]));
    const sueltos = Object.keys(CLARO).filter((t) => !usados.has(t) && !(t in SIN_PAR));
    expect(sueltos, `Token sin par de contraste: decide sus pares o decláralo en SIN_PAR:\n  ${sueltos.join('\n  ')}`).toEqual([]);
  });

  it('todos los pares pasan AA en los dos temas', () => {
    const fallos = PARES.flatMap((p) => {
      const t = paleta(p.tema);
      const fondo = p.alfa ? sobre(t[p.fondo], p.alfa.valor, t[p.alfa.base]) : t[p.fondo];
      const r = contraste(t[p.tinta], fondo);
      const fondoTexto = p.alfa ? `${p.fondo}/${p.alfa.valor * 100} sobre ${p.alfa.base}` : p.fondo;
      return r < UMBRAL[p.uso]
        ? [`${p.tema}: ${p.tinta} sobre ${fondoTexto} = ${r.toFixed(2)}:1 (mínimo ${UMBRAL[p.uso]}:1, ${p.uso})`]
        : [];
    });
    expect(fallos, `Pares bajo AA:\n  ${fallos.join('\n  ')}`).toEqual([]);
  });

  it('sin las bandas de la portada vieja (spec §5.2): ni tokens ni utilidades', () => {
    const bandas = (['claro', 'oscuro'] as const).flatMap((tema) =>
      Object.keys(declaracionesDe(tema === 'claro' ? ':root' : '.dark'))
        .filter((t) => t.startsWith('band-'))
        .map((t) => `${tema}: --color-${t}`),
    );
    expect(bandas).toEqual([]);
    const tailwind = readFileSync(join(__dirname, '..', 'tailwind.config.js'), 'utf8');
    expect(tailwind).not.toMatch(/\bband[1-4]\b|--color-band-/);
  });

  it('toda declaración --color-* es un triplete parseado o está en FUERA_DE_ALCANCE / GEMELOS_HEX', () => {
    const sueltas = (['claro', 'oscuro'] as const).flatMap((tema) => {
      const decl = declaracionesDe(tema === 'claro' ? ':root' : '.dark');
      const parseados = tema === 'claro' ? CLARO : tokensDe('.dark');
      return Object.keys(decl)
        .filter((n) => !(n in parseados) && !(n in FUERA_DE_ALCANCE) && !(n in GEMELOS_HEX))
        .map((n) => `${tema}: --color-${n}: ${decl[n]}`);
    });
    expect(
      sueltas,
      `Declaración que no es «R G B;» y no está declarada fuera de alcance (¿se reescribió un token en hex o con comas?):\n  ${sueltas.join('\n  ')}`,
    ).toEqual([]);
  });

  it('cada copia -hex coincide con su triplete, en los dos temas', () => {
    const difieren = (['claro', 'oscuro'] as const).flatMap((tema) => {
      const decl = declaracionesDe(tema === 'claro' ? ':root' : '.dark');
      const paletaTema = paleta(tema);
      return Object.entries(GEMELOS_HEX).flatMap(([hex, token]) => {
        if (!(hex in decl)) return [`${tema}: --color-${hex} no está declarado`];
        const esperado = aHex(paletaTema[token]);
        return decl[hex].toUpperCase() === esperado
          ? []
          : [`${tema}: --color-${hex} = ${decl[hex]}, pero --color-${token} es ${esperado}`];
      });
    });
    expect(difieren, `Copias hex desincronizadas:\n  ${difieren.join('\n  ')}`).toEqual([]);
  });
});

/** Cada literal de texto ("…", '…' o `…`) de los .tsx de `dir`, con su fichero y línea. */
function literales(dir: string): { donde: string; valor: string }[] {
  const salida: { donde: string; valor: string }[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...literales(ruta));
      continue;
    }
    if (!ruta.endsWith('.tsx')) continue;
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      const donde = `${relative(join(__dirname, '..'), ruta)}:${texto.slice(0, m.index).split('\n').length}`;
      salida.push({ donde, valor: m[1] ?? m[2] ?? m[3] });
    }
  }
  return salida;
}

describe('fondo de página: blanco en tema claro (identidad §5, D3)', () => {
  it('es blanco, como las tarjetas: se separan por su borde', () => {
    expect(CLARO.background).toEqual([255, 255, 255]);
    expect(CLARO.surface).toEqual(CLARO.background);
  });

  it('el tema oscuro conserva su fondo', () => {
    expect(OSCURO.background).toEqual([8, 11, 17]);
  });

  it('ningún relleno sin borde usa bg-background: en claro ya no se distingue de una tarjeta', () => {
    // El papel cálido marcaba el ítem activo del menú, el selector de tema, el código en
    // línea y los hover de las listas. Sobre blanco, `bg-background` sólo se ve con borde;
    // sin él, `bg-surface-elevated`. El cuerpo de la página es la excepción: ES el fondo.
    const raiz = join(__dirname, '..');
    const todos = [...literales(join(raiz, 'app')), ...literales(join(raiz, 'components'))];
    expect(todos.length, 'guarda: el recorrido no encontró literales').toBeGreaterThan(1000);
    const infractores = todos
      .filter((l) => /(^|[\s:])bg-background\b/.test(l.valor) && !/\bborder\b|\bborder-/.test(l.valor))
      .filter((l) => !l.donde.startsWith('app/layout.tsx:'))
      .map((l) => `${l.donde}  «${l.valor.trim()}»`);
    expect(infractores, `Usa bg-surface-elevated (o pon un borde):\n  ${infractores.join('\n  ')}`).toEqual([]);
  });
});

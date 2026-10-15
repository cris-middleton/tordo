import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
 * - toda tinta de texto sobre toda superficie neutra (fondo, tarjeta, elevada y
 *   las cuatro bandas de la portada);
 * - cada etiqueta `on-*` sobre su relleno, y sobre el hover del relleno;
 * - cada tinta semántica sobre su superficie tenue (`.alert-*`, `.badge-*`), y el
 *   texto normal y el apagado sobre esas mismas superficies (`.card-accent`);
 * - el borde de un control contra las superficies donde se pinta un control
 *   (WCAG 1.4.11, 3:1);
 * - `.badge-primary`: la tinta primaria sobre su propio relleno al 10 %;
 * - el hero de la portada: tokens del tema oscuro sobre `brand-navy` (la clase
 *   `dark` invierte los tokens dentro). Se va con el hero (PR 6 del rediseño).
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
  tema: 'claro' | 'oscuro' | 'hero';
  tinta: string;
  fondo: string;
  uso: Uso;
  /** Opacidad del fondo sobre `base` (p. ej. `bg-primary/10`). */
  alfa?: { valor: number; base: string };
}

const TINTAS = ['text', 'muted', 'subtle', 'primary', 'accent', 'gold', 'info', 'danger', 'warning', 'success'];
const NEUTRAS = ['background', 'surface', 'surface-elevated', 'band-1', 'band-2', 'band-3', 'band-4'];
const RELLENOS = ['primary', 'accent', 'success', 'danger', 'warning', 'gold', 'info'];
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

const PARES: Par[] = [
  ...paresDelTema('claro'),
  ...paresDelTema('oscuro'),
  // El hero: `dark bg-brand-navy`. Sólo las tintas que de verdad lleva.
  ...['text', 'muted', 'accent'].map((tinta): Par => ({ tema: 'hero', tinta, fondo: 'brand-navy', uso: 'texto' })),
];

/** Tokens de color que no van en ningún par, y por qué. */
const SIN_PAR: Record<string, string> = {
  border: 'decorativo: tarjetas y divisores, sin requisito de contraste (WCAG 1.4.11 no aplica)',
  'border-light': 'decorativo, como border',
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
    // 36 por tema el 2026-10-14; 32 cuando PR 6 quite las bandas.
    expect(Object.keys(CLARO).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(tokensDe('.dark')).length).toBeGreaterThanOrEqual(30);
  });

  it('declara todos los pares (guarda: un recorrido vacío pasa siempre)', () => {
    // 2 temas × (70 tinta/neutra + 9 on-* + 18 tenues + 2 bordes + 2 badge) + 3 del hero.
    expect(PARES).toHaveLength(205);
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

describe('fondo de página: papel cálido en tema claro (§5.2 del rediseño)', () => {
  it('es cálido: más rojo que azul', () => {
    const [r, , b] = CLARO.background;
    expect(r - b, `--color-background = ${CLARO.background.join(' ')}`).toBeGreaterThanOrEqual(8);
  });

  it('las tarjetas (surface) se despegan de él', () => {
    // Con el fondo frío anterior daba 1.06:1 y las tarjetas casi no se veían.
    expect(contraste(CLARO.surface, CLARO.background)).toBeGreaterThanOrEqual(1.08);
  });

  it('el tema oscuro conserva su fondo', () => {
    expect(OSCURO.background).toEqual([8, 11, 17]);
  });
});

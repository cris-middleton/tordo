/**
 * Un Markdown mínimo para las guías (`content/explicativos/*.mdx`), **sin
 * dependencias**.
 *
 * Los `.mdx` son Markdown llano: `__tests__/explicativos-frontmatter.test.ts`
 * prohíbe `{` y `<` fuera del código, así que no traen JSX. Compilarlos como MDX
 * de verdad pedía `@next/mdx` + `@mdx-js/loader` + `@mdx-js/react` +
 * `remark-gfm` (por las tablas) + algo para el frontmatter: cinco dependencias
 * y su árbol de `unified`, para ocho textos. Esto cubre exactamente lo que el
 * contenido usa y nada más:
 *
 * - bloques: `##`–`####`, párrafos, listas (`-`/`*` y `1.`, con líneas de
 *   continuación sangradas), cita `>`, código entre ```, tablas `|`;
 * - en línea: `**negrita**`, `*cursiva*`, `` `código` `` y `[texto](destino)`.
 *
 * `#` (h1) **lanza**: el h1 de la página es el título del frontmatter. Y lo que
 * no se reconoce cae en párrafo, así que un marcador sin soporte aparecería
 * tal cual en la página; `__tests__/guias.test.tsx` lo busca en cada guía.
 *
 * Devuelve un árbol, no HTML: lo pinta `components/guias/Markdown.tsx` con
 * React, que escapa el texto. Ningún `dangerouslySetInnerHTML`.
 */

export type EnLinea =
  | { t: 'texto'; v: string }
  | { t: 'codigo'; v: string }
  | { t: 'negrita'; hijos: EnLinea[] }
  | { t: 'cursiva'; hijos: EnLinea[] }
  | { t: 'enlace'; href: string; hijos: EnLinea[] };

export type Bloque =
  | { t: 'titulo'; nivel: 2 | 3 | 4; hijos: EnLinea[] }
  | { t: 'parrafo'; hijos: EnLinea[] }
  | { t: 'lista'; ordenada: boolean; inicio: number; items: EnLinea[][] }
  | { t: 'cita'; hijos: EnLinea[] }
  | { t: 'codigo'; v: string }
  | { t: 'tabla'; cabecera: EnLinea[][]; filas: EnLinea[][][] };

// ── En línea ────────────────────────────────────────────────────────────────

/** En orden de prioridad: el código no se interpreta por dentro. */
const EN_LINEA =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/;

export function enLinea(texto: string): EnLinea[] {
  const salida: EnLinea[] = [];
  let resto = texto;
  while (resto) {
    const m = EN_LINEA.exec(resto);
    if (!m) {
      salida.push({ t: 'texto', v: resto });
      break;
    }
    if (m.index > 0) salida.push({ t: 'texto', v: resto.slice(0, m.index) });
    if (m[1] !== undefined) salida.push({ t: 'codigo', v: m[1] });
    else if (m[2] !== undefined) salida.push({ t: 'enlace', href: m[3], hijos: enLinea(m[2]) });
    else if (m[4] !== undefined) salida.push({ t: 'negrita', hijos: enLinea(m[4]) });
    else salida.push({ t: 'cursiva', hijos: enLinea(m[5]) });
    resto = resto.slice(m.index + m[0].length);
  }
  return salida;
}

// ── Bloques ─────────────────────────────────────────────────────────────────

const ITEM = /^(?:([-*])|(\d+)\.)\s+(.*)$/;
const CONTINUACION = /^\s{2,}\S/;

function celdas(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function bloques(markdown: string): Bloque[] {
  const lineas = markdown.replace(/\r\n/g, '\n').split('\n');
  const salida: Bloque[] = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];

    if (!linea.trim()) {
      i++;
      continue;
    }

    if (linea.startsWith('```')) {
      const codigo: string[] = [];
      i++;
      while (i < lineas.length && !lineas[i].startsWith('```')) codigo.push(lineas[i++]);
      if (i >= lineas.length) throw new Error('bloque de código sin cerrar');
      i++;
      salida.push({ t: 'codigo', v: codigo.join('\n') });
      continue;
    }

    const titulo = linea.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      const nivel = titulo[1].length;
      if (nivel === 1) throw new Error(`un h1 en el cuerpo («${titulo[2]}»): el h1 es el título`);
      if (nivel > 4) throw new Error(`titulo de nivel ${nivel}: se admiten ## a ####`);
      salida.push({ t: 'titulo', nivel: nivel as 2 | 3 | 4, hijos: enLinea(titulo[2].trim()) });
      i++;
      continue;
    }

    if (linea.startsWith('>')) {
      const texto: string[] = [];
      while (i < lineas.length && lineas[i].startsWith('>')) texto.push(lineas[i++].replace(/^>\s?/, ''));
      salida.push({ t: 'cita', hijos: enLinea(texto.join(' ').trim()) });
      continue;
    }

    if (linea.trimStart().startsWith('|')) {
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trimStart().startsWith('|')) filas.push(celdas(lineas[i++]));
      const [cabecera, separador, ...cuerpo] = filas;
      if (!separador || !separador.every((c) => /^:?-{3,}:?$/.test(c))) {
        throw new Error('tabla sin fila separadora |---|');
      }
      salida.push({
        t: 'tabla',
        cabecera: cabecera.map(enLinea),
        filas: cuerpo.map((f) => f.map(enLinea)),
      });
      continue;
    }

    const item = linea.match(ITEM);
    if (item) {
      const ordenada = item[2] !== undefined;
      const inicio = ordenada ? Number(item[2]) : 1;
      const items: string[] = [];
      while (i < lineas.length) {
        const actual = lineas[i];
        const m = actual.match(ITEM);
        if (m && (m[2] !== undefined) === ordenada) {
          items.push(m[3]);
          i++;
        } else if (items.length && CONTINUACION.test(actual)) {
          items[items.length - 1] += ` ${actual.trim()}`;
          i++;
        } else {
          break;
        }
      }
      salida.push({ t: 'lista', ordenada, inicio, items: items.map((x) => enLinea(x.trim())) });
      continue;
    }

    // La primera línea entra siempre: si no, una que no casara con nada
    // (p. ej. «#sin-espacio») dejaría el bucle sin avanzar.
    const parrafo: string[] = [lineas[i++].trim()];
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !/^(```|#|>|\s*\|)/.test(lineas[i]) &&
      !ITEM.test(lineas[i])
    ) {
      parrafo.push(lineas[i++].trim());
    }
    salida.push({ t: 'parrafo', hijos: enLinea(parrafo.join(' ')) });
  }

  return salida;
}

/** Todos los destinos de enlace de un árbol, para comprobar que existen. */
export function destinos(arbol: Bloque[]): string[] {
  const salida: string[] = [];
  const recorrer = (nodos: EnLinea[]) => {
    for (const n of nodos) {
      if (n.t === 'enlace') salida.push(n.href);
      if ('hijos' in n) recorrer(n.hijos);
    }
  };
  for (const b of arbol) {
    if (b.t === 'titulo' || b.t === 'parrafo' || b.t === 'cita') recorrer(b.hijos);
    else if (b.t === 'lista') b.items.forEach(recorrer);
    else if (b.t === 'tabla') [b.cabecera, ...b.filas].forEach((f) => f.forEach(recorrer));
  }
  return salida;
}

/**
 * Las notas de datos: `content/notas/*.mdx` (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §5),
 * publicadas en `/notas`, `/notas/<slug>` y `/rss/notas`.
 *
 * Una nota es un hallazgo medido: qué se vio, cómo se midió, qué cambió y lo que
 * todavía no se sabe. Markdown plano, con el mismo parser que las guías
 * (`lib/markdown.ts`), y **cada cifra cita un fragmento literal del repo** en
 * `fuentes` (`ruta: «fragmento»`): `__tests__/notas-frontmatter.test.ts` comprueba
 * que el fragmento sigue en ese fichero.
 *
 * **Sólo lo importan componentes de servidor y rutas**: lee del disco. Las páginas
 * se generan en el build; en ejecución lo leen el sitemap y el feed, y para eso
 * `next.config.js` mete `content/notas` en su traza (`outputFileTracingIncludes`).
 *
 * El frontmatter es un YAML mínimo, sin dependencia: `clave: "texto"`, `clave: 12`,
 * listas `  - "x"` y un nivel de objetos anidados por sangría (`antes_despues`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bloques, type Bloque, type EnLinea } from './markdown';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const DIRECTORIO_NOTAS = join(process.cwd(), 'content', 'notas');

export const rutaNota = (slug: string) => `/notas/${slug}`;

export const ESTADOS_NOTA = ['arreglado', 'en-curso', 'medido'] as const;
export type EstadoNota = (typeof ESTADOS_NOTA)[number];

/** Cómo se lee cada estado en la página, en la lista y en el feed. */
export const ETIQUETA_ESTADO: Record<EstadoNota, string> = {
  arreglado: 'Arreglado',
  'en-curso': 'Arreglo en curso',
  medido: 'Medido',
};

/** `cambio` sólo puede ser un PR de este repositorio público. */
export const PREFIJO_CAMBIO = 'https://github.com/cris-middleton/tordo/pull/';

/** La descripción de `/notas` y de su feed. */
export const DESCRIPCION_NOTAS =
  'Lo que encontramos al revisar los datos de compras públicas: qué vimos, cómo lo medimos y qué cambió en el sitio.';

/** El resumen va a la meta description y a la portada (spec §3.4). */
export const MAXIMO_RESUMEN = 220;

export interface Barra {
  etiqueta: string;
  /** 0–100. */
  valor: number;
}

export interface AntesDespues {
  rotulo: string;
  antes: Barra;
  despues: Barra;
}

export interface Nota {
  slug: string;
  titulo: string;
  /** `AAAA-MM-DD`. */
  fecha: string;
  resumen: string;
  estado: EstadoNota;
  /** Qué datos y cuándo se midieron. */
  medido_sobre: string;
  /** `ruta: «fragmento literal»`, uno por cifra. */
  fuentes: string[];
  /** URL de un PR de este repositorio. */
  cambio: string | null;
  /** Ruta en el repo del script o test que reproduce la medición. */
  script: string | null;
  antes_despues: AntesDespues | null;
  cuerpo: Bloque[];
}

// ── Frontmatter ─────────────────────────────────────────────────────────────

export type ValorYaml = string | number | string[] | ObjetoYaml;
export interface ObjetoYaml {
  [clave: string]: ValorYaml;
}

interface LineaYaml {
  sangria: number;
  texto: string;
}

const PAR = /^(\w+):\s*(?:"(.*)"|(-?\d+(?:\.\d+)?))?\s*$/;
const ITEM = /^-\s+"(.*)"\s*$/;

/** Las claves con la misma sangría desde `i`; devuelve el objeto y dónde siguió. */
function bloqueYaml(lineas: LineaYaml[], i: number, sangria: number): [ObjetoYaml, number] {
  const objeto: ObjetoYaml = {};
  while (i < lineas.length && lineas[i].sangria >= sangria) {
    const { texto } = lineas[i];
    if (lineas[i].sangria > sangria) throw new Error(`sangría inesperada: ${texto}`);
    const par = texto.match(PAR);
    if (!par) throw new Error(`línea de frontmatter no reconocida: ${texto}`);
    const [, clave, cadena, numero] = par;
    if (clave in objeto) throw new Error(`clave repetida: ${clave}`);
    i++;
    if (cadena !== undefined) {
      objeto[clave] = cadena;
      continue;
    }
    if (numero !== undefined) {
      objeto[clave] = Number(numero);
      continue;
    }
    const siguiente = lineas[i];
    if (!siguiente || siguiente.sangria <= sangria) throw new Error(`«${clave}» sin valor`);
    if (siguiente.texto.startsWith('-')) {
      const items: string[] = [];
      while (i < lineas.length && lineas[i].sangria === siguiente.sangria && lineas[i].texto.startsWith('-')) {
        const item = lineas[i].texto.match(ITEM);
        if (!item) throw new Error(`elemento de lista no reconocido: ${lineas[i].texto}`);
        items.push(item[1]);
        i++;
      }
      objeto[clave] = items;
    } else {
      const [hijo, despues] = bloqueYaml(lineas, i, siguiente.sangria);
      objeto[clave] = hijo;
      i = despues;
    }
  }
  return [objeto, i];
}

/**
 * El YAML mínimo de las notas: `clave: "texto"`, `clave: 12`, listas `  - "x"` y
 * objetos por sangría. Lanza ante lo que no reconoce: mejor un build roto que una
 * nota a medias.
 */
export function parsearFrontmatter(yaml: string): ObjetoYaml {
  const lineas = yaml
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => ({ sangria: l.length - l.trimStart().length, texto: l.trim() }));
  const [objeto, fin] = bloqueYaml(lineas, 0, 0);
  if (fin < lineas.length) throw new Error(`línea de frontmatter fuera de lugar: ${lineas[fin].texto}`);
  return objeto;
}

/** Frontmatter y cuerpo de un `.mdx`. */
export function separarNota(texto: string): { datos: ObjetoYaml; markdown: string } {
  const m = texto.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('nota sin frontmatter entre dos líneas ---');
  return { datos: parsearFrontmatter(m[1]), markdown: m[2] };
}

// ── Validación ──────────────────────────────────────────────────────────────

function texto(datos: ObjetoYaml, clave: string): string {
  const v = datos[clave];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`nota sin «${clave}»`);
  return v.trim();
}

function opcional(datos: ObjetoYaml, clave: string): string | null {
  return clave in datos ? texto(datos, clave) : null;
}

function barra(v: ValorYaml | undefined, donde: string): Barra {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`«${donde}» no es un objeto`);
  const valor = v.valor;
  if (typeof valor !== 'number' || valor < 0 || valor > 100) throw new Error(`«${donde}.valor» fuera de 0–100`);
  return { etiqueta: texto(v, 'etiqueta'), valor };
}

function antesDespues(v: ValorYaml | undefined): AntesDespues | null {
  if (v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('«antes_despues» no es un objeto');
  return { rotulo: texto(v, 'rotulo'), antes: barra(v.antes, 'antes'), despues: barra(v.despues, 'despues') };
}

/**
 * La nota validada, sin el cuerpo. Las reglas de la spec §5 que se pueden
 * comprobar sin el repo; las que lo necesitan (que `script` exista, que cada
 * fragmento citado siga en su fichero) viven en el test.
 */
export function validarNota(datos: ObjetoYaml): Omit<Nota, 'slug' | 'cuerpo'> {
  const fecha = texto(datos, 'fecha');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    throw new Error(`«fecha» no es AAAA-MM-DD: ${fecha}`);
  }
  const resumen = texto(datos, 'resumen');
  if (resumen.length > MAXIMO_RESUMEN) throw new Error(`«resumen» pasa de ${MAXIMO_RESUMEN} caracteres`);
  const estado = texto(datos, 'estado') as EstadoNota;
  if (!ESTADOS_NOTA.includes(estado)) throw new Error(`«estado» desconocido: ${estado}`);
  const fuentes = datos.fuentes;
  if (!Array.isArray(fuentes) || fuentes.length === 0) throw new Error('nota sin «fuentes»');
  const cambio = opcional(datos, 'cambio');
  if (cambio !== null && !(cambio.startsWith(PREFIJO_CAMBIO) && /^\d+$/.test(cambio.slice(PREFIJO_CAMBIO.length)))) {
    throw new Error(`«cambio» no es un PR de ${PREFIJO_CAMBIO}: ${cambio}`);
  }
  if (estado === 'arreglado' && cambio === null) throw new Error('«arreglado» exige «cambio»');
  return {
    titulo: texto(datos, 'titulo'),
    fecha,
    resumen,
    estado,
    medido_sobre: texto(datos, 'medido_sobre'),
    fuentes,
    cambio,
    script: opcional(datos, 'script'),
    antes_despues: antesDespues(datos.antes_despues),
  };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/** El contenido dice «TORDO»; aquí se cambia por `NEXT_PUBLIC_APP_NAME` (regla del repo). */
function conNombre(t: string): string {
  return t.replace(/\bTORDO\b/g, APP_NAME);
}

export function leerNota(archivo: string): Nota {
  const { datos, markdown } = separarNota(readFileSync(join(DIRECTORIO_NOTAS, archivo), 'utf-8'));
  const nota = validarNota(datos);
  return {
    ...nota,
    slug: archivo.replace(/\.mdx$/, ''),
    titulo: conNombre(nota.titulo),
    resumen: conNombre(nota.resumen),
    cuerpo: bloques(conNombre(markdown)),
  };
}

/** La más nueva primero; a igual fecha, por título. */
export function ordenarNotas(notas: Nota[]): Nota[] {
  return [...notas].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.titulo.localeCompare(b.titulo, 'es'));
}

export function leerNotas(): Nota[] {
  return ordenarNotas(
    readdirSync(DIRECTORIO_NOTAS)
      .filter((f) => f.endsWith('.mdx'))
      .map(leerNota),
  );
}

export function buscarNota(slug: string): Nota | null {
  return leerNotas().find((n) => n.slug === slug) ?? null;
}

// ── Formato ─────────────────────────────────────────────────────────────────

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «16 de octubre de 2026», sin pasar por la zona horaria del proceso. */
export function fechaLarga(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/** Un fragmento citado en `fuentes`: `ruta: «fragmento»`. */
export function citaDeFuente(fuente: string): { ruta: string; fragmento: string } | null {
  const m = fuente.match(/^([\w./-]+\.\w+): «(.+)»$/);
  return m ? { ruta: m[1], fragmento: m[2] } : null;
}

/** `<repositorio>/blob/main/<ruta>`, o `null` sin repositorio. */
export function urlEnRepositorio(repositorio: string | null, ruta: string): string | null {
  return repositorio ? `${repositorio.replace(/\/+$/, '')}/blob/main/${ruta}` : null;
}

/**
 * Un fragmento citado, para leerlo: sin las marcas de código ni de cursiva. Un
 * asterisco suelto se queda (`0 6 * * 0` es un horario de cron, no una cursiva).
 */
export function fragmentoLegible(fragmento: string): string {
  return fragmento.replace(/`/g, '').replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1');
}

// ── Cuerpo ──────────────────────────────────────────────────────────────────

/** Las secciones fijas del cuerpo, en su orden (spec §5). «Reprodúcelo», sólo con `script`. */
export const SECCIONES_NOTA = [
  'En corto',
  'Qué vimos',
  'Cómo lo medimos',
  'Qué cambió',
  'Lo que todavía no sabemos',
] as const;
export const SECCION_REPRODUCELO = 'Reprodúcelo';

/** El texto plano de un trozo en línea. */
export function textoPlano(nodos: EnLinea[]): string {
  return nodos.map((n) => (n.t === 'texto' || n.t === 'codigo' ? n.v : textoPlano(n.hijos))).join('');
}

/** Los `##` del cuerpo, en orden. */
export function titulosDeSeccion(cuerpo: Bloque[]): string[] {
  return cuerpo.flatMap((b) => (b.t === 'titulo' && b.nivel === 2 ? [textoPlano(b.hijos)] : []));
}

/**
 * El cuerpo partido justo después del título «Qué cambió», que es donde va el
 * gráfico de `antes_despues`. Sin ese título, todo va en la primera parte.
 */
export function partirEnQueCambio(cuerpo: Bloque[]): [Bloque[], Bloque[] | null] {
  const i = cuerpo.findIndex((b) => b.t === 'titulo' && b.nivel === 2 && textoPlano(b.hijos) === 'Qué cambió');
  return i < 0 ? [cuerpo, null] : [cuerpo.slice(0, i + 1), cuerpo.slice(i + 1)];
}

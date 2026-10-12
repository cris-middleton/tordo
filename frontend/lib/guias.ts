/**
 * Las guías: `content/explicativos/*.mdx` (spec del pivote D18), publicadas en
 * `/guias` y `/guias/<slug>`.
 *
 * **Sólo lo importan componentes de servidor y rutas**: lee del disco. Las
 * páginas se generan en el build (`generateStaticParams`, `dynamicParams =
 * false`), así que en ejecución sólo lo lee el sitemap — y para eso
 * `next.config.js` mete `content/explicativos` en su traza
 * (`outputFileTracingIncludes`).
 *
 * El frontmatter es el YAML mínimo que fija `__tests__/explicativos-frontmatter.test.ts`
 * (`clave: "valor"` y listas `  - "x"`): se parsea aquí sin dependencia.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bloques, type Bloque } from './markdown';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const DIRECTORIO_GUIAS = join(process.cwd(), 'content', 'explicativos');

export const rutaGuia = (slug: string) => `/guias/${slug}`;

export interface Guia {
  slug: string;
  titulo: string;
  descripcion: string;
  /** `AAAA-MM-DD`. */
  actualizado: string;
  fuentes: string[];
  cuerpo: Bloque[];
}

/** Frontmatter y cuerpo de un `.mdx`. Lanza si falta algo: mejor un build roto que una guía a medias. */
export function parsearGuia(texto: string): Omit<Guia, 'cuerpo'> & { markdown: string } {
  const m = texto.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('guía sin frontmatter entre dos líneas ---');
  const datos: Record<string, string | string[]> = {};
  let lista: string | null = null;
  for (const linea of m[1].split('\n')) {
    const item = linea.match(/^\s+-\s+"(.*)"\s*$/);
    if (item && lista) {
      (datos[lista] as string[]).push(item[1]);
      continue;
    }
    const par = linea.match(/^(\w+):\s*(?:"(.*)")?\s*$/);
    if (!par) throw new Error(`línea de frontmatter no reconocida: ${linea}`);
    if (par[2] === undefined) {
      lista = par[1];
      datos[lista] = [];
    } else {
      lista = null;
      datos[par[1]] = par[2];
    }
  }
  const campo = (clave: string) => {
    const v = datos[clave];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`guía sin «${clave}»`);
    return v.trim();
  };
  const fuentes = datos.fuentes;
  if (!Array.isArray(fuentes) || fuentes.length === 0) throw new Error('guía sin «fuentes»');
  return {
    slug: campo('slug'),
    titulo: campo('titulo'),
    descripcion: campo('descripcion'),
    actualizado: campo('actualizado'),
    fuentes,
    markdown: m[2],
  };
}

/**
 * El nombre del sitio no se escribe a mano (regla del repo): el contenido dice
 * «TORDO» y aquí se cambia por `NEXT_PUBLIC_APP_NAME`.
 */
function conNombre(texto: string): string {
  return texto.replace(/\bTORDO\b/g, APP_NAME);
}

export function leerGuia(archivo: string): Guia {
  const { markdown, ...datos } = parsearGuia(readFileSync(join(DIRECTORIO_GUIAS, archivo), 'utf-8'));
  if (`${datos.slug}.mdx` !== archivo) throw new Error(`${archivo}: el slug no es el nombre del archivo`);
  return {
    ...datos,
    titulo: conNombre(datos.titulo),
    descripcion: conNombre(datos.descripcion),
    cuerpo: bloques(conNombre(markdown)),
  };
}

/** Todas, por título. */
export function leerGuias(): Guia[] {
  return readdirSync(DIRECTORIO_GUIAS)
    .filter((f) => f.endsWith('.mdx'))
    .map(leerGuia)
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}

export function buscarGuia(slug: string): Guia | null {
  return leerGuias().find((g) => g.slug === slug) ?? null;
}

/**
 * Los explicativos (`content/explicativos/*.mdx`, spec del pivote D18) son
 * contenido y nada más: este test fija que cada uno trae lo que la página y los
 * metadatos van a leer, sin añadir un parser de YAML como dependencia.
 *
 * - `descripcion` va a `<meta name="description">`: más de 155 caracteres y el
 *   buscador la corta.
 * - `slug` es la URL: tiene que coincidir con el nombre del archivo.
 * - `fuentes` no puede faltar: toda cifra de un explicativo sale de un dato medido,
 *   y la fuente se nombra.
 * - En MDX, `{` y `<` en el texto se leen como JSX y rompen el build.
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const DIRECTORIO = path.join(__dirname, '..', 'content', 'explicativos');

const ARCHIVOS = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith('.mdx'))
  .sort();

/** Rutas a las que un explicativo puede enlazar. */
const RUTAS_PERMITIDAS = [
  '/compra-agil',
  '/licitaciones',
  '/mercado',
  '/guardados',
  '/rubros/',
  '/productos/',
  '/compradores/',
  '/guias/',
];

interface Frontmatter {
  [clave: string]: string | string[];
}

/** El frontmatter y el cuerpo. YAML mínimo: `clave: "valor"` y listas `  - "x"`. */
function separar(texto: string): { datos: Frontmatter; cuerpo: string } {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('sin frontmatter entre dos líneas ---');
  const datos: Frontmatter = {};
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
  return { datos, cuerpo: m[2] };
}

/** El cuerpo sin bloques de código ni código en línea, que MDX no interpreta. */
function sinCodigo(cuerpo: string): string {
  return cuerpo.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

describe('explicativos', () => {
  it('son entre 6 y 8 (spec D18)', () => {
    expect(ARCHIVOS.length).toBeGreaterThanOrEqual(6);
    expect(ARCHIVOS.length).toBeLessThanOrEqual(8);
  });

  it('no repiten slug ni título', () => {
    const datos = ARCHIVOS.map((f) => separar(readFileSync(path.join(DIRECTORIO, f), 'utf8')).datos);
    expect(new Set(datos.map((d) => d.slug)).size).toBe(ARCHIVOS.length);
    expect(new Set(datos.map((d) => d.titulo)).size).toBe(ARCHIVOS.length);
  });

  describe.each(ARCHIVOS)('%s', (archivo) => {
    const { datos, cuerpo } = separar(readFileSync(path.join(DIRECTORIO, archivo), 'utf8'));

    it('trae titulo, descripcion, slug, actualizado y fuentes', () => {
      for (const clave of ['titulo', 'descripcion', 'slug', 'actualizado']) {
        expect(typeof datos[clave], clave).toBe('string');
        expect((datos[clave] as string).trim().length, clave).toBeGreaterThan(0);
      }
      expect(Array.isArray(datos.fuentes)).toBe(true);
      expect((datos.fuentes as string[]).length).toBeGreaterThan(0);
    });

    it('la descripcion cabe en una meta description (≤ 155)', () => {
      expect((datos.descripcion as string).length).toBeLessThanOrEqual(155);
    });

    it('el slug es el nombre del archivo', () => {
      expect(`${datos.slug}.mdx`).toBe(archivo);
      expect(datos.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('actualizado es una fecha real', () => {
      expect(datos.actualizado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(datos.actualizado as string))).toBe(false);
    });

    it('sólo enlaza a rutas del sitio que existen o a un correo', () => {
      const enlaces = [...cuerpo.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
      for (const destino of enlaces) {
        if (destino.startsWith('mailto:')) continue;
        expect(
          RUTAS_PERMITIDAS.some((ruta) => destino === ruta || destino.startsWith(ruta)),
          destino,
        ).toBe(true);
      }
    });

    it('no tiene { ni < fuera del código: MDX los leería como JSX', () => {
      expect(sinCodigo(cuerpo)).not.toMatch(/[{<]/);
    });
  });
});

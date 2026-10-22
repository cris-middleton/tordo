/**
 * Toda página que declara su propio `openGraph` (o `twitter`) lleva la tarjeta
 * de vista previa (`lib/vistaPrevia.ts`).
 *
 * Next reemplaza el `openGraph` del padre entero cuando la página trae el suyo,
 * y con él la imagen de `app/opengraph-image.tsx`. La revisión de enlaces del
 * 2026-10-22 encontró sin `og:image` las fichas de comprador, rubro y producto,
 * las guías, las notas y `/buscar`: compartidas por WhatsApp o LinkedIn salían
 * sin tarjeta.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { generateMetadata as metaBuscar } from '@/app/(publico)/buscar/page';
import { generateMetadata as metaGuia } from '@/app/(publico)/guias/[slug]/page';
import { generateMetadata as metaNota } from '@/app/(publico)/notas/[slug]/page';
import { alt as altOpenGraph } from '@/app/opengraph-image';
import { leerGuias } from '@/lib/guias';
import { leerNotas } from '@/lib/notas';
import { metadataComprador, metadataProducto, metadataRubro } from '@/lib/publico';
import { ALT_VISTA_PREVIA, IMAGEN_OPEN_GRAPH, IMAGEN_TWITTER } from '@/lib/vistaPrevia';

import { COMPRADOR, PRODUCTO, RUBRO } from './ayudas/publicoDePrueba';

const RAIZ = join(__dirname, '..');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

/**
 * `app/page.tsx` está en el mismo segmento que `app/opengraph-image.tsx`: ahí el
 * archivo de metadatos manda y la imagen sale sola.
 */
const MISMO_SEGMENTO_QUE_LA_IMAGEN = ['app/page.tsx'];

const imagenes = (m: { openGraph?: unknown }) =>
  (m.openGraph as { images?: { url: string }[] } | undefined)?.images?.map((i) => i.url);

describe('tarjeta de vista previa', () => {
  it('el texto alternativo es uno solo, el de la imagen', () => {
    expect(altOpenGraph).toBe(ALT_VISTA_PREVIA);
    expect(IMAGEN_OPEN_GRAPH).toMatchObject({ url: '/opengraph-image', width: 1200, height: 630 });
    expect(IMAGEN_TWITTER).toMatchObject({ url: '/twitter-image', width: 1200, height: 630 });
  });

  it('todo fichero que declara openGraph o twitter pone la imagen', () => {
    const revisados = [...ficheros(join(RAIZ, 'app')), ...ficheros(join(RAIZ, 'lib'))]
      .map((ruta) => ({ ruta: relative(RAIZ, ruta), texto: readFileSync(ruta, 'utf8') }))
      .filter(({ ruta }) => !MISMO_SEGMENTO_QUE_LA_IMAGEN.includes(ruta));
    const conOpenGraph = revisados.filter(({ texto }) => /\bopenGraph:\s*\{/.test(texto));
    const conTwitter = revisados.filter(({ texto }) => /\btwitter:\s*\{/.test(texto));
    // Guarda: si dejaran de encontrarse, el test comprobaría el vacío.
    expect(conOpenGraph.length).toBeGreaterThanOrEqual(4);
    expect(conTwitter.length).toBeGreaterThanOrEqual(1);
    expect(conOpenGraph.filter(({ texto }) => !texto.includes('IMAGEN_OPEN_GRAPH')).map((f) => f.ruta)).toEqual([]);
    expect(conTwitter.filter(({ texto }) => !texto.includes('IMAGEN_TWITTER')).map((f) => f.ruta)).toEqual([]);
  });

  it('las fichas de comprador, rubro y producto', () => {
    expect(imagenes(metadataComprador(COMPRADOR))).toEqual(['/opengraph-image']);
    expect(imagenes(metadataRubro(RUBRO))).toEqual(['/opengraph-image']);
    expect(imagenes(metadataProducto(PRODUCTO))).toEqual(['/opengraph-image']);
  });

  it('las guías y las notas', async () => {
    const guia = leerGuias()[0];
    const nota = leerNotas()[0];
    expect(imagenes(await metaGuia({ params: Promise.resolve({ slug: guia.slug }) }))).toEqual(['/opengraph-image']);
    expect(imagenes(await metaNota({ params: Promise.resolve({ slug: nota.slug }) }))).toEqual(['/opengraph-image']);
  });

  it('/buscar, también la de X', async () => {
    const m = await metaBuscar({ searchParams: Promise.resolve({ q: 'resma' }) });
    expect(imagenes(m)).toEqual(['/opengraph-image']);
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: [IMAGEN_TWITTER] });
  });
});

import { expect, test } from '@playwright/test';

/**
 * Lo mínimo que toda página pública tiene que cumplir, para un buscador y para
 * un lector de pantalla, comprobado en el HTML que sirve el servidor:
 *
 * - `<html lang="es">`: sin él, un lector de pantalla lee en inglés.
 * - **Un solo `<h1>`**: es el título de la página para quien navega por
 *   encabezados, y el que toma el buscador.
 * - `<title>` y `<meta name="description">` no vacíos.
 * - Las páginas indexables, con `<link rel="canonical">`.
 * - Toda `<img>` con `alt` (vacío vale: es decorativa a propósito).
 * - **Títulos distintos entre las páginas del sitemap**: dos páginas con el
 *   mismo título compiten entre sí en el buscador. Pasó con los productos, que se
 *   titulaban por su categoría (#148).
 *
 * Recorre las páginas fijas y TODO el sitemap. Las del panel se dejan fuera: no
 * se indexan y su contenido se pinta en el cliente.
 */

const FIJAS = ['/', '/guias', '/notas', '/productos', '/apoyar', '/terminos', '/privacidad'];

function extraer(html: string, patron: RegExp): string[] {
  return [...html.matchAll(patron)].map((m) => m[1]);
}

test('cada página pública cumple lo mínimo de accesibilidad y SEO', async ({ request }) => {
  test.setTimeout(180_000);
  const xml = await (await request.get('/sitemap.xml')).text();
  const delSitemap = extraer(xml, /<loc>([^<]+)<\/loc>/g).map((u) => new URL(u).pathname);
  const rutas = [...new Set([...FIJAS, ...delSitemap])];
  expect(rutas.length).toBeGreaterThan(10);

  const fallos: string[] = [];
  const titulos = new Map<string, string>();

  for (const ruta of rutas) {
    const r = await request.get(ruta);
    if (r.status() !== 200) {
      fallos.push(`${ruta}: responde ${r.status()}`);
      continue;
    }
    const html = await r.text();
    const mal = (que: string) => fallos.push(`${ruta}: ${que}`);

    if (!/<html[^>]*\blang="es/.test(html)) mal('sin lang="es"');
    const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
    if (h1 !== 1) mal(`${h1} <h1> (debe ser 1)`);

    const titulo = extraer(html, /<title>([^<]*)<\/title>/g)[0]?.trim() ?? '';
    if (!titulo) mal('sin <title>');
    const descripcion = extraer(html, /<meta name="description" content="([^"]*)"/g)[0] ?? '';
    if (!descripcion.trim()) mal('sin meta description');

    if (delSitemap.includes(ruta) && !/<link rel="canonical"/.test(html)) mal('sin canonical');

    for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
      if (!/\balt="/.test(img)) mal(`imagen sin alt: ${img.slice(0, 80)}`);
    }

    if (delSitemap.includes(ruta) && titulo) {
      const otra = titulos.get(titulo);
      if (otra) mal(`mismo <title> que ${otra}: «${titulo}»`);
      else titulos.set(titulo, ruta);
    }
  }

  expect(fallos, fallos.join('\n')).toEqual([]);
});

import { expect, test } from '@playwright/test';

import { mapaDelSitio } from '../lib/navegacion';

/**
 * Ningún enlace interno lleva a una página rota.
 *
 * Recorre el sitio como lo haría un buscador: parte de la portada, de las
 * páginas fijas y de TODO lo que lista `/sitemap.xml`, sigue cada enlace interno
 * que encuentra en el HTML que sirve el servidor y pide cada ruta una vez. Falla
 * si alguna responde 4xx o 5xx y dice desde qué página se llegó.
 *
 * Es el test que habría visto, sin que nadie lo buscara, una guía que enlaza una
 * ruta renombrada, un comprador que enlaza un rubro sin página o un pie que
 * apunta a algo que ya no existe. Mira el HTML del servidor, no el que monta el
 * cliente: es lo que ve un buscador, y lo que importa para indexar.
 */

const SEMILLAS = ['/', '/guias', '/productos', '/apoyar', '/terminos', '/privacidad', '/licitaciones'];

// Lo que no es una página: rutas de API, feeds (tienen su propio test),
// el túnel de Sentry, los recursos de Next y las imágenes de metadatos.
const EXCLUIDAS = [/^\/api\//, /^\/rss\//, /^\/monitoring/, /^\/_next\//, /^\/_vercel\//, /\.(png|svg|ico|xml|txt|webmanifest)$/];

// Tope de páginas, para que el test no crezca sin control con el fixture.
const TOPE = 400;

function rutasDelSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

function enlacesInternos(html: string, origen: string): string[] {
  const rutas: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (/^(mailto:|tel:|javascript:)/.test(href)) continue;
    const url = new URL(href, origen);
    if (url.origin !== new URL(origen).origin) continue;
    rutas.push(url.pathname + url.search);
  }
  return rutas;
}

test('ningún enlace interno lleva a una página rota', async ({ request, baseURL }) => {
  test.setTimeout(180_000);
  const origen = baseURL as string;

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const pendientes: { ruta: string; desde: string }[] = [
    ...SEMILLAS.map((ruta) => ({ ruta, desde: '(semilla)' })),
    ...rutasDelSitemap(await sitemap.text()).map((ruta) => ({ ruta, desde: '/sitemap.xml' })),
  ];
  const vistas = new Set<string>();
  const rotas: string[] = [];

  while (pendientes.length && vistas.size < TOPE) {
    const { ruta, desde } = pendientes.shift()!;
    if (vistas.has(ruta) || EXCLUIDAS.some((r) => r.test(ruta))) continue;
    vistas.add(ruta);

    const respuesta = await request.get(ruta, { maxRedirects: 5 });
    if (respuesta.status() >= 400) {
      rotas.push(`${respuesta.status()} ${ruta}  (enlazada desde ${desde})`);
      continue;
    }
    if (!(respuesta.headers()['content-type'] ?? '').includes('text/html')) continue;
    for (const siguiente of enlacesInternos(await respuesta.text(), origen)) {
      if (!vistas.has(siguiente)) pendientes.push({ ruta: siguiente, desde: ruta });
    }
  }

  expect(vistas.size, 'el recorrido no encontró casi nada: ¿se cayó el sitio?').toBeGreaterThan(20);
  expect(rotas, `enlaces rotos:\n${rotas.join('\n')}`).toEqual([]);

  // La navegación ahora está en el HTML del servidor de TODA página (la barra
  // lateral navegaba con botones y nunca se recorrió): cada sección tiene que
  // haberse alcanzado desde la cabecera o el pie.
  const sinVisitar = mapaDelSitio(null)
    .filter((e) => !e.externo)
    .map((e) => e.href)
    .filter((ruta) => !vistas.has(ruta));
  expect(sinVisitar, 'secciones que ni la cabecera ni el pie enlazan').toEqual([]);
});

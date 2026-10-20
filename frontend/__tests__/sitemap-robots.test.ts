// @vitest-environment node
/**
 * `/sitemap.xml` y `/robots.txt`.
 *
 * El sitemap junta las páginas fijas con lo que el backend declara indexable
 * (`/publico/sitemap`), con URL absolutas sobre `NEXT_PUBLIC_SITE_URL`. Sin
 * backend no falla: sirve las fijas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

import { leerGuias } from '@/lib/guias';
import { leerNotas } from '@/lib/notas';
import { NO_RASTREAR, PAGINAS_FIJAS, RASTREADORES_DE_ENTRENAMIENTO } from '@/lib/publico';

import { SITEMAP } from './ayudas/publicoDePrueba';

/** Las guías, por título: las lee del disco igual que el sitemap. */
const GUIAS = leerGuias().map((g) => `https://tordo.prueba/guias/${g.slug}`);
/** Las notas, de la más nueva a la más vieja: las lee del disco igual que el sitemap. */
const NOTAS = leerNotas().map((n) => `https://tordo.prueba/notas/${n.slug}`);

let pedidas: { url: string; init: RequestInit }[] = [];

function simularBackend(cuerpo: unknown, status = 200) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

beforeEach(() => {
  process.env.API_URL = 'http://backend.prueba:8000';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tordo.prueba/';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe('sitemap y robots', () => {
  it('el sitemap junta las páginas fijas y las indexables, con URL absoluta', async () => {
    simularBackend(SITEMAP);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual([
      'https://tordo.prueba',
      'https://tordo.prueba/compra-agil',
      'https://tordo.prueba/licitaciones',
      'https://tordo.prueba/productos',
      'https://tordo.prueba/guias',
      'https://tordo.prueba/notas',
      'https://tordo.prueba/abierto',
      'https://tordo.prueba/acerca',
      'https://tordo.prueba/apoyar',
      'https://tordo.prueba/terminos',
      'https://tordo.prueba/privacidad',
      ...GUIAS,
      ...NOTAS,
      'https://tordo.prueba/rubros/equipos-medicos',
      'https://tordo.prueba/compradores/7297',
      'https://tordo.prueba/productos/guante-latex-nitrilo',
    ]);
    expect((await sitemap()).at(-1)?.lastModified).toBe('2026-10-04');
    expect(pedidas[0].url).toBe('http://backend.prueba:8000/api/v1/publico/sitemap');
    expect(pedidas[0].init.next?.tags).toEqual(['analytics']);
  });

  it('sin backend, el sitemap sirve las fijas en vez de fallar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    simularBackend(SITEMAP, 502);
    expect((await sitemap()).map((e) => e.url)).toEqual([
      ...PAGINAS_FIJAS.map((r) => `https://tordo.prueba${r === '/' ? '' : r}`),
      ...GUIAS,
      ...NOTAS,
    ]);
  });

  it('cada guía va al sitemap con su fecha de actualización', async () => {
    simularBackend(SITEMAP);
    const guias = (await sitemap()).filter((e) => e.url.includes('/guias/'));
    expect(guias.length).toBeGreaterThanOrEqual(6);
    for (const g of guias) expect(g.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('cada nota va al sitemap con su fecha', async () => {
    simularBackend(SITEMAP);
    const notas = (await sitemap()).filter((e) => e.url.includes('/notas/'));
    expect(notas.length).toBeGreaterThanOrEqual(4);
    for (const n of notas) expect(n.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('robots deja fuera la API, los feeds y los guardados, y enlaza el sitemap', () => {
    const r = robots();
    expect(r.sitemap).toBe('https://tordo.prueba/sitemap.xml');
    expect(r.rules).toEqual([
      { userAgent: '*', allow: '/', disallow: ['/api/', '/rss/', '/guardados'] },
      {
        userAgent: [...RASTREADORES_DE_ENTRENAMIENTO],
        allow: '/',
        disallow: ['/api/', '/rss/', '/guardados', '/productos/', '/compradores/', '/rubros/'],
      },
    ]);
  });

  it('los buscadores y los asistentes que responden a una persona siguen la regla general', () => {
    // Un grupo propio sustituye al de `*`: cualquiera de estos en la lista
    // dejaría de llegar a las fichas, que es lo que se quiere encontrable.
    const deBusqueda = [
      'Googlebot',
      'Bingbot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'Claude-SearchBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
    ];
    const listados = RASTREADORES_DE_ENTRENAMIENTO.map((r) => r.toLowerCase());
    for (const agente of deBusqueda) expect(listados).not.toContain(agente.toLowerCase());
  });

  it('/buscar no va al sitemap ni se bloquea en robots: su noindex tiene que poder leerse', async () => {
    simularBackend(SITEMAP);
    expect(PAGINAS_FIJAS).not.toContain('/buscar');
    expect((await sitemap()).some((e) => new URL(e.url).pathname.startsWith('/buscar'))).toBe(false);
    // Un buscador que no rastrea la página no ve su `noindex` (spec del rediseño §6.4).
    expect(NO_RASTREAR.some((prefijo) => '/buscar?q=resma'.startsWith(prefijo))).toBe(false);
  });
});

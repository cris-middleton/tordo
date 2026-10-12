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

import { SITEMAP } from './ayudas/publicoDePrueba';

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
      'https://tordo.prueba/dashboard/compra-agil',
      'https://tordo.prueba/dashboard/tenders',
      'https://tordo.prueba/productos',
      'https://tordo.prueba/terminos',
      'https://tordo.prueba/privacidad',
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
    expect((await sitemap()).map((e) => e.url)).toHaveLength(6);
  });

  it('robots deja fuera la API, los feeds y los guardados, y enlaza el sitemap', () => {
    const r = robots();
    expect(r.sitemap).toBe('https://tordo.prueba/sitemap.xml');
    expect(r.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/rss/', '/dashboard/guardados'],
    });
  });
});

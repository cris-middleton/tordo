// @vitest-environment node
/**
 * El servidor pregunta si la licitación existe antes de pintar su ficha: un 404
 * del backend es un 404 de la página. Pregunta como el visitante (cuenta en su
 * límite por IP) y, si el backend no contesta, pinta la ficha igual.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { licitacionExiste } from '@/lib/licitacionServidor';

const pedidas: { url: string; headers: Headers }[] = [];

function backend(status: number) {
  process.env.API_URL = 'http://backend.prueba:8000';
  process.env.PROXY_SECRETO = 'secreto-de-prueba';
  pedidas.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, headers: new Headers(init.headers) });
      return new Response('{}', { status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
  delete process.env.PROXY_SECRETO;
});

const visitante = new Headers({ 'x-real-ip': '200.1.2.3' });

describe('licitacionExiste', () => {
  it('404 y 422 son «no existe»', async () => {
    backend(404);
    expect(await licitacionExiste('1234-56-LE26', visitante)).toBe(false);
    backend(422);
    expect(await licitacionExiste('x'.repeat(80), visitante)).toBe(false);
  });

  it('200 existe; un fallo del backend no se toma por «no existe»', async () => {
    backend(200);
    expect(await licitacionExiste('1234-56-LE26', visitante)).toBe(true);
    for (const status of [429, 500, 502, 503]) {
      backend(status);
      expect(await licitacionExiste('1234-56-LE26', visitante)).toBe(true);
    }
  });

  it('pregunta como el visitante, al código exacto', async () => {
    backend(200);
    await licitacionExiste('1234-56 LE26', visitante);
    expect(pedidas[0].url).toBe('http://backend.prueba:8000/api/v1/tenders/codigo/1234-56%20LE26');
    expect(pedidas[0].headers.get('X-Tordo-Visitante')).toBe('200.1.2.3');
  });

  it('sin backend (red caída) pinta la ficha igual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect(await licitacionExiste('1234-56-LE26', visitante)).toBe(true);
  });
});

/**
 * `pedirResumenPortada()` — la tira de cifras de la portada (spec del rediseño §6.6).
 *
 * Se fija, como con «Lo mejor de hoy» (`portada.test.tsx`):
 *   1. se pide como RENDERIZADO DEL SERVIDOR, con media hora de caché y la
 *      etiqueta `compra-agil` que vacía el cron frecuente;
 *   2. **nunca lanza**: con un 500, sin red o con otra forma devuelve `null`, y
 *      la portada oculta la tira. La portada no se cae por la API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pedirResumenPortada } from '@/lib/publicoServidor';
import type { ResumenPortada } from '@/types/publico';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

const RESUMEN: ResumenPortada = {
  licitaciones_abiertas: 4232,
  compra_agil_abiertas: 2714,
  actualizado_en: '2026-10-14T11:00:00-03:00',
};

let pedidas: { url: string; init: RequestInit }[] = [];

function simularBackend(respuesta: () => Promise<Response>) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      return respuesta();
    }),
  );
}

const ok = (cuerpo: unknown) => async () =>
  new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pedirResumenPortada', () => {
  it('se pide como renderizado del servidor, media hora, etiqueta compra-agil', async () => {
    simularBackend(ok(RESUMEN));

    expect(await pedirResumenPortada()).toEqual(RESUMEN);

    const { url, init } = pedidas[0];
    expect(url).toBe(`${BACKEND}/api/v1/publico/portada`);
    const cabeceras = new Headers(init.headers);
    expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
    expect(cabeceras.has('X-Tordo-Visitante')).toBe(false);
    expect(init.next).toEqual({ revalidate: 1800, tags: ['compra-agil'] });
  });

  it('sin hora todavía es una respuesta válida (la portada decide ocultar la tira)', async () => {
    simularBackend(ok({ ...RESUMEN, actualizado_en: null }));
    expect(await pedirResumenPortada()).toEqual({ ...RESUMEN, actualizado_en: null });
  });

  it.each([
    ['un 500', async () => new Response('{}', { status: 500 })],
    ['sin red', async () => Promise.reject(new TypeError('fetch failed'))],
    ['otra forma', ok({ detail: 'raro' })],
    ['un conteo negativo', ok({ ...RESUMEN, licitaciones_abiertas: -1 })],
    ['un conteo con decimales', ok({ ...RESUMEN, compra_agil_abiertas: 2.5 })],
  ])('con %s devuelve null y no lanza', async (_, respuesta) => {
    simularBackend(respuesta);
    await expect(pedirResumenPortada()).resolves.toBeNull();
  });
});

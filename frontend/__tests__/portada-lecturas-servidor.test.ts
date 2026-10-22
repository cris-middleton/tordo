/**
 * Lo que pide la portada para las lecturas 1 y 2 (spec IDENTIDAD_Y_PORTADA §3.2):
 * `GET /bi/sector` y la ficha de `PRODUCTO_PORTADA`.
 *
 * Se fija, como con el resumen (`resumen-portada.test.ts`):
 *   1. se piden como RENDERIZADO DEL SERVIDOR, pero con la caché de analytics
 *      (una semana, etiqueta `analytics`, la vacía el cron semanal): leen tablas
 *      que cambian una vez por semana;
 *   2. **nunca lanzan**: un 503 (FEATURE_ANALYTICS apagada), un 404, sin red o
 *      una forma rara devuelven `null` y la portada oculta esa lectura;
 *   3. generalizar `pedirParaLaPortada` no cambió la caché de lo vivo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCTO_PORTADA } from '@/lib/lecturasPortada';
import { pedirProductoPortada, pedirResumenPortada, pedirSectoresPortada } from '@/lib/publicoServidor';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

const SECTORES = {
  disponible: true,
  total: 1,
  sectores: [{ sector: 'Salud', monto_total: 2.98e12, ventana_desde: '2023-11-01', ventana_hasta: '2026-10-11' }],
};

const PRODUCTO = {
  slug: PRODUCTO_PORTADA.slug,
  firma: 'guantes nitrilo',
  nombre_generico: null,
  codigo_onu: null,
  descripcion: null,
  indexable: true,
  unidades: [{ unidad: 'Caja', n: 184, p10: 2100, p25: 4200, p50: 5390, p75: 6900, p90: 11800, predictibilidad: null, confianza: null }],
  compradores: [],
  periodo: { ventana_desde: '2025-10-01', ventana_hasta: '2026-09-30' },
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
const estado = (codigo: number) => async () => new Response('{}', { status: codigo });
const sinRed = async () => Promise.reject(new TypeError('fetch failed'));

beforeEach(() => {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function comoRenderizadoDelServidor(init: RequestInit) {
  const cabeceras = new Headers(init.headers);
  expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
  expect(cabeceras.has('X-Tordo-Visitante')).toBe(false);
}

describe('pedirSectoresPortada', () => {
  it('GET /bi/sector como renderizado del servidor, una semana, etiqueta analytics', async () => {
    simularBackend(ok(SECTORES));
    expect(await pedirSectoresPortada()).toEqual(SECTORES);
    const { url, init } = pedidas[0];
    expect(url).toBe(`${BACKEND}/api/v1/bi/sector`);
    comoRenderizadoDelServidor(init);
    expect(init.next).toEqual({ revalidate: 604800, tags: ['analytics'] });
  });

  it('«no disponible» es una respuesta válida: la lectura decide ocultarse', async () => {
    simularBackend(ok({ disponible: false, motivo: 'parquet no generado' }));
    expect(await pedirSectoresPortada()).toEqual({ disponible: false, motivo: 'parquet no generado' });
  });

  it.each([
    ['un 503 (FEATURE_ANALYTICS apagada)', estado(503)],
    ['un 500', estado(500)],
    ['sin red', sinRed],
    ['otra forma', ok({ detail: 'raro' })],
    ['un sector nulo', ok({ disponible: true, sectores: [{ sector: null, monto_total: 1 }] })],
  ])('con %s devuelve null y no lanza', async (_, respuesta) => {
    simularBackend(respuesta);
    await expect(pedirSectoresPortada()).resolves.toBeNull();
  });
});

describe('pedirProductoPortada', () => {
  it('la ficha de PRODUCTO_PORTADA, escapada, con la caché de analytics', async () => {
    simularBackend(ok(PRODUCTO));
    expect(await pedirProductoPortada()).toEqual(PRODUCTO);
    const { url, init } = pedidas[0];
    expect(url).toBe(`${BACKEND}/api/v1/publico/productos/${encodeURIComponent(PRODUCTO_PORTADA.slug)}`);
    comoRenderizadoDelServidor(init);
    expect(init.next).toEqual({ revalidate: 604800, tags: ['analytics'] });
  });

  it.each([
    ['un 404 (el producto ya no existe)', estado(404)],
    ['un 503', estado(503)],
    ['sin red', sinRed],
    ['una unidad con p25 de texto', ok({ ...PRODUCTO, unidades: [{ ...PRODUCTO.unidades[0], p25: '4200' }] })],
  ])('con %s devuelve null y no lanza', async (_, respuesta) => {
    simularBackend(respuesta);
    await expect(pedirProductoPortada()).resolves.toBeNull();
  });
});

describe('generalizar la caché no tocó lo vivo', () => {
  it('el resumen sigue en media hora y compra-agil', async () => {
    simularBackend(ok({ licitaciones_abiertas: 1, compra_agil_abiertas: 1, actualizado_en: null }));
    await pedirResumenPortada();
    expect(pedidas[0].init.next).toEqual({ revalidate: 1800, tags: ['compra-agil'] });
  });
});

describe('cuánto se espera cada bloque', () => {
  it('lo de analytics, 25 s: /publico/mercado tardó 12,7 s en frío en producción; lo vivo, 8 s', async () => {
    const plazos = vi.spyOn(AbortSignal, 'timeout');
    simularBackend(ok(SECTORES));
    await pedirSectoresPortada();
    expect(plazos).toHaveBeenLastCalledWith(25000);
    simularBackend(ok({ licitaciones_abiertas: 1, compra_agil_abiertas: 1, actualizado_en: null }));
    await pedirResumenPortada();
    expect(plazos).toHaveBeenLastCalledWith(8000);
  });
});

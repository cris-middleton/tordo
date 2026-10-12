// @vitest-environment node
/**
 * El proxy le dice al backend quién es el visitante, y se lo prueba.
 *
 * El backend limita por IP. Sin estas dos cabeceras, todo el tráfico del
 * navegador le llegaba con la IP del servidor de Next y el sitio entero era UN
 * cubo de 60 peticiones por minuto (Foco de revisión nº 1 del pivote). Se fija:
 *
 *   1. que manda `X-Tordo-Visitante` con la IP que dio la plataforma, y
 *      `X-Tordo-Proxy` con el secreto;
 *   2. que sin IP manda «desconocido» y no nada: sin visitante, el backend lo
 *      tomaría por un renderizado del servidor y lo eximiría;
 *   3. que sin secreto no manda ninguna de las dos;
 *   4. que no reenvía lo que el navegador ponga en esas cabeceras.
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VISITANTE_DESCONOCIDO, ipDelVisitante } from '@/lib/backendServidor';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

let enviadas: Headers[] = [];

async function cargarProxy(secreto: string | undefined) {
  vi.resetModules();
  process.env.API_URL = BACKEND;
  if (secreto === undefined) delete process.env.PROXY_SECRETO;
  else process.env.PROXY_SECRETO = secreto;
  enviadas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      enviadas.push(new Headers(init.headers));
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return import('@/app/api/proxy/[...ruta]/route');
}

async function pedir(secreto: string | undefined, headers: Record<string, string>) {
  const { GET } = await cargarProxy(secreto);
  await GET(new NextRequest('http://localhost:3000/api/proxy/api/v1/tenders', { headers }), {
    params: Promise.resolve({ ruta: ['api', 'v1', 'tenders'] }),
  });
  expect(enviadas).toHaveLength(1);
  return enviadas[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PROXY_SECRETO;
});

describe('el proxy identifica al visitante ante el backend', () => {
  it('manda la IP del visitante y el secreto', async () => {
    const h = await pedir(SECRETO, { 'x-forwarded-for': '200.1.2.3, 10.0.0.1' });
    expect(h.get('x-tordo-visitante')).toBe('200.1.2.3');
    expect(h.get('x-tordo-proxy')).toBe(SECRETO);
  });

  it('prefiere x-real-ip', async () => {
    const h = await pedir(SECRETO, { 'x-real-ip': '2001:db8::1', 'x-forwarded-for': '200.1.2.3' });
    expect(h.get('x-tordo-visitante')).toBe('2001:db8::1');
  });

  it('sin IP manda «desconocido», no nada', async () => {
    const h = await pedir(SECRETO, {});
    expect(h.get('x-tordo-visitante')).toBe(VISITANTE_DESCONOCIDO);
    expect(h.get('x-tordo-proxy')).toBe(SECRETO);
  });

  it('sin secreto no manda ninguna de las dos', async () => {
    const h = await pedir(undefined, { 'x-real-ip': '200.1.2.3' });
    expect(h.get('x-tordo-visitante')).toBeNull();
    expect(h.get('x-tordo-proxy')).toBeNull();
  });

  it('no reenvía lo que el navegador ponga en esas cabeceras', async () => {
    const h = await pedir(SECRETO, {
      'x-real-ip': '200.1.2.3',
      'x-tordo-visitante': '1.1.1.1',
      'x-tordo-proxy': 'inventado',
    });
    expect(h.get('x-tordo-visitante')).toBe('200.1.2.3');
    expect(h.get('x-tordo-proxy')).toBe(SECRETO);
  });
});

describe('ipDelVisitante', () => {
  it('descarta lo que no parece una IP', () => {
    expect(ipDelVisitante(new Headers({ 'x-real-ip': '<script>' }))).toBe(VISITANTE_DESCONOCIDO);
    expect(ipDelVisitante(new Headers({ 'x-forwarded-for': ' 190.5.5.5 ,1.1.1.1' }))).toBe(
      '190.5.5.5',
    );
  });
});

// @vitest-environment node
/**
 * El proxy de Next ya no sabe nada de sesiones.
 *
 * Desde el pivote a sitio público no hay cuentas: el proxy era quien leía la
 * cookie `httpOnly`, ponía `Authorization` y renovaba el token. Si alguno de
 * esos trozos vuelve —un refactor que copia del historial, por ejemplo— el
 * proxy empezaría a reenviar al backend lo que el navegador le mande en una
 * cookie o una cabecera. Aquí se fija que:
 *
 *   1. no reenvía cookies ni `Authorization`, aunque el navegador las traiga;
 *   2. no pone cookies en la respuesta;
 *   3. sigue resolviendo AQUÍ las redirecciones internas del backend —sin eso
 *      `/api/v1/tenders/` entraba en bucle— y sólo hacia el mismo backend.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BACKEND = 'http://backend.prueba:8000';

type Llamada = { url: string; init: RequestInit };

async function cargarProxy() {
  vi.resetModules();
  process.env.API_URL = BACKEND;
  return import('@/app/api/proxy/[...ruta]/route');
}

function peticion(ruta: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3000/api/proxy/${ruta}`, init);
}

function ctx(ruta: string) {
  return { params: Promise.resolve({ ruta: ruta.split('/') }) };
}

let llamadas: Llamada[];

function responderCon(...respuestas: Response[]) {
  llamadas = [];
  const cola = [...respuestas];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return cola.shift() ?? new Response('{}', { status: 200 });
    }),
  );
}

beforeEach(() => {
  llamadas = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el proxy reenvía sin sesión', () => {
  it('no pasa cookies ni Authorization al backend', async () => {
    responderCon(new Response('{"items":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const { GET } = await cargarProxy();

    await GET(
      peticion('api/v1/tenders?search=aseo', {
        headers: {
          cookie: 'sesion=robada; refresco=robado',
          authorization: 'Bearer robado',
        },
      }),
      ctx('api/v1/tenders'),
    );

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe(`${BACKEND}/api/v1/tenders?search=aseo`);
    const cabeceras = new Headers(llamadas[0].init.headers);
    expect(cabeceras.get('authorization')).toBeNull();
    expect(cabeceras.get('cookie')).toBeNull();
  });

  it('no pone cookies en la respuesta, ni siquiera ante un 401', async () => {
    responderCon(new Response('{"detail":"x"}', { status: 401 }));
    const { GET } = await cargarProxy();

    const res = await GET(peticion('api/v1/bi/rubros'), ctx('api/v1/bi/rubros'));

    // El 401 llega tal cual: no hay refresco que intentar ni sesión que borrar.
    expect(res.status).toBe(401);
    expect(llamadas).toHaveLength(1);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('el código del proxy no toca cookies', () => {
    // Sin comentarios: el del proxy explica, precisamente, que ya no las toca.
    const codigo = readFileSync(
      join(__dirname, '..', 'app', 'api', 'proxy', '[...ruta]', 'route.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codigo).not.toMatch(/cookies|authorization|next\/headers/i);
  });
});

describe('las redirecciones del backend se siguen aquí', () => {
  it('sigue la 307 de FastAPI hacia el mismo backend', async () => {
    responderCon(
      new Response(null, { status: 307, headers: { location: `${BACKEND}/api/v1/tenders/` } }),
      new Response('{"items":[]}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const { GET } = await cargarProxy();

    const res = await GET(peticion('api/v1/tenders'), ctx('api/v1/tenders'));

    expect(res.status).toBe(200);
    expect(llamadas.map((l) => l.url)).toEqual([
      `${BACKEND}/api/v1/tenders`,
      `${BACKEND}/api/v1/tenders/`,
    ]);
  });

  it('no sigue una redirección hacia otro origen', async () => {
    responderCon(
      new Response(null, { status: 307, headers: { location: 'https://otro.ejemplo/robar' } }),
    );
    const { GET } = await cargarProxy();

    const res = await GET(peticion('api/v1/tenders'), ctx('api/v1/tenders'));

    expect(res.status).toBe(307);
    expect(llamadas).toHaveLength(1);
  });

  it('reenvía el nombre del CSV', async () => {
    responderCon(
      new Response('a;b', {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="precio.csv"',
        },
      }),
    );
    const { GET } = await cargarProxy();

    const res = await GET(peticion('api/v1/bi/exportar/precio/1'), ctx('api/v1/bi/exportar/precio/1'));

    expect(res.headers.get('content-disposition')).toBe('attachment; filename="precio.csv"');
  });
});

// @vitest-environment node
/**
 * El proxy sólo reenvía `GET` a la API versionada.
 *
 * Reenviaba cualquier ruta y cualquier método: `tordo.cl/api/proxy/docs`
 * servía el Swagger del backend en el origen del sitio, y `/mcp`, `/redoc`,
 * `/health/ready` o un `POST` llegaban al backend a través de él. El navegador
 * sólo pide `GET` bajo `/api/v1/` (`lib/api.ts`), así que lo demás da 404 sin
 * tocar el backend, y Next responde 405 a cualquier método que no sea `GET`
 * (o `HEAD`, que arma con el mismo manejador).
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API } from '@/lib/versionApi';

const BACKEND = 'http://backend.prueba:8000';

let pedidas: string[];

async function cargarProxy() {
  vi.resetModules();
  process.env.API_URL = BACKEND;
  return import('@/app/api/proxy/[...ruta]/route');
}

async function pedir(ruta: string[]) {
  const { GET } = await cargarProxy();
  return GET(new NextRequest(`http://localhost:3000/api/proxy/${ruta.join('/')}`), {
    params: Promise.resolve({ ruta }),
  });
}

beforeEach(() => {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidas.push(String(url));
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el proxy sólo llega a la API versionada', () => {
  it('reenvía una ruta bajo la versión de la API', async () => {
    const res = await pedir([...API.split('/').filter(Boolean), 'bi', 'rubros']);
    expect(res.status).toBe(200);
    expect(pedidas).toEqual([`${BACKEND}${API}/bi/rubros`]);
  });

  it.each([
    ['la documentación', ['docs']],
    ['redoc', ['redoc']],
    ['el esquema', ['openapi.json']],
    ['el MCP', ['mcp']],
    ['la salud', ['health', 'ready']],
    ['la versión sola', ['api', 'v1']],
    ['otra versión', ['api', 'v2', 'tenders']],
    ['la versión más adentro', ['x', 'api', 'v1', 'tenders']],
    ['un .. que sale de la versión', ['api', 'v1', '..', '..', 'docs']],
    ['un %2e%2e que el parser trata como ..', ['api', 'v1', '%2e%2e', '%2e%2e', 'docs']],
    ['una barra decodificada en un segmento', ['api', 'v1', '..%2F..', 'docs']],
    ['una barra decodificada', ['api', 'v1', '../../docs']],
    ['una consulta metida en un segmento', ['api', 'v1', 'tenders?x=1']],
  ])('da 404 sin llamar al backend: %s', async (_caso, ruta) => {
    const res = await pedir(ruta);
    expect(res.status).toBe(404);
    expect(pedidas).toEqual([]);
  });

  it('no sigue una redirección del backend fuera de la versión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        pedidas.push(String(url));
        return new Response(null, { status: 307, headers: { location: '/docs' } });
      }),
    );
    const res = await pedir(['api', 'v1', 'tenders']);
    expect(res.status).toBe(307);
    expect(pedidas).toEqual([`${BACKEND}/api/v1/tenders`]);
  });

  it('exporta sólo GET: Next responde 405 a los demás métodos', async () => {
    const modulo: Record<string, unknown> = await cargarProxy();
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(modulo[metodo], metodo).toBeUndefined();
    }
    expect(typeof modulo.GET).toBe('function');
  });
});

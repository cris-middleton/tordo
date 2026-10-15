// @vitest-environment node
/**
 * Lo que `/buscar` pide al backend (`lib/buscarServidor.ts`).
 *
 * Se fija:
 *   1. COMO EL VISITANTE (secreto del proxy + su IP), sin caché y con tiempo
 *      máximo: cada búsqueda cuenta en el límite por IP de quien busca;
 *   2. pocas filas por bloque, y la ficha DESPUÉS de la lista de productos;
 *   3. un bloque que falla —500, 429, sin red, colgado, forma rara— vuelve como
 *      `fallo` y los demás siguen: `buscarTodo` nunca lanza;
 *   4. el término llega recortado a 8 palabras (Compra Ágil no responde 422) y
 *      lo que escribe el visitante no inyecta parámetros.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPRAS_AGILES_EN_BUSCAR, LICITACIONES_EN_BUSCAR, PRODUCTOS_EN_BUSCAR, prepararBusqueda } from '@/lib/buscar';
import { TIEMPO_MAXIMO_BLOQUE_MS, buscarTodo } from '@/lib/buscarServidor';
import { pedirAlBackend } from '@/lib/rssServidor';

import {
  BACKEND,
  DESTACADAS,
  LICITACIONES,
  PRODUCTO,
  PRODUCTOS,
  SECRETO,
  TODO_BIEN,
  colgado,
  json,
  simularBackend,
} from './ayudas/buscarDePrueba';

const VISITANTE = new Headers({ 'x-real-ip': '203.0.113.7' });
const pedidaA = (pedidas: { url: URL }[], ruta: string) => pedidas.find((p) => p.url.pathname === `/api/v1${ruta}`)!;

beforeEach(() => {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.PROXY_SECRETO;
});

describe('pedirAlBackend', () => {
  it('sin tiempoMaximoMs no corta nada (los RSS no cambian)', async () => {
    const pedidas = simularBackend({ '/tenders/': () => json(LICITACIONES) });
    await pedirAlBackend('/tenders/', new URLSearchParams(), VISITANTE);
    expect(pedidas[0].init.signal).toBeUndefined();
    expect(pedidas[0].init.cache).toBe('no-store');
  });
});

describe('buscarTodo', () => {
  it('pide los cuatro bloques como el visitante, sin caché y con tiempo máximo', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    const r = await buscarTodo(prepararBusqueda('guante nitrilo'), VISITANTE);

    expect(pedidas.map((p) => p.url.pathname).sort()).toEqual([
      '/api/v1/compra-agil/destacadas',
      '/api/v1/publico/productos',
      '/api/v1/publico/productos/guante-latex-nitrilo',
      '/api/v1/tenders/',
    ]);
    for (const { url, init } of pedidas) {
      expect(url.origin).toBe(BACKEND);
      const cabeceras = new Headers(init.headers);
      expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
      // Con visitante: el backend lo cuenta en el límite por IP, no lo exime.
      expect(cabeceras.get('X-Tordo-Visitante')).toBe('203.0.113.7');
      expect(init.cache).toBe('no-store');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(r).toEqual({
      productos: { estado: 'ok', datos: PRODUCTOS },
      ficha: { estado: 'ok', datos: PRODUCTO },
      licitaciones: { estado: 'ok', datos: LICITACIONES },
      comprasAgiles: { estado: 'ok', datos: DESTACADAS },
    });
  });

  it('sin cabeceras de IP manda «desconocido», no nada: sin visitante el backend lo eximiría', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    await buscarTodo(prepararBusqueda('guante'), new Headers());
    expect(pedidas.length).toBeGreaterThan(0);
    for (const { init } of pedidas) {
      const cabeceras = new Headers(init.headers);
      expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
      expect(cabeceras.get('X-Tordo-Visitante')).toBe('desconocido');
    }
  });

  it('productos, licitaciones y Compra Ágil están en vuelo a la vez; la ficha espera', async () => {
    const respuestas: Record<string, () => Response> = {
      '/publico/productos': () => json(PRODUCTOS),
      '/tenders/': () => json(LICITACIONES),
      '/compra-agil/destacadas': () => json(DESTACADAS),
      '/publico/productos/guante-latex-nitrilo': () => json(PRODUCTO),
    };
    const liberar: Array<() => void> = [];
    let enVuelo = 0;
    const enVueloAlLlegar: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise<Response>((resolver) => {
            enVuelo += 1;
            enVueloAlLlegar.push(enVuelo);
            const ruta = new URL(url).pathname.replace(/^\/api\/v1/, '');
            liberar.push(() => {
              enVuelo -= 1;
              resolver(respuestas[ruta]());
            });
          }),
      ),
    );

    const busqueda = buscarTodo(prepararBusqueda('guante'), VISITANTE);
    // Deja correr las microtareas: nada se ha resuelto, así que lo que haya
    // pedido está en vuelo. Con peticiones en serie sólo habría una.
    await new Promise((r) => setTimeout(r, 0));
    expect(enVueloAlLlegar).toEqual([1, 2, 3]);
    // Se resuelven las tres primeras; sólo entonces aparece la ficha.
    liberar.splice(0, 3).forEach((f) => f());
    await new Promise((r) => setTimeout(r, 0));
    expect(enVueloAlLlegar).toHaveLength(4);
    liberar.splice(0).forEach((f) => f());
    const r = await busqueda;
    expect(r.ficha?.estado).toBe('ok');
  });

  it('cada bloque pide pocas filas', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    await buscarTodo(prepararBusqueda('guante nitrilo'), VISITANTE);

    const productos = pedidaA(pedidas, '/publico/productos').url.searchParams;
    expect(productos.get('q')).toBe('guante nitrilo');
    expect(productos.get('limite')).toBe(String(PRODUCTOS_EN_BUSCAR));

    const licitaciones = pedidaA(pedidas, '/tenders/').url.searchParams;
    expect(licitaciones.get('limit')).toBe(String(LICITACIONES_EN_BUSCAR));
    expect(licitaciones.get('abiertas')).toBe('true');
    expect(licitaciones.get('search')).toBe('guante nitrilo');

    const destacadas = pedidaA(pedidas, '/compra-agil/destacadas').url.searchParams;
    expect(destacadas.get('limite')).toBe(String(COMPRAS_AGILES_EN_BUSCAR));
    expect(destacadas.get('search')).toBe('guante nitrilo');
  });

  it('la ficha es la del primer producto y va después de la lista', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(pedidas.at(-1)!.url.pathname).toBe('/api/v1/publico/productos/guante-latex-nitrilo');
  });

  it('sin productos no pide ficha', async () => {
    const pedidas = simularBackend({ ...TODO_BIEN, '/publico/productos': () => json([]) });
    const r = await buscarTodo(prepararBusqueda('zafiro'), VISITANTE);
    expect(pedidas).toHaveLength(3);
    expect(r.productos).toEqual({ estado: 'ok', datos: [] });
    expect(r.ficha).toBeNull();
  });

  it('un bloque que falla vuelve como fallo y los demás siguen', async () => {
    simularBackend({ ...TODO_BIEN, '/tenders/': () => json({ detail: 'x' }, 500) });
    const r = await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(r.licitaciones).toEqual({ estado: 'fallo', motivo: 'error' });
    expect(r.productos.estado).toBe('ok');
    expect(r.comprasAgiles.estado).toBe('ok');
    expect(r.ficha?.estado).toBe('ok');
  });

  it('un 429 es el límite por IP, no una caída', async () => {
    simularBackend({ ...TODO_BIEN, '/compra-agil/destacadas': () => json({ detail: 'Demasiadas' }, 429) });
    const r = await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(r.comprasAgiles).toEqual({ estado: 'fallo', motivo: 'limite' });
  });

  it('una respuesta con otra forma es un fallo, no una excepción', async () => {
    simularBackend({
      '/publico/productos': () => json({ detail: 'no es una lista' }),
      '/tenders/': () => json([]),
      '/compra-agil/destacadas': () => new Response('<html>Bad gateway</html>', { status: 200 }),
    });
    const r = await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(r.productos.estado).toBe('fallo');
    expect(r.licitaciones.estado).toBe('fallo');
    expect(r.comprasAgiles.estado).toBe('fallo');
    expect(r.ficha).toBeNull();
  });

  it('una ficha que falla no se lleva la lista de productos', async () => {
    simularBackend({ ...TODO_BIEN, '/publico/productos/guante-latex-nitrilo': () => json({}, 503) });
    const r = await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(r.productos.estado).toBe('ok');
    expect(r.ficha).toEqual({ estado: 'fallo', motivo: 'error' });
  });

  it('un backend colgado no cuelga la búsqueda', async () => {
    simularBackend({ ...TODO_BIEN, '/tenders/': colgado });
    const inicio = Date.now();
    const r = await buscarTodo(prepararBusqueda('guante'), VISITANTE, { tiempoMaximoMs: 30 });
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(r.licitaciones).toEqual({ estado: 'fallo', motivo: 'error' });
    expect(r.productos.estado).toBe('ok');
  });

  it('el tiempo máximo por defecto es de 6 s', () => {
    expect(TIEMPO_MAXIMO_BLOQUE_MS).toBe(6000);
  });

  it('sin red: todo falla y nada lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const r = await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(r.productos.estado).toBe('fallo');
    expect(r.licitaciones.estado).toBe('fallo');
    expect(r.comprasAgiles.estado).toBe('fallo');
    expect(r.ficha).toBeNull();
  });

  it('llega recortado a 8 palabras a los tres bloques', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    await buscarTodo(prepararBusqueda('uno dos tres cuatro cinco seis siete ocho nueve diez'), VISITANTE);
    const ocho = 'uno dos tres cuatro cinco seis siete ocho';
    expect(pedidaA(pedidas, '/compra-agil/destacadas').url.searchParams.get('search')).toBe(ocho);
    expect(pedidaA(pedidas, '/tenders/').url.searchParams.get('search')).toBe(ocho);
    expect(pedidaA(pedidas, '/publico/productos').url.searchParams.get('q')).toBe(ocho);
  });

  it('lo que escribe el visitante no inyecta parámetros', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    await buscarTodo(prepararBusqueda('guante&abiertas=false&limite=50'), VISITANTE);
    const licitaciones = pedidaA(pedidas, '/tenders/').url.searchParams;
    expect(licitaciones.getAll('abiertas')).toEqual(['true']);
    const destacadas = pedidaA(pedidas, '/compra-agil/destacadas').url.searchParams;
    expect(destacadas.getAll('limite')).toEqual([String(COMPRAS_AGILES_EN_BUSCAR)]);
    expect(destacadas.get('search')).toBe('guante&abiertas=false&limite=50');
  });

  it('el slug del primer producto se escapa en la ruta de la ficha', async () => {
    const pedidas = simularBackend({
      ...TODO_BIEN,
      '/publico/productos': () => json([{ slug: '../bi/x?y', firma: 'x', n: 1, indexable: false }]),
    });
    await buscarTodo(prepararBusqueda('guante'), VISITANTE);
    expect(pedidas.at(-1)!.url.pathname).toBe('/api/v1/publico/productos/..%2Fbi%2Fx%3Fy');
  });

  it('con menos de tres letras no se llama: es un error de quien llama', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    await expect(buscarTodo(prepararBusqueda('ab'), VISITANTE)).rejects.toThrow(/menos de tres letras/);
    expect(pedidas).toHaveLength(0);
  });
});

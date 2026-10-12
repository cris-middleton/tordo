/**
 * Las páginas públicas del paso 10: comprador, rubro y producto.
 *
 * Se fija:
 *   1. que se llama al backend como RENDERIZADO DEL SERVIDOR (secreto del
 *      proxy y sin `X-Tordo-Visitante`) y con caché de una semana etiquetada
 *      `analytics` — la que vacía el cron con `/api/revalidar`;
 *   2. 404 del backend → `notFound()`; otro fallo → excepción (no se cachea);
 *   3. metadatos: canonical, y `noindex` cuando el backend dice `indexable: false`;
 *   4. los enlaces entre fichas usan el `slug`/`codigo` que manda el backend.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));
// La sección de Compras Ágiles abiertas se pide en el cliente y tiene sus
// propios tests (`compra-agil-comprador.test.tsx`); aquí, vacía.
vi.mock('@/lib/queries', () => ({
  useCompraAgilDestacadas: () => ({ isPending: false, isError: false, data: { items: [] } }),
}));

import PaginaComprador, { generateMetadata as metaComprador } from '@/app/(publico)/compradores/[codigo]/page';
import PaginaProducto, { generateMetadata as metaProducto } from '@/app/(publico)/productos/[slug]/page';
import PaginaRubro, { generateMetadata as metaRubro } from '@/app/(publico)/rubros/[slug]/page';

import { COMPRADOR, PRODUCTO, RUBRO } from './ayudas/publicoDePrueba';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

let pedidas: { url: string; init: RequestInit }[] = [];

function simularBackend(rutas: Record<string, unknown>, status = 200) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      const ruta = new URL(url).pathname.replace('/api/v1/publico', '');
      if (!(ruta in rutas)) return new Response('{"detail":"No existe"}', { status: 404 });
      return new Response(JSON.stringify(rutas[ruta]), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('llamada al backend', () => {
  it('como renderizado del servidor, con caché de una semana y etiqueta analytics', async () => {
    simularBackend({ '/compradores/7297': COMPRADOR });
    await PaginaComprador(params({ codigo: '7297' }));

    expect(pedidas).toHaveLength(1);
    const { url, init } = pedidas[0];
    expect(url).toBe(`${BACKEND}/api/v1/publico/compradores/7297`);
    const cabeceras = new Headers(init.headers);
    expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
    // Sin visitante: el backend lo toma por un renderizado del servidor y lo exime.
    expect(cabeceras.has('X-Tordo-Visitante')).toBe(false);
    expect(init.next).toEqual({ revalidate: 604800, tags: ['analytics'] });
    expect(init.cache).toBeUndefined();
  });

  it('un 404 del backend es notFound()', async () => {
    simularBackend({});
    await expect(PaginaRubro(params({ slug: 'no-existe' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(metaProducto(params({ slug: 'no-existe' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('otro fallo lanza (y así no se cachea una página rota)', async () => {
    simularBackend({ '/rubros/equipos-medicos': RUBRO }, 500);
    await expect(PaginaRubro(params({ slug: 'equipos-medicos' }))).rejects.toThrow(/500/);
  });

  it('escapa el segmento que viene de la URL', async () => {
    simularBackend({});
    await expect(PaginaProducto(params({ slug: '../bi/x?y' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(pedidas[0].url).toBe(`${BACKEND}/api/v1/publico/productos/..%2Fbi%2Fx%3Fy`);
  });
});

describe('metadatos', () => {
  it('comprador: título con el nombre, cifra en la descripción y canonical', async () => {
    simularBackend({ '/compradores/7297': COMPRADOR });
    const m = await metaComprador(params({ codigo: '7297' }));
    expect(m.title).toMatch(/Hospital de Prueba/);
    expect(m.description).toMatch(/1\.234 órdenes de compra/);
    expect(m.alternates?.canonical).toBe('/compradores/7297');
    expect(m.robots).toBeUndefined();
  });

  it('rubro: monto del año en la descripción', async () => {
    simularBackend({ '/rubros/equipos-medicos': RUBRO });
    const m = await metaRubro(params({ slug: 'equipos-medicos' }));
    expect(m.title).toMatch(/Equipos médicos/);
    expect(m.description).toMatch(/\$320 mil millones en compras públicas en 2025/);
    expect(m.alternates?.canonical).toBe('/rubros/equipos-medicos');
  });

  it('producto: precio mediano de la unidad con más compras', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': PRODUCTO });
    const m = await metaProducto(params({ slug: 'guante-latex-nitrilo' }));
    expect(m.title).toBe('Precio de Guante de nitrilo en compras públicas');
    expect(m.description).toMatch(/precio mediano \$5\.000 por caja \(120 compras\)/);
  });

  it.each([
    ['comprador', '/compradores/7297', { ...COMPRADOR, indexable: false }, () => metaComprador(params({ codigo: '7297' }))],
    ['rubro', '/rubros/equipos-medicos', { ...RUBRO, indexable: false }, () => metaRubro(params({ slug: 'equipos-medicos' }))],
    ['producto', '/productos/guante-latex-nitrilo', { ...PRODUCTO, indexable: false }, () => metaProducto(params({ slug: 'guante-latex-nitrilo' }))],
  ])('%s no indexable → noindex (pero la página existe)', async (_tipo, ruta, cuerpo, pedir) => {
    simularBackend({ [ruta]: cuerpo });
    const m = await pedir();
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates?.canonical).toBe(ruta);
  });
});

describe('enlaces entre fichas', () => {
  it('el comprador enlaza sus rubros por el slug del backend', async () => {
    simularBackend({ '/compradores/7297': COMPRADOR });
    render(await PaginaComprador(params({ codigo: '7297' })));
    expect(screen.getByRole('heading', { level: 1, name: 'Hospital de Prueba' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Equipos médicos' })).toHaveAttribute('href', '/rubros/equipos-medicos');
    expect(screen.getByText('Cancela órdenes con frecuencia')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /compras ágiles abiertas de este comprador/i }),
    ).toBeInTheDocument();
  });

  it('el rubro enlaza a sus compradores y al panel por el NOMBRE', async () => {
    simularBackend({ '/rubros/equipos-medicos': RUBRO });
    render(await PaginaRubro(params({ slug: 'equipos-medicos' })));
    expect(screen.getByRole('link', { name: 'Hospital de Prueba' })).toHaveAttribute('href', '/compradores/7297');
    expect(screen.getByRole('link', { name: /analizar este rubro/i })).toHaveAttribute(
      'href',
      '/dashboard/bi?rubro=Equipos%20m%C3%A9dicos',
    );
  });

  it('el producto pinta una banda por unidad y enlaza a quien lo compra', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': PRODUCTO });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByRole('heading', { name: 'Por caja' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Por unidad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hospital de Prueba' })).toHaveAttribute('href', '/compradores/7297');
    expect(screen.queryByText(/tómalo como una orientación/)).not.toBeInTheDocument();
  });

  it('un producto no indexable avisa en la página', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': { ...PRODUCTO, indexable: false } });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByText(/tómalo como una orientación/)).toBeInTheDocument();
  });
});

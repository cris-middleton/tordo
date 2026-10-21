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
import { render, screen, within } from '@testing-library/react';
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

  it('un slug o un código con otra forma es 404 sin llamar al backend', async () => {
    // La ficha pide exenta del límite por IP: una URL inventada no puede ser
    // una llamada gratis al backend (`lib/parametrosPublicos.ts`).
    simularBackend({});
    await expect(PaginaProducto(params({ slug: '../bi/x?y' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(metaProducto(params({ slug: 'Guante-Latex' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(PaginaRubro(params({ slug: 'a'.repeat(81) }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(metaRubro(params({ slug: 'equipos--medicos' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(PaginaComprador(params({ codigo: 'no-existe' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(metaComprador(params({ codigo: '7297/../x' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(pedidas).toEqual([]);
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
    // La firma, no la categoría del catálogo: miles de productos comparten
    // categoría, y con ella de título serían páginas duplicadas.
    expect(m.title).toBe('Precio de Guante latex nitrilo en compras públicas');
    expect(m.description).toMatch(/^Guante latex nitrilo \(Guante de nitrilo\): /);
    expect(m.description).toMatch(/precio mediano \$5\.000 por caja \(120 compras\)/);
  });

  it('producto con la unidad nula (el backend la permite): la descripción la omite', async () => {
    const sinUnidad = { ...PRODUCTO, unidades: [{ ...PRODUCTO.unidades[0], unidad: null }] };
    simularBackend({ '/productos/guante-latex-nitrilo': sinUnidad });
    const m = await metaProducto(params({ slug: 'guante-latex-nitrilo' }));
    expect(m.description).toMatch(/precio mediano \$5\.000 \(120 compras\)/);
    expect(m.description).not.toMatch(/ por (null|undefined)/);
  });

  it('producto sin categoría: la descripción no deja paréntesis vacíos', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': { ...PRODUCTO, nombre_generico: null } });
    const m = await metaProducto(params({ slug: 'guante-latex-nitrilo' }));
    expect(m.description).toMatch(/^Guante latex nitrilo: /);
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
    // El código del comprador es un identificador: va en mono (§5.1 del rediseño).
    expect(screen.getByText('7297')).toHaveClass('font-mono');
    expect(screen.getByRole('link', { name: 'Equipos médicos' })).toHaveAttribute('href', '/rubros/equipos-medicos');
    expect(screen.getByText('Cancela órdenes con frecuencia')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /compras ágiles abiertas de este comprador/i }),
    ).toBeInTheDocument();
  });

  it('el comprador: nombre legible, Compra Ágil con su ventana y publicadas desde cuándo', async () => {
    simularBackend({ '/compradores/7297': { ...COMPRADOR, nombre: 'HOSPITAL DE LA PRUEBA' } });
    const { container } = render(await PaginaComprador(params({ codigo: '7297' })));
    expect(screen.getByRole('heading', { level: 1, name: 'Hospital de la Prueba' })).toBeInTheDocument();
    expect(screen.getByText('Sus órdenes por Compra Ágil en los últimos 6 meses: cuántas, a cuántos proveedores y de qué monto.')).toBeInTheDocument();
    expect(screen.getByText('Publicadas desde oct 2026')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/UTM|No significa/);
    const m = await metaComprador(params({ codigo: '7297' }));
    expect(String(m.title)).toMatch(/^Hospital de la Prueba/);
  });

  it('el rubro enlaza a sus compradores y a Mercados por el NOMBRE', async () => {
    simularBackend({ '/rubros/equipos-medicos': RUBRO });
    render(await PaginaRubro(params({ slug: 'equipos-medicos' })));
    expect(screen.getByRole('link', { name: 'Hospital de Prueba' })).toHaveAttribute('href', '/compradores/7297');
    expect(screen.getByRole('link', { name: /ver este rubro en mercados/i })).toHaveAttribute(
      'href',
      '/mercado?rubro=Equipos%20m%C3%A9dicos',
    );
  });

  it('el producto se titula por su firma si no hay descripción, con la categoría como contexto', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': PRODUCTO });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByRole('heading', { level: 1, name: 'Guante latex nitrilo' })).toBeInTheDocument();
    expect(screen.getByText(/^Categoría del catálogo:/)).toHaveTextContent(
      'Categoría del catálogo: Guante de nitrilo (código ONU 42132203)',
    );
    // El código es un identificador: va en mono (§5.1 del rediseño).
    expect(screen.getByText('42132203')).toHaveClass('font-mono');
  });

  it('con descripción, el producto se titula como lo escribe el comprador; la firma va al pie', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': { ...PRODUCTO, descripcion: 'GUANTE DE LÁTEX Y NITRILO' } });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByRole('heading', { level: 1, name: 'Guante de látex y nitrilo' })).toBeInTheDocument();
    expect(screen.getByText(/«guante latex nitrilo»/)).toBeInTheDocument();
  });

  it('la ficha dice de qué meses son sus precios, y cada banda de cuántos organismos', async () => {
    const conPeriodo = {
      ...PRODUCTO,
      periodo: { ventana_desde: '2025-04-01', ventana_hasta: '2026-03-31' },
      unidades: [{ ...PRODUCTO.unidades[0], compradores: 31, cuota_mayor: 0.1, de_mercado: true }],
    };
    simularBackend({ '/productos/guante-latex-nitrilo': conPeriodo });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByText(/abr 2025 – mar 2026 \(12 meses\)/)).toBeInTheDocument();
    // La base va en las cifras de la banda, bajo el gráfico.
    expect(screen.getAllByText('120 compras de 31 organismos').length).toBeGreaterThan(0);
  });

  it('el producto pinta una fila por unidad y enlaza a quien lo compra', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': PRODUCTO });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    // Con más de una unidad, una tabla: cada unidad es otro envase.
    expect(screen.getByRole('rowheader', { name: 'Por caja' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Por unidad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hospital de Prueba' })).toHaveAttribute('href', '/compradores/7297');
    expect(screen.queryByText(/úsalo sólo para orientarte/)).not.toBeInTheDocument();
  });

  it('encima de «Quién lo compra», el gráfico de precio de la portada, con su pie de método (spec PORTADA_V7 §6)', async () => {
    const conCompradores = {
      ...PRODUCTO,
      periodo: { ventana_desde: '2025-11-01', ventana_hasta: '2026-10-31' },
      unidades: [{ ...PRODUCTO.unidades[0], compradores: 31, de_mercado: true }, PRODUCTO.unidades[1]],
      compradores: [
        ...PRODUCTO.compradores,
        { codigo: '1', nombre: 'Municipalidad Uno', unidad: 'caja', n: 9, p50: 4100 },
        { codigo: '3', nombre: 'Municipalidad Tres', unidad: 'caja', n: 8, p50: 4500 },
        { codigo: '4', nombre: 'Municipalidad Cuatro', unidad: 'caja', n: 7, p50: 5200 },
        { codigo: '5', nombre: 'Municipalidad Cinco', unidad: 'caja', n: 6, p50: 5900 },
        { codigo: '2', nombre: 'Municipalidad Dos', unidad: 'Unidad', n: 9, p50: 45 },
      ],
    };
    simularBackend({ '/productos/guante-latex-nitrilo': conCompradores });
    const { container } = render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    const titulo = screen.getByRole('heading', { level: 2, name: 'Cuánto se pagó' });
    const seccion = titulo.closest('section') as HTMLElement;
    expect(within(seccion).getByRole('heading', { level: 3 })).toHaveTextContent('Por caja: la mitad se pagó entre $4.000 y $6.000');
    // Un punto por comprador de la unidad de la banda: los de «Unidad» no se comparan.
    expect(seccion.querySelectorAll('svg circle')).toHaveLength(5);
    expect(within(seccion).getByRole('link', { name: 'Cómo se calcula' })).toHaveAttribute(
      'href',
      '/guias/como-leer-una-banda-de-precio#los-cinco-numeros',
    );
    expect(within(seccion).getByRole('link', { name: 'Ver en la API' })).toHaveAttribute(
      'href',
      'https://api.tordo.cl/api/v1/publico/productos/guante-latex-nitrilo',
    );
    expect(seccion).toHaveTextContent('120 compras de 31 compradores, nov 2025 a oct 2026, precio por caja.');
    const quien = screen.getByRole('heading', { level: 2, name: 'Quién lo compra' });
    expect(titulo.compareDocumentPosition(quien) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('una banda con la unidad nula se pinta, con el rótulo de unidad ausente', async () => {
    const sinUnidad = { ...PRODUCTO, unidades: [{ ...PRODUCTO.unidades[0], unidad: null }] };
    simularBackend({ '/productos/guante-latex-nitrilo': sinUnidad });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByRole('heading', { level: 3, name: /^Sin unidad declarada: / })).toBeInTheDocument();
    expect(screen.getAllByText('$5.000').length).toBeGreaterThan(0);
  });

  it('un producto no indexable avisa en la página', async () => {
    simularBackend({ '/productos/guante-latex-nitrilo': { ...PRODUCTO, indexable: false } });
    render(await PaginaProducto(params({ slug: 'guante-latex-nitrilo' })));
    expect(screen.getByText(/úsalo sólo para orientarte/)).toBeInTheDocument();
  });
});

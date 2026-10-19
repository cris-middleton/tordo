/**
 * La página `/buscar?q=` (spec del rediseño §6.4).
 *
 * Se fija:
 *   1. con menos de tres letras —o sin `q`— no se llama al backend;
 *   2. con término: los tres bloques, en el orden de la spec, y el formulario
 *      arriba con el término puesto;
 *   3. un bloque que falla se oculta con su línea y los demás se pintan;
 *   4. «no encontramos nada» sólo cuando los tres respondieron vacíos, con los
 *      ejemplos; con alguno caído no se dice;
 *   5. el aviso del recorte a 8 palabras;
 *   6. `noindex` por metadatos.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.7' }),
}));

import PaginaBuscar, { generateMetadata } from '@/app/(publico)/buscar/page';
import { EJEMPLOS_BUSQUEDA, rutaBuscar } from '@/lib/buscar';

import { BACKEND, DESTACADAS, SECRETO, TODO_BIEN, json, simularBackend } from './ayudas/buscarDePrueba';

type SearchParams = Record<string, string | string[] | undefined>;
const props = (q?: string | string[]) => ({
  searchParams: Promise.resolve<SearchParams>(q === undefined ? {} : { q }),
});

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

describe('sin búsqueda', () => {
  it('sin q: el formulario y los ejemplos, sin llamar al backend', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    render(await PaginaBuscar(props()));
    expect(pedidas).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué le vendes al Estado?' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
    const ejemplos = screen.getByRole('list', { name: /ejemplos/i });
    expect(within(ejemplos).getAllByRole('link')).toHaveLength(EJEMPLOS_BUSQUEDA.length);
  });

  it('el placeholder sale de los ejemplos, no de una lista aparte', async () => {
    simularBackend(TODO_BIEN);
    render(await PaginaBuscar(props()));
    const ayuda = screen.getByRole('searchbox').getAttribute('placeholder')!;
    for (const ejemplo of EJEMPLOS_BUSQUEDA.slice(0, 3)) expect(ayuda).toContain(ejemplo);
  });

  it('con menos de tres letras lo dice y no llama al backend', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    render(await PaginaBuscar(props('ab')));
    expect(pedidas).toHaveLength(0);
    expect(screen.getByText('Escribe al menos tres letras.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('ab');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });
});

describe('con búsqueda', () => {
  it('los tres bloques en el orden de la spec, con el término arriba', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    render(await PaginaBuscar(props('guante nitrilo')));
    expect(pedidas).toHaveLength(4);
    expect(screen.getByRole('heading', { level: 1, name: 'Resultados para «guante nitrilo»' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('guante nitrilo');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Cuánto ha pagado el Estado',
      'Qué está abierto ahora',
      'Quién lo compra',
    ]);
    expect(screen.queryByText(/no encontramos nada/i)).toBeNull();
  });

  it('con dos q en la URL busca la primera', async () => {
    const pedidas = simularBackend(TODO_BIEN);
    render(await PaginaBuscar(props(['guante', 'tóner'])));
    expect(pedidas.find((p) => p.url.pathname === '/api/v1/publico/productos')!.url.searchParams.get('q')).toBe('guante');
  });

  it('un bloque que falla se oculta con su línea; los demás se pintan', async () => {
    simularBackend({ ...TODO_BIEN, '/tenders/': () => json({ detail: 'x' }, 500) });
    render(await PaginaBuscar(props('guante nitrilo')));
    expect(screen.getByText(/no pudimos consultar las licitaciones abiertas/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /licitaciones abiertas/i })).toBeNull();
    // La banda de precio sigue pintada: lo que falló fue otro bloque.
    expect(screen.getByText(/^Por caja: la mitad se pagó/)).toBeInTheDocument();
    // Las Compras Ágiles se pintan aunque las licitaciones hayan fallado (la banda
    // de precio también es un <article>: se cuenta sólo dentro de su lista).
    const compras = screen.getByRole('list', { name: /compras ágiles abiertas/i });
    expect(within(compras).getAllByRole('article')).toHaveLength(DESTACADAS.items.length);
    expect(screen.getByRole('link', { name: 'Guante latex nitrilo' })).toBeInTheDocument();
  });

  it('sin resultados en ninguno: lo dice y ofrece los ejemplos', async () => {
    simularBackend({
      '/publico/productos': () => json([]),
      '/tenders/': () => json({ items: [], total: 0, page: 1, size: 5, pages: 0 }),
      '/compra-agil/destacadas': () => json({ ...DESTACADAS, items: [] }),
    });
    render(await PaginaBuscar(props('xqzwvk')));
    expect(screen.getByText(/no encontramos nada para «xqzwvk»/i)).toBeInTheDocument();
    const ejemplos = screen.getByRole('list', { name: /ejemplos/i });
    expect(within(ejemplos).getAllByRole('link')[0]).toHaveAttribute('href', rutaBuscar(EJEMPLOS_BUSQUEDA[0]));
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('con todo caído no dice «no encontramos nada»: dice que no pudo', async () => {
    simularBackend({});
    render(await PaginaBuscar(props('guante')));
    expect(screen.queryByText(/no encontramos nada/i)).toBeNull();
    expect(screen.getByText(/no pudimos consultar los precios/i)).toBeInTheDocument();
    expect(screen.getByText(/no pudimos consultar las licitaciones abiertas/i)).toBeInTheDocument();
    expect(screen.getByText(/no pudimos consultar las compras ágiles abiertas/i)).toBeInTheDocument();
    // Sin producto no hay ficha que pedir: el bloque de compradores no existe.
    expect(screen.queryByRole('heading', { level: 2, name: 'Quién lo compra' })).toBeNull();
  });

  it('avisa del recorte a 8 palabras', async () => {
    simularBackend(TODO_BIEN);
    render(await PaginaBuscar(props('uno dos tres cuatro cinco seis siete ocho nueve diez')));
    expect(screen.getByText(/buscamos sólo las primeras 8 palabras/i)).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('uno dos tres cuatro cinco seis siete ocho');
  });
});

describe('metadatos', () => {
  it('noindex siempre, con el término en el título', async () => {
    const con = await generateMetadata(props('resma'));
    expect(con.title).toBe('Buscar «resma»');
    expect(con.robots).toEqual({ index: false, follow: true });
    const sin = await generateMetadata(props());
    expect(sin.title).toBe('Buscar');
    expect(sin.robots).toEqual({ index: false, follow: true });
  });

  it('el término no llega a las tarjetas de vista previa (ignoran noindex)', async () => {
    const meta = await generateMetadata(props('<b>oferta</b> falsa'));
    expect(meta.title).toBe('Buscar «<b>oferta</b> falsa»');
    expect(meta.openGraph?.title).toBe('Buscar');
    expect(meta.twitter?.title).toBe('Buscar');
    expect(JSON.stringify([meta.description, meta.openGraph, meta.twitter])).not.toContain('oferta');
  });
});

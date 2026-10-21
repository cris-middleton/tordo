/**
 * La pantalla del catálogo ante lo que no es «una lista con resultados»:
 *   1. un error de la API se dice y se reintenta (antes: «0 resultados»);
 *   2. una página que ya no existe ofrece volver a la primera;
 *   3. los montos se escriben como en Chile;
 *   4. un término repetido no hace un chip repetido.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { instalarAlmacenDePrueba } from './ayudas/almacenDePrueba';

let urlInicial = new URLSearchParams();
const pedidas: Record<string, unknown>[] = [];
const refetch = vi.fn();
let respuesta: Record<string, unknown> = {};

vi.mock('next/navigation', () => ({
  useSearchParams: () => urlInicial,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/licitaciones',
}));

vi.mock('@/lib/queries', () => ({
  useLicitaciones: (params: Record<string, unknown>) => {
    pedidas.push(params);
    return { refetch, isFetching: false, ...respuesta };
  },
}));

async function montar() {
  const { default: TendersPage } = await import('@/app/(panel)/licitaciones/page');
  return render(<TendersPage />);
}

beforeEach(() => {
  instalarAlmacenDePrueba();
  pedidas.length = 0;
  refetch.mockClear();
  urlInicial = new URLSearchParams();
  respuesta = { data: { items: [], total: 0, pages: 1 }, isError: false };
  vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('catálogo', () => {
  it('un error de la API se dice y se reintenta, sin «0 resultados»', async () => {
    respuesta = {
      data: undefined,
      isError: true,
      error: { response: { status: 429 } },
    };
    await montar();
    expect(screen.getByRole('alert')).toHaveTextContent(/espera un momento/i);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText(/no hay licitaciones con estos filtros/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('una página que ya no existe ofrece ir a la primera', async () => {
    urlInicial = new URLSearchParams('search=mesa&page=40');
    respuesta = { data: { items: [], total: 35, pages: 2 }, isError: false };
    await montar();
    expect(pedidas.at(-1)!.offset).toBe(39 * 20);
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la página 1' }));
    expect(pedidas.at(-1)!.offset).toBe(0);
  });

  it('«5.000.000» en el monto mínimo son cinco millones', async () => {
    await montar();
    const campo = screen.getByLabelText('Monto mínimo, en pesos');
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(campo, { target: { value: '5.000.000' } });
    expect(pedidas.at(-1)!.min_amount).toBe(5_000_000);
    expect(campo).toHaveValue('5.000.000');
  });

  it('un término repetido no hace un chip repetido, y más de ocho palabras se avisan', async () => {
    await montar();
    const buscador = screen.getByPlaceholderText(/Producto o comprador/i);
    fireEvent.change(buscador, { target: { value: 'mesa Mesa' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    expect(screen.getAllByRole('button', { name: /^Quitar/ })).toHaveLength(1);
    expect(pedidas.at(-1)!.search).toBe('mesa');

    fireEvent.change(buscador, { target: { value: 'a b c d e f g h i' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    expect(String(pedidas.at(-1)!.search).split(' ')).toHaveLength(8);
    expect(screen.getByRole('status')).toHaveTextContent(/hasta 8 palabras/);
  });

  it('el buscador corta en 100 caracteres, como la API', async () => {
    await montar();
    expect(screen.getByPlaceholderText(/Producto o comprador/i)).toHaveAttribute('maxlength', '100');
  });
});

/**
 * La pantalla del catálogo ante lo que no es «una lista con resultados»:
 *   1. un error de la API se dice y se reintenta (antes: «0 resultados»);
 *   2. una página que ya no existe ofrece volver a la primera;
 *   3. los montos se escriben como en Chile;
 *   4. un término repetido no hace un chip repetido;
 *   5. un monto se pide al dejar de teclear, no en cada tecla;
 *   6. «Borrar filtros» borra los filtros, no sólo la búsqueda;
 *   7. cambiar de página vuelve al principio de la lista;
 *   8. sin resultados, «¿Quisiste decir…?» cambia las palabras por las sugeridas.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

let sugerencia: string | null = null;
const sugerenciasPedidas: Array<[string, boolean]> = [];

vi.mock('@/lib/queries', () => ({
  useLicitaciones: (params: Record<string, unknown>) => {
    pedidas.push(params);
    return { refetch, isFetching: false, ...respuesta };
  },
  useSugerencia: (texto: string, habilitada: boolean) => {
    sugerenciasPedidas.push([texto, habilitada]);
    return habilitada ? sugerencia : null;
  },
}));

async function montar() {
  const { default: TendersPage } = await import('@/app/(panel)/licitaciones/page');
  return render(<TendersPage />);
}

beforeEach(() => {
  instalarAlmacenDePrueba();
  pedidas.length = 0;
  sugerencia = null;
  sugerenciasPedidas.length = 0;
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
    await waitFor(() => expect(pedidas.at(-1)!.min_amount).toBe(5_000_000));
    expect(campo).toHaveValue('5.000.000');
  });

  it('un monto se pide cuando deja de cambiar, no en cada tecla', async () => {
    vi.useFakeTimers();
    try {
      await montar();
      const campo = screen.getByLabelText('Monto mínimo, en pesos');
      for (const valor of ['1', '10', '100', '1.000', '10.000', '100.000', '1.000.000']) {
        fireEvent.change(campo, { target: { value: valor } });
        act(() => vi.advanceTimersByTime(100));
      }
      // El campo y la URL cambian al teclear; la consulta todavía no.
      expect(campo).toHaveValue('1.000.000');
      expect(pedidas.some((p) => p.min_amount !== undefined)).toBe(false);
      act(() => vi.advanceTimersByTime(500));
      expect(new Set(pedidas.map((p) => p.min_amount).filter((m) => m !== undefined))).toEqual(
        new Set([1_000_000]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('«Borrar filtros» quita la búsqueda y los filtros, y sale también sin búsqueda', async () => {
    urlInicial = new URLSearchParams(
      'estado=Publicada&tipo_convocatoria=compra_agil&region=Región+del+Biobío&min_amount=1000&max_amount=9000&abiertas=1',
    );
    await montar();
    expect(pedidas.at(-1)).toMatchObject({ estado: 'Publicada', tipo_convocatoria: 'compra_agil', min_amount: 1000 });
    fireEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }));
    await waitFor(() => expect(pedidas.at(-1)!.min_amount).toBeUndefined());
    const ultima = pedidas.at(-1)!;
    for (const filtro of ['estado', 'tipo_convocatoria', 'region', 'min_amount', 'max_amount', 'search']) {
      expect(ultima[filtro]).toBeUndefined();
    }
    // «Sólo abiertas» no es un filtro de esos: se queda como estaba.
    expect(ultima.abiertas).toBe(true);
    expect(screen.getByLabelText('Estado')).toHaveValue('');
    expect(screen.getByLabelText('Monto mínimo, en pesos')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Borrar filtros' })).not.toBeInTheDocument();
  });

  it('cambiar de página vuelve al principio de la lista', async () => {
    respuesta = {
      data: {
        items: [{ id: 1, codigo_externo: '1-1-LE26', nombre: 'Una', estado: 'Publicada' }],
        total: 60,
        pages: 3,
      },
      isError: false,
    };
    const subir = vi.fn();
    Element.prototype.scrollIntoView = subir;
    // La lista ya quedó arriba, fuera de la pantalla: se ha bajado hasta «Siguiente».
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: -900 } as DOMRect);
    try {
      await montar();
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      expect(pedidas.at(-1)!.offset).toBe(20);
      expect(subir).toHaveBeenCalledWith({ block: 'start' });
    } finally {
      // jsdom no lo trae: se quita para no dejárselo a los demás tests.
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
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

describe('«¿Quisiste decir…?»', () => {
  it('sin resultados propone la búsqueda corregida y pulsarla la busca, con los filtros', async () => {
    urlInicial = new URLSearchParams('search=computdor&region=Región de Los Lagos');
    respuesta = { data: { items: [], total: 0, pages: 1 }, isError: false, isSuccess: true };
    sugerencia = 'computador';
    await montar();
    fireEvent.click(screen.getByRole('button', { name: '«computador»' }));
    await waitFor(() => expect(pedidas.at(-1)!.search).toBe('computador'));
    expect(pedidas.at(-1)!.region).toBe('Región de Los Lagos');
  });

  it('con resultados, o sin palabras, no la pide', async () => {
    urlInicial = new URLSearchParams('search=mesa');
    respuesta = { data: { items: [], total: 35, pages: 2 }, isError: false, isSuccess: true };
    sugerencia = 'mesas';
    await montar();
    expect(sugerenciasPedidas.every(([, habilitada]) => !habilitada)).toBe(true);
    expect(screen.queryByText(/quisiste decir/i)).toBeNull();
  });
});

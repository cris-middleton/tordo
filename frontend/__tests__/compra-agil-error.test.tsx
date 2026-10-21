/**
 * `/compra-agil` ante un fallo de la API: se dice qué pasó y se reintenta. Y la
 * búsqueda no pasa de las cotas de la API (con más de ocho palabras, 422).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let urlInicial = new URLSearchParams();
const pedidas: { search?: string }[] = [];
const refetch = vi.fn();
let estado: Record<string, unknown> = {};

vi.mock('next/navigation', () => ({
  useSearchParams: () => urlInicial,
}));

vi.mock('@/hooks/useAhora', () => ({ useAhora: () => null }));

vi.mock('@/lib/queries', () => ({
  useCompraAgilDestacadas: (params: { search?: string }) => {
    pedidas.push(params);
    return { refetch, isFetching: false, isPending: false, ...estado };
  },
}));

async function montar() {
  const { default: CompraAgilPage } = await import('@/app/(panel)/compra-agil/page');
  return render(<CompraAgilPage />);
}

beforeEach(() => {
  pedidas.length = 0;
  refetch.mockClear();
  urlInicial = new URLSearchParams();
  estado = { isError: false, data: { actualizado_en: null, historia_disponible: false, ventana_desde: null, ventana_hasta: null, items: [] } };
});

describe('/compra-agil', () => {
  it('un fallo se dice y se reintenta', async () => {
    estado = { isError: true, error: { response: { status: 502 } }, data: undefined };
    await montar();
    expect(screen.getByRole('alert')).toHaveTextContent(/no pudimos cargar las compras ágiles/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('la búsqueda queda dentro de las cotas de la API', async () => {
    urlInicial = new URLSearchParams({ search: 'a b c d e f g h i j' });
    await montar();
    expect(pedidas.at(-1)!.search!.split(' ')).toHaveLength(8);
    const campo = screen.getByRole('searchbox', { name: /buscar en las compras ágiles/i });
    expect(campo).toHaveAttribute('maxlength', '100');
    fireEvent.change(campo, { target: { value: 'uno dos tres cuatro cinco seis siete ocho nueve' } });
    fireEvent.submit(campo.closest('form')!);
    expect(pedidas.at(-1)!.search).toBe('uno dos tres cuatro cinco seis siete ocho');
  });
});

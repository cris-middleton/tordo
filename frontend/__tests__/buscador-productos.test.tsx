/**
 * El buscador de `/productos`: la puerta a las fichas de producto que no están
 * en el sitemap.
 *
 * Se fija:
 *   1. el retardo — no se busca con cada tecla, sólo cuando el texto se queda
 *      quieto, y nunca con menos de tres (la búsqueda del backend ignora
 *      las palabras más cortas, así que dos letras nunca encuentran nada);
 *   2. que cada resultado enlaza por el `slug` del backend, indexable o no;
 *   3. los estados sin resultados y con error, en una línea y sin caja de error.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BuscadorProductos } from '@/components/publico/BuscadorProductos';

let estado: { isPending: boolean; isError: boolean; data?: unknown };
const pedidas: string[] = [];

vi.mock('@/lib/queries', () => ({
  MINIMO_BUSQUEDA_PRODUCTOS: 3,
  useBuscarProductosPublicos: (texto: string) => {
    pedidas.push(texto);
    return estado;
  },
}));

const RESULTADOS = [
  { slug: 'guante-latex-nitrilo', firma: 'guante latex nitrilo', n: 120, indexable: true },
  { slug: 'guante-quirurgico-raro', firma: 'guante quirurgico raro', n: 3, indexable: false },
];

beforeEach(() => {
  vi.useFakeTimers();
  pedidas.length = 0;
  estado = { isPending: false, isError: false, data: RESULTADOS };
});
afterEach(() => {
  vi.useRealTimers();
});

function escribir(texto: string) {
  fireEvent.change(screen.getByLabelText(/buscar un producto/i), { target: { value: texto } });
}

describe('buscador de productos', () => {
  it('espera a que el texto se quede quieto antes de buscar', () => {
    render(<BuscadorProductos />);
    escribir('gu');
    escribir('guan');
    escribir('guante');
    expect(pedidas.at(-1)).toBe('');
    act(() => vi.advanceTimersByTime(300));
    expect(pedidas.at(-1)).toBe('guante');
    expect(pedidas).not.toContain('gu');
    expect(pedidas).not.toContain('guan');
  });

  it('con menos de tres letras pide escribir más, sin resultados', () => {
    render(<BuscadorProductos />);
    escribir('pc');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/al menos tres letras/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('enlaza cada producto por su slug, también los no indexables', () => {
    render(<BuscadorProductos />);
    escribir('guante');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('link', { name: /guante latex nitrilo/ })).toHaveAttribute(
      'href',
      '/productos/guante-latex-nitrilo',
    );
    const raro = screen.getByRole('link', { name: /guante quirurgico raro/ });
    expect(raro).toHaveAttribute('href', '/productos/guante-quirurgico-raro');
    expect(raro).toHaveTextContent(/orientativo/);
  });

  it('sin resultados lo dice', () => {
    estado = { isPending: false, isError: false, data: [] };
    render(<BuscadorProductos />);
    escribir('xyzzy');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/ningún producto coincide con «xyzzy»/i)).toBeInTheDocument();
    expect(screen.getByText(/menos de tres letras y los números no cuentan/i)).toBeInTheDocument();
  });

  it('un error es una línea, no una caja', () => {
    estado = { isPending: false, isError: true };
    render(<BuscadorProductos />);
    escribir('guante');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/no pudimos buscar ahora/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

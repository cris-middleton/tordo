/**
 * «En qué meses compra» en la ficha pública del comprador (`MesesDeCompra`).
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MesesDeCompra } from '@/components/publico/MesesDeCompra';

const meses = (compras: number[]) => compras.map((c, i) => ({ mes: i + 1, compras: c }));

describe('MesesDeCompra', () => {
  it('doce columnas con su parte, y la frase nombra los meses que se pintan', () => {
    render(<MesesDeCompra meses={meses([0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 5, 0])} />);
    expect(screen.getByText('Compra sobre todo en marzo y noviembre.')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Parte de sus órdenes en cada mes' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(12);
    expect(within(lista).getByText('89 %')).toBeInTheDocument();
  });

  it('parejo todo el año no pinta ningún mes en el color del dato', () => {
    const { container } = render(<MesesDeCompra meses={meses(Array(12).fill(10))} />);
    expect(screen.getByText('Compra parejo todo el año.')).toBeInTheDocument();
    expect(container.querySelectorAll('.bg-dato')).toHaveLength(0);
  });

  it('sin el dato (una API anterior) o sin órdenes, no pinta nada', () => {
    for (const valor of [undefined, null, meses(Array(12).fill(0)), meses([1, 2])]) {
      const { container, unmount } = render(<MesesDeCompra meses={valor} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

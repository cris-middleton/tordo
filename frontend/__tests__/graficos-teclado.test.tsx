import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Concentracion } from '@/components/graficos/Concentracion';
import { lecturaConcentracion } from '@/lib/lecturasMercado';

/** Lo que se lee al pasar el mouse por un gráfico también se lee con el teclado. */

const DATOS = lecturaConcentracion(
  {
    gasto_mensual: null,
    concentracion: {
      mercados: 100,
      sobre_la_mitad: 40,
      un_proveedor: 5,
      monto_total: 1e12,
      monto_sobre_la_mitad: 5e11,
      tramos: Array.from({ length: 10 }, (_, i) => ({ desde: i * 10, hasta: i * 10 + 10, mercados: 10, monto: 1e11 })),
    },
  },
  null,
)!.grafico;

describe('recorrer un gráfico con el teclado', () => {
  it('las flechas abren el globo de cada tramo, lo anuncian y Escape lo cierra', () => {
    const { container } = render(<Concentracion datos={DATOS} />);
    const grupo = screen.getByRole('group', { name: /recórrelos con las flechas/ });
    expect(grupo).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(grupo, { key: 'ArrowRight' });
    expect(container.querySelector('[data-globo]')).not.toBeNull();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toMatch(/^Entre 0 % y 10 %/);
    fireEvent.keyDown(grupo, { key: 'End' });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toMatch(/^Entre 90 % y 100 %/);
    fireEvent.keyDown(grupo, { key: 'Escape' });
    expect(container.querySelector('[data-globo]')).toBeNull();
  });
});

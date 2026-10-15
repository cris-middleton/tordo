/**
 * La cáscara única: el enlace «Saltar al contenido» es lo primero que alcanza el
 * teclado, y el `<main>` que recibe el salto puede tomar el foco.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Cascara } from '@/components/cascara/Cascara';

vi.mock('next/navigation', () => ({ usePathname: () => '/licitaciones' }));

const FOCALIZABLES = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

describe('la cáscara', () => {
  it('«Saltar al contenido» (#contenido) es el primer elemento enfocable', () => {
    const { container } = render(<Cascara>contenido</Cascara>);
    const primero = container.querySelector(FOCALIZABLES);
    expect(primero).toBe(screen.getByRole('link', { name: 'Saltar al contenido' }));
    expect(primero).toHaveAttribute('href', '#contenido');
  });

  it('el destino del salto es el <main> y acepta foco programático', () => {
    render(<Cascara>contenido</Cascara>);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'contenido');
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});

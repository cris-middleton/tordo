/**
 * «Copiar enlace» en `/mercado` lleva el rubro que se ve, y un portapapeles que
 * falla se dice: antes no pasaba nada y parecía copiado.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RubroMostrado, ShareMenu } from '@/app/(panel)/mercado/components/ShareMenu';

function montar() {
  render(
    <RubroMostrado value="Aseo">
      <ShareMenu targetRef={createRef<HTMLElement>()} summaryText="Resumen" filename="prueba" />
    </RubroMostrado>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
}

describe('ShareMenu', () => {
  it('el enlace copiado lleva el rubro mostrado', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    montar();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar enlace/i }));
    });
    expect(new URL(writeText.mock.calls[0][0]).searchParams.get('rubro')).toBe('Aseo');
    expect(screen.getByText('Copiado')).toBeInTheDocument();
  });

  it('si no se puede copiar, lo dice', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('sin permiso'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    montar();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar enlace/i }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo copiar.');
  });
});

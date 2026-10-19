import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BuyerProfilePanel } from '@/components/BuyerProfilePanel';

describe('la nota del comprador', () => {
  it('viene de 0 a 1 y se lee de 0 a 10 («0,9/10» era un 9,1)', () => {
    render(<BuyerProfilePanel comprador={{ disponible: true, buyer_score: 0.914, tasa_adjudicacion: 0.6 }} />);
    expect(screen.getByText('9,1 de 10')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('no juzga con colores ni con etiquetas como «Opaco» o «excelente»', () => {
    const { container } = render(
      <BuyerProfilePanel
        comprador={{ disponible: true, buyer_score: 0.3, transparencia: { clasificacion: 'opaco', pct_trato_directo: 0.6 } }}
      />,
    );
    expect(container.textContent).not.toMatch(/opaco|excelente|muy abierto/i);
    expect(container.innerHTML).not.toMatch(/text-(danger|gold|accent)/);
  });
});

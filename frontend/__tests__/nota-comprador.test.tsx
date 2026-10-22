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

  // «Tiene 2 señales de alerta» no decía cuáles. El panel de una licitación sólo
  // trae cuántas: enlaza a la ficha, que las nombra; la ficha no la repite.
  describe('las señales del historial', () => {
    const conSenales = { disponible: true, buyer_score: 0.5, n_flags: 2 };

    it('en una licitación, enlaza a la ficha del comprador, donde se nombran', () => {
      render(<BuyerProfilePanel comprador={conSenales} senales={{ enlace: '/compradores/123' }} />);
      expect(screen.getByRole('link', { name: 'cuáles son, en su ficha' })).toHaveAttribute('href', '/compradores/123');
      expect(screen.getByText(/Su historial tiene 2 señales/)).toBeInTheDocument();
    });

    it('en la ficha del comprador no se cuentan: la lista va justo debajo', () => {
      const { container } = render(<BuyerProfilePanel comprador={conSenales} senales="ocultar" />);
      expect(container.textContent).not.toMatch(/señal/);
    });
  });
});

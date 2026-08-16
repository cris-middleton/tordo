/**
 * La pantalla de recuperación.
 *
 * Lo que se fija aquí es lo que se pierde en un rediseño sin que nada falle:
 * que la respuesta sea la MISMA se conozca o no el correo. Si alguien "mejora"
 * el mensaje para decir «ese correo no está registrado», el backend deja de ser
 * el que decide y vuelve el oráculo de cuentas.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RecuperarPage from '@/app/recuperar/page';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiClient: { solicitarRecuperacion: vi.fn() },
}));

describe('recuperar contraseña', () => {
  it('muestra el mismo mensaje aunque el correo no exista', async () => {
    vi.mocked(apiClient.solicitarRecuperacion).mockResolvedValue({
      message: 'Si ese correo tiene una cuenta, te enviamos un enlace.',
    });

    render(<RecuperarPage />);
    await userEvent.type(screen.getByLabelText(/correo/i), 'nadie@example.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    await waitFor(() => {
      expect(screen.getByText(/si ese correo tiene una cuenta/i)).toBeInTheDocument();
    });
  });

  it('no revela el resultado antes de enviar', () => {
    render(<RecuperarPage />);
    expect(screen.queryByText(/si ese correo tiene una cuenta/i)).not.toBeInTheDocument();
  });
});

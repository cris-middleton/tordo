/**
 * `/restablecer` redirige a `/login?restablecida=1` tras un cambio de
 * contraseña exitoso. Ese parámetro sólo sirve si algo en login lo lee: fija
 * aquí que el mensaje de confirmación aparece con el parámetro y que login no
 * muestra nada por su cuenta cuando no viene (la mitad que faltaba: sin ella,
 * un componente que muestre el mensaje siempre pasaría igual el primer caso).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import LoginPage from '@/app/login/page';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: false,
    loading: false,
  }),
}));

let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => params,
}));

describe('login — confirmación tras restablecer contraseña', () => {
  beforeEach(() => {
    params = new URLSearchParams();
  });

  it('muestra la confirmación cuando llega de /restablecer', () => {
    params = new URLSearchParams('restablecida=1');
    render(<LoginPage />);
    expect(screen.getByText(/contraseña actualizada\. entra con la nueva/i)).toBeInTheDocument();
  });

  it('no muestra nada en un login sin ese parámetro', () => {
    render(<LoginPage />);
    expect(screen.queryByText(/contraseña actualizada/i)).not.toBeInTheDocument();
  });
});

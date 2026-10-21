/**
 * /mercado nunca se queda con un spinner indefinido (spec del rediseño §8.2).
 *
 * Con la API caída, la pantalla se quedó más de 30 s girando y después se pintó
 * vacía, como si el rubro no tuviera datos. Cada sección que falla dice ahora
 * qué pasó y ofrece reintentar; el resto se pinta igual.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BIPage from '@/app/(panel)/mercado/page';

import { instalarAlmacenDePrueba } from './ayudas/almacenDePrueba';

type Estado = {
  data?: unknown;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const bien = (data: unknown): Estado => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
});

const mal = (error: unknown): Estado => ({
  data: undefined,
  error,
  isPending: false,
  isError: true,
  isFetching: false,
  refetch: vi.fn(async () => undefined),
});

const railway502 = {
  response: { status: 502, data: { status: 'error', code: 502, message: 'Application failed to respond' } },
};
const apagado503 = { response: { status: 503, data: { detail: 'El módulo de analítica no está activo.' } } };

const estados: Record<string, Estado> = {};

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('rubro=Aseo'),
}));

vi.mock('@/lib/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useBIRubros: () => estados.rubros,
  useBIPanorama: () => estados.panorama,
  useBIOportunidades: () => estados.oportunidades,
  useBITendencia: () => estados.tendencia,
  useBIResumen: () => estados.resumen,
  useSectores: () => ({ data: undefined, isFetching: false }),
}));

// Lo que quede de consultas reales no sale a la red.
vi.mock('@/lib/api', () => ({
  apiClient: new Proxy({}, { get: () => () => new Promise(() => {}) }),
}));

function pintar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <BIPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // `SectorOverview` lee localStorage al montar; el de Node ≥22 no es fiable.
  instalarAlmacenDePrueba();
  estados.rubros = bien({ disponible: true, rubros: ['Aseo'] });
  estados.panorama = bien(undefined);
  estados.oportunidades = bien({ disponible: true, oportunidades: [] });
  estados.tendencia = bien({ disponible: true, tendencias: [], emergentes: [] });
  estados.resumen = bien(null);
});

describe('/mercado con la API fallando', () => {
  it('si /bi/rubros falla, lo dice, ofrece reintentar y no gira', () => {
    estados.rubros = mal(railway502);
    const { container } = pintar();

    expect(screen.getByText(/no pudimos cargar los rubros/i)).toBeInTheDocument();
    expect(screen.getByText(/no respondió/i)).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(estados.rubros.refetch).toHaveBeenCalledTimes(1);
  });

  it('si /bi/tendencia falla, esa sección lo dice y el resto se pinta', () => {
    estados.tendencia = mal(railway502);
    pintar();

    expect(screen.getByText(/no pudimos cargar las tendencias/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^mercados$/i })).toBeInTheDocument();
    expect(screen.queryByText(/no pudimos cargar los rubros/i)).not.toBeInTheDocument();
  });

  it('mientras «Reintentar» está en vuelo, el botón lo dice y no se puede repetir', () => {
    estados.tendencia = { ...mal(railway502), isFetching: true };
    pintar();

    const boton = screen.getByRole('button', { name: /reintentando/i });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(estados.tendencia.refetch).not.toHaveBeenCalled();
  });

  it('un tiempo agotado en oportunidades se explica como tal', () => {
    estados.oportunidades = mal({ code: 'ECONNABORTED' });
    pintar();

    expect(screen.getByText(/no pudimos cargar los compradores del rubro/i)).toBeInTheDocument();
    expect(screen.getByText(/tardó demasiado/i)).toBeInTheDocument();
  });

  it('si el panorama falla, se dice en su sitio', () => {
    estados.panorama = mal(railway502);
    pintar();

    expect(screen.getByText(/no pudimos cargar el panorama/i)).toBeInTheDocument();
  });

  it('con el BI apagado (503) se conserva «todavía no está disponible»', () => {
    estados.rubros = mal(apagado503);
    estados.oportunidades = mal(apagado503);
    pintar();

    expect(screen.getByText(/esto todavía no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/no pudimos cargar/i)).not.toBeInTheDocument();
  });

  it('un 503 sólo en /bi/rubros también es «no disponible», no «reintenta»', () => {
    estados.rubros = mal(apagado503);
    pintar();

    expect(screen.getByText(/esto todavía no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });
});

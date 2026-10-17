/**
 * Las secciones por organismo de /mercado no confunden un error con «sin datos».
 *
 * Antes leían sólo `isPending`: con la API caída pintaban «Sin datos para
 * organismo X», una conclusión de negocio falsa. Un error dice qué pasó y
 * ofrece reintentar esa consulta, y «sin datos» queda para cuando el backend
 * contestó que no hay.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetenciaSection } from '@/app/(panel)/mercado/components/CompetenciaSection';
import { CompradoresSection } from '@/app/(panel)/mercado/components/CompradoresSection';
import { EstacionalidadSection } from '@/app/(panel)/mercado/components/EstacionalidadSection';

type Estado = {
  data?: unknown;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const base = (): Estado => ({
  data: undefined,
  error: null,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(async () => undefined),
});
const fallo = (extra: Partial<Estado> = {}): Estado => ({
  ...base(),
  error: { response: { status: 502, data: { message: 'Application failed to respond' } } },
  isError: true,
  ...extra,
});
const sinDatos = (): Estado => ({ ...base(), data: { disponible: false } });

const estados: Record<string, Estado> = {};

vi.mock('@/lib/queries', () => ({
  useComprador: () => estados.comprador,
  useCompetidores: () => estados.competidores,
  useEstacionalidad: () => estados.estacionalidad,
}));

const organismos = [{ codigo: '7084', nombre: 'Hospital X' }];

beforeEach(() => {
  estados.comprador = base();
  estados.competidores = base();
  estados.estacionalidad = base();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CompradoresSection', () => {
  it('un error no se pinta como «Sin datos para organismo»', () => {
    estados.comprador = fallo();
    render(<CompradoresSection topOrganismos={organismos} rubro="Aseo" />);

    expect(screen.getByText(/no pudimos cargar el perfil del comprador/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin datos para organismo/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(estados.comprador.refetch).toHaveBeenCalledTimes(1);
  });

  it('si el backend dice que no hay datos, sí es «Sin datos»', () => {
    estados.comprador = sinDatos();
    render(<CompradoresSection topOrganismos={organismos} rubro="Aseo" />);

    expect(screen.getByText(/sin datos para organismo 7084/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('CompetenciaSection', () => {
  const pintar = () =>
    render(
      <CompetenciaSection
        topOrganismos={organismos}
        selectedOrganismo="7084"
        onOrganismoChange={() => {}}
        rubro="Aseo"
      />,
    );

  it('un error no se pinta como «Sin datos de competencia»', () => {
    estados.competidores = fallo();
    pintar();

    expect(screen.getByText(/no pudimos cargar la competencia/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin datos de competencia/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(estados.competidores.refetch).toHaveBeenCalledTimes(1);
  });

  it('mientras reintenta, el botón lo dice y no se puede pulsar de nuevo', () => {
    estados.competidores = fallo({ isFetching: true });
    pintar();

    expect(screen.getByRole('button', { name: /reintentando/i })).toBeDisabled();
  });

  it('el gráfico de dispersión queda fuera del árbol accesible y remite a la tabla (axe, svg-img-alt)', () => {
    // Recharts 2.15 pone `role="img"` sin nombre en cada punto (`Scatter.js`):
    // un lector de pantalla anunciaba una imagen muda por proveedor.
    // jsdom no trae ResizeObserver y `ResponsiveContainer` lo pide al montar.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    estados.competidores = {
      ...base(),
      data: {
        disponible: true,
        competidores: [
          {
            CodigoProveedor: '1',
            NombreProveedor: 'Proveedor A',
            RubroN2: 'Aseo',
            market_share_pct: 40,
            win_rate_pct: 30,
            rank_monto: 1,
            n_oc: 12,
          },
        ],
        concentracion: [],
      },
    };
    const { container } = pintar();

    const grafico = container.querySelector('.recharts-responsive-container');
    expect(grafico?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Los datos del gráfico están en «Tabla».')).toHaveClass('sr-only');
  });

  it('si el backend dice que no hay datos, sí es «Sin datos»', () => {
    estados.competidores = sinDatos();
    pintar();

    expect(screen.getByText(/sin datos de competencia/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EstacionalidadSection', () => {
  const pintar = () =>
    render(<EstacionalidadSection topOrganismos={organismos} rubro="Aseo" />);

  it('un error no se pinta como «Sin datos de estacionalidad»', () => {
    estados.estacionalidad = fallo();
    pintar();

    expect(screen.getByText(/no pudimos cargar la estacionalidad/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin datos de estacionalidad/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(estados.estacionalidad.refetch).toHaveBeenCalledTimes(1);
  });

  it('un reintento en curso no vuelve a girar: sigue el error con el botón deshabilitado', () => {
    estados.estacionalidad = fallo({ isFetching: true });
    const { container } = pintar();

    expect(screen.getByRole('button', { name: /reintentando/i })).toBeDisabled();
    // El spinner de la sección (Loader2), no el icono del botón.
    expect(container.querySelector('.lucide-loader2')).toBeNull();
  });

  it('si el backend dice que no hay datos, sí es «Sin datos»', () => {
    estados.estacionalidad = sinDatos();
    pintar();

    expect(screen.getByText(/sin datos de estacionalidad/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

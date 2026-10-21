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

    expect(screen.getByText(/no pudimos cargar este comprador/i)).toBeInTheDocument();
    expect(screen.queryByText(/todavía no tenemos historia del comprador/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(estados.comprador.refetch).toHaveBeenCalledTimes(1);
  });

  it('si el backend dice que no hay datos, sí es «Sin datos»', () => {
    estados.comprador = sinDatos();
    render(<CompradoresSection topOrganismos={organismos} rubro="Aseo" />);

    expect(screen.getByText(/todavía no tenemos historia del comprador 7084/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/no tiene órdenes de compra en el rubro/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(estados.competidores.refetch).toHaveBeenCalledTimes(1);
  });

  it('mientras reintenta, el botón lo dice y no se puede pulsar de nuevo', () => {
    estados.competidores = fallo({ isFetching: true });
    pintar();

    expect(screen.getByRole('button', { name: /reintentando/i })).toBeDisabled();
  });

  it('cada proveedor es una barra fuera del árbol accesible, con su cuota escrita como texto', () => {
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

    const barra = container.querySelector('.bg-dato');
    expect(barra?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Proveedor A')).toBeInTheDocument();
    expect(screen.getByText('40,0 %')).toBeInTheDocument();
    expect(container.querySelector('.recharts-responsive-container')).toBeNull();
  });

  it('si el backend dice que no hay datos, sí es «Sin datos»', () => {
    estados.competidores = sinDatos();
    pintar();

    expect(screen.getByText(/no tiene órdenes de compra en el rubro/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EstacionalidadSection', () => {
  const pintar = () =>
    render(<EstacionalidadSection topOrganismos={organismos} rubro="Aseo" />);

  it('un error no se pinta como «Sin datos de estacionalidad»', () => {
    estados.estacionalidad = fallo();
    pintar();

    expect(screen.getByText(/no pudimos cargar los meses de compra/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tiene compras del rubro/i)).not.toBeInTheDocument();

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

    expect(screen.getByText(/no tiene compras del rubro/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

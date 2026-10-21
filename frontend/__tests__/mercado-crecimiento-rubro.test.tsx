/**
 * El crecimiento de un rubro en /mercado y en «Comparar».
 *
 * Las dos pantallas caían a `tendencia.cagr` cuando faltaba la cifra del rubro.
 * Esa fila es la de UN organismo en el rubro y trae el CAGR como fracción
 * (0,25), mientras `cagr_pct` y `cagr_rubro` vienen en porcentaje (25): un 25 %
 * salía «+0,3 %». Sin la cifra del rubro, no se dice nada.
 *
 * Y «Comparar» se tragaba los errores (`Promise.allSettled`): un rubro que no
 * cargaba enseñaba «0 oportunidades» y columnas vacías como si fueran el dato.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompareMode } from '@/app/(panel)/mercado/components/CompareMode';
import { TendenciasSection } from '@/app/(panel)/mercado/components/TendenciasSection';

type Consulta = {
  data?: unknown;
  error: unknown;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const consultas: Record<string, Consulta> = {};
const funciones: Record<string, () => Promise<unknown>> = {};

vi.mock('@/lib/queries', () => ({
  useBILibre: (_nombre: string, params: string, fn: () => Promise<unknown>) => {
    funciones[params] = fn;
    return consultas[params];
  },
}));

const api = vi.hoisted(() => ({
  getBIResumen: vi.fn(),
  getBIOportunidades: vi.fn(),
  getBITendencia: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ apiClient: api }));

const lista = (data: unknown): Consulta => ({
  data,
  error: null,
  isError: false,
  isFetching: false,
  refetch: vi.fn(async () => undefined),
});

const datos = (cagr_pct: number | null) =>
  lista({
    resumen: { disponible: true, rubro: 'Aseo', cagr_pct, monto_anual_clp: 1_000_000 },
    oportunidades: [],
  });

function comparar() {
  render(
    <CompareMode
      rubroA="Aseo"
      rubroB="Obras"
      allRubros={['Aseo', 'Obras']}
      onChangeRubroA={() => {}}
      onChangeRubroB={() => {}}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  for (const clave of Object.keys(consultas)) delete consultas[clave];
  vi.clearAllMocks();
});

describe('Comparar rubros', () => {
  it('el crecimiento es el del rubro, en porcentaje', () => {
    consultas.Aseo = datos(25);
    consultas.Obras = datos(null);
    comparar();

    // Una sola columna lo dice: la otra no tiene la cifra del rubro.
    expect(screen.getAllByText('Crecimiento anual')).toHaveLength(1);
    expect(screen.getByText('+25,0%')).toBeTruthy();
    expect(screen.queryByText(/0,3/)).toBeNull();
  });

  it('ya no pide la tendencia por organismo', async () => {
    consultas.Aseo = datos(null);
    consultas.Obras = datos(null);
    api.getBIResumen.mockResolvedValue({ disponible: true });
    api.getBIOportunidades.mockResolvedValue({ disponible: true, oportunidades: [] });
    comparar();

    await funciones.Aseo();
    expect(api.getBITendencia).not.toHaveBeenCalled();
  });

  it('un rubro que no carga lo dice y deja reintentar, sin ceros', () => {
    consultas.Aseo = datos(10);
    consultas.Obras = {
      ...lista(undefined),
      error: { response: { status: 502 } },
      isError: true,
    };
    comparar();

    expect(screen.getByText('No pudimos cargar este rubro')).toBeTruthy();
    // La columna que sí cargó dice su cifra; la que falló no pinta un 0.
    expect(screen.getAllByText('Oportunidades encontradas')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(consultas.Obras.refetch).toHaveBeenCalled();
  });

  it('un error de la API no se convierte en una columna vacía', async () => {
    consultas.Aseo = datos(null);
    consultas.Obras = datos(null);
    api.getBIResumen.mockResolvedValue({ disponible: true });
    api.getBIOportunidades.mockRejectedValue(new Error('502'));
    comparar();

    // La consulta tiene que fallar, para que TanStack la marque como error.
    await expect(funciones.Aseo()).rejects.toThrow('502');
  });
});

describe('Cómo viene creciendo', () => {
  const serie = [
    { anio: 2024, monto_total: 100, n_oc: 10 },
    { anio: 2025, monto_total: 125, n_oc: 15 },
  ];

  it('sin la cifra del rubro no hay conclusión de crecimiento', () => {
    render(<TendenciasSection loading={false} selectedRubro="Aseo" serieAnual={serie} cagrRubro={null} />);

    expect(screen.queryByText(/al año/)).toBeNull();
  });

  it('con la cifra del rubro la dice en porcentaje', () => {
    render(<TendenciasSection loading={false} selectedRubro="Aseo" serieAnual={serie} cagrRubro={25} />);

    expect(screen.getByText('Crece 25,0 % al año entre 2024 y 2025.')).toBeTruthy();
  });

  it('las órdenes son las del rubro en esos años, no las de un organismo', () => {
    render(<TendenciasSection loading={false} selectedRubro="Aseo" serieAnual={serie} cagrRubro={25} />);

    expect(screen.getByText('25 órdenes de compra en 2 años completos.')).toBeTruthy();
  });
});

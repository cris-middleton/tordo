/**
 * La celda «Cierre» de la ficha no dice la fecha dos veces: «Cierra el 26 oct a
 * las 13:00» ya la trae, y debajo iba «26 de octubre de 2026, 13:00». La fecha
 * larga queda para cuando el valor no la dice («Cierra mañana a las 13:00»).
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TenderDetailPage from '@/app/(panel)/licitaciones/[codigo]/page';

const dato = { fecha_cierre: '' };

vi.mock('next/navigation', () => ({
  useParams: () => ({ codigo: '1234-5-LE26' }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@/lib/queries', () => ({
  useLicitacion: () => ({
    data: { codigo_externo: '1234-5-LE26', nombre: 'Compra de guantes', fecha_cierre: dato.fecha_cierre },
    isPending: false,
    isError: false,
  }),
  usePanelLicitacion: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/app/(panel)/licitaciones/[codigo]/components/BICard', () => ({ BICard: () => null }));
vi.mock('@/components/licitacion/BIPanelSection', () => ({ default: () => null }));

afterEach(() => vi.useRealTimers());

describe('la celda del cierre', () => {
  it('con la fecha en el valor, no la repite debajo', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00-03:00'));
    dato.fecha_cierre = '2026-10-26T13:00:00-03:00';
    render(<TenderDetailPage />);
    expect(screen.getByText('Cierra el 26 oct a las 13:00')).toBeInTheDocument();
    expect(screen.queryByText(/26 de octubre de 2026/)).not.toBeInTheDocument();
  });

  it('con «mañana», la fecha larga va debajo', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00-03:00'));
    dato.fecha_cierre = '2026-10-26T13:00:00-03:00';
    render(<TenderDetailPage />);
    expect(screen.getByText('Cierra mañana a las 13:00')).toBeInTheDocument();
    expect(screen.getByText(/26 de octubre de 2026/)).toBeInTheDocument();
  });
});

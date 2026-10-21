/**
 * Una licitación que ya no está en el catálogo (la retención la borra 90 días
 * después de cerrar) no es una caída: la ficha lo dice, enlaza a Mercado
 * Público y no ofrece reintentar. Un 5xx, en cambio, sí se reintenta.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TenderDetailPage from '@/app/(panel)/licitaciones/[codigo]/page';
import NoEncontrada from '@/app/(panel)/licitaciones/not-found';
import { codigoDeRutaLicitacion, esNoEncontrada, montoConMoneda } from '@/lib/licitacionDetalle';

const refetch = vi.fn();
let estado: Record<string, unknown> = {};

vi.mock('next/navigation', () => ({
  useParams: () => ({ codigo: '1234-56-LE26' }),
  usePathname: () => '/licitaciones/1234-56-LE26',
}));

vi.mock('@/lib/queries', () => ({
  useLicitacion: () => ({ refetch, isFetching: false, isPending: false, ...estado }),
  usePanelLicitacion: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/components/licitacion/BIPanelSection', () => ({ default: () => null }));

beforeEach(() => {
  refetch.mockClear();
});

const FICHA_MP = 'https://buscador.mercadopublico.cl/ficha?code=1234-56-LE26';

describe('ficha de una licitación que no está', () => {
  it('un 404 dice por qué y enlaza a Mercado Público, sin reintentar', () => {
    estado = { data: undefined, isError: true, error: { response: { status: 404, data: { detail: 'Tender not found' } } } };
    render(<TenderDetailPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No tenemos esta licitación');
    expect(screen.getByText(/90 días después de su cierre/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buscarla en mercado público/i })).toHaveAttribute('href', FICHA_MP);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.queryByText(/tender not found/i)).not.toBeInTheDocument();
  });

  it('un 5xx se reintenta', () => {
    estado = { data: undefined, isError: true, error: { response: { status: 502 } } };
    render(<TenderDetailPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/no pudimos cargar esta licitación/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('el 404 del servidor dice lo mismo, con el código de la ruta', () => {
    render(<NoEncontrada />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No tenemos esta licitación');
    expect(screen.getByText('1234-56-LE26')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buscarla en mercado público/i })).toHaveAttribute('href', FICHA_MP);
  });
});

describe('fechas y montos de la ficha', () => {
  it('en hora de Chile y con el formato de montos del sitio', () => {
    estado = {
      data: {
        codigo_externo: '1234-56-LE26',
        nombre: 'Compra de guantes',
        fecha_cierre: '2026-10-22T01:30:00Z',
        fecha_publicacion: '2026-10-01T02:00:00Z',
        monto_estimado: 7_200_000,
      },
      isError: false,
    };
    render(<TenderDetailPage />);
    expect(screen.getByText('21 de octubre de 2026, 22:30')).toBeInTheDocument();
    expect(screen.getByText('30 de septiembre de 2026')).toBeInTheDocument();
    expect(screen.getByText('$7,2 millones')).toBeInTheDocument();
  });
});

describe('ayudantes', () => {
  it('montoConMoneda: pesos con monto(), otras monedas con su nombre', () => {
    expect(montoConMoneda(825_000, 'CLP')).toBe('$825.000');
    expect(montoConMoneda(825_000, null)).toBe('$825.000');
    expect(montoConMoneda(1500, 'CLF')).toBe('1.500 UF');
    expect(montoConMoneda(1500.5, 'USD')).toBe('US$1.500,50');
    expect(montoConMoneda(null, 'CLP')).toBeNull();
    expect(montoConMoneda(Number.NaN, 'CLP')).toBeNull();
  });

  it('esNoEncontrada sólo con 404', () => {
    expect(esNoEncontrada({ response: { status: 404 } })).toBe(true);
    expect(esNoEncontrada({ response: { status: 500 } })).toBe(false);
    expect(esNoEncontrada(null)).toBe(false);
  });

  it('codigoDeRutaLicitacion', () => {
    expect(codigoDeRutaLicitacion('/licitaciones/1234-56-LE26')).toBe('1234-56-LE26');
    expect(codigoDeRutaLicitacion('/licitaciones/a%20b')).toBe('a b');
    expect(codigoDeRutaLicitacion('/licitaciones/%E0%A4%A')).toBe('%E0%A4%A');
    expect(codigoDeRutaLicitacion('/licitaciones')).toBeNull();
    expect(codigoDeRutaLicitacion(null)).toBeNull();
  });
});

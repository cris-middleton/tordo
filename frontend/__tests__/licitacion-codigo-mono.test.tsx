/**
 * El código de la licitación es un identificador: va en Plex Mono (§5.1 del
 * rediseño). Era un `h2 font-semibold`, y la regla base `h1, h2` lo habría
 * puesto en Libre Franklin en 800; con `font-mono` y 600 saldría en negrita sintética
 * (Plex Mono sólo está cargada en 400 y 500), así que lleva `font-medium`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TenderDetailPage from '@/app/(panel)/licitaciones/[codigo]/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ codigo: '3926-247-COT26' }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@/lib/queries', () => ({
  useLicitacion: () => ({
    data: { codigo_externo: '3926-247-COT26', nombre: 'Compra de guantes', nombre_organismo: 'Hospital de Prueba' },
    isPending: false,
    isError: false,
  }),
  usePanelLicitacion: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/app/(panel)/licitaciones/[codigo]/components/BICard', () => ({ BICard: () => null }));
vi.mock('@/components/licitacion/BIPanelSection', () => ({ default: () => null }));

describe('detalle de licitación', () => {
  it('el código externo va en mono y sin negrita', () => {
    render(<TenderDetailPage />);
    // El título es el nombre; el código va debajo, en mono y sin negrita.
    expect(screen.getByRole('heading', { level: 1, name: /compra de guantes/i })).toBeInTheDocument();
    const codigo = screen.getByText('3926-247-COT26');
    expect(codigo).toHaveClass('font-mono');
    expect(codigo.className).not.toMatch(/font-(semibold|bold)/);
  });

  it('una Compra Ágil sin URL en el dato enlaza a su ficha del buscador público, y lo dice', () => {
    render(<TenderDetailPage />);
    expect(screen.getByRole('link', { name: /abrir en mercado público/i })).toHaveAttribute(
      'href',
      'https://buscador.mercadopublico.cl/ficha?code=3926-247-COT26',
    );
    expect(screen.getByText('Compra Ágil')).toBeInTheDocument();
  });
});

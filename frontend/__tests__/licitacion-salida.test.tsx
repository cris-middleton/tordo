/**
 * Toda licitación tiene salida a Mercado Público, que es donde se postula: antes
 * sólo la Compra Ágil armaba su enlace, y una licitación sin `url_licitacion` en
 * el dato (casi todas) no tenía ninguno. El comprador enlaza a su ficha cuando el
 * análisis lo conoce.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TenderDetailPage from '@/app/(panel)/licitaciones/[codigo]/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ codigo: '2450-100-LE26' }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@/lib/queries', () => ({
  useLicitacion: () => ({
    data: {
      codigo_externo: '2450-100-LE26',
      tipo_convocatoria: 'licitacion',
      nombre: 'ADQUISICION DE UNIFORMES',
      nombre_organismo: 'I MUNICIPALIDAD DE CONCEPCION',
      codigo_organismo: '7248',
      descripcion: 'SE REQUIERE LA ADQUISICION DE UNIFORMES.',
    },
    isPending: false,
    isError: false,
  }),
  usePanelLicitacion: () => ({
    data: {
      codigo_externo: '2450-100-LE26',
      organismo_id: '7248',
      comprador: { disponible: true },
      ventana: { disponible: false },
      competidores: { disponible: false },
      precios: [],
    },
    isLoading: false,
  }),
}));

vi.mock('@/components/licitacion/BIPanelSection', () => ({ default: () => null }));

describe('ficha de una licitación', () => {
  it('sale a su ficha del portal aunque el dato no traiga URL', () => {
    render(<TenderDetailPage />);
    expect(screen.getByRole('link', { name: /abrir en mercado público/i })).toHaveAttribute(
      'href',
      'https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=2450-100-LE26',
    );
  });

  it('el comprador enlaza a su ficha y la descripción va en tipo oración', () => {
    render(<TenderDetailPage />);
    expect(screen.getByRole('link', { name: 'I Municipalidad de Concepcion' })).toHaveAttribute(
      'href',
      '/compradores/7248',
    );
    expect(screen.getByText('Se requiere la adquisicion de uniformes.')).toBeInTheDocument();
  });
});

/**
 * La ficha de una licitación enlaza a Mercado Público, que es donde se postula.
 *
 * Sólo la Compra Ágil tenía enlace sin `url_licitacion`, y ese campo casi nunca
 * viene: en la copia local ninguna de las 4.379 licitaciones lo traía. La ficha
 * de una licitación no tenía cómo ir a postular. Sin URL en el dato, una
 * licitación va a su ficha del portal (`urlLicitacionMercadoPublico`, de #83).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TenderDetailPage from '@/app/(panel)/licitaciones/[codigo]/page';
import { urlLicitacionMercadoPublico } from '@/lib/enlacesExternos';

let dato: Record<string, unknown> = {};

vi.mock('next/navigation', () => ({
  useParams: () => ({ codigo: String(dato.codigo_externo) }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock('@/lib/queries', () => ({
  useLicitacion: () => ({ data: dato, isPending: false, isError: false }),
  usePanelLicitacion: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/components/licitacion/BIPanelSection', () => ({ default: () => null }));

const enlace = () => screen.getByRole('link', { name: /abrir en mercado público/i });

describe('enlace a Mercado Público en la ficha', () => {
  beforeEach(() => {
    dato = {
      id: 7,
      codigo_externo: '621-884-LR26',
      nombre: 'Tramadol 50 mg',
      nombre_organismo: 'Hospital de Prueba',
      tipo_convocatoria: 'licitacion',
      url_licitacion: null,
    };
  });

  it('una licitación sin URL en el dato enlaza a su ficha del portal por su código', () => {
    render(<TenderDetailPage />);
    expect(enlace()).toHaveAttribute('href', urlLicitacionMercadoPublico('621-884-LR26'));
  });

  it('con una URL de Mercado Público en el dato, usa ésa', () => {
    dato.url_licitacion = 'https://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=621-884-LR26';
    render(<TenderDetailPage />);
    expect(enlace()).toHaveAttribute('href', String(dato.url_licitacion));
  });

  it('una URL ajena en el dato no se enlaza: va la del portal', () => {
    dato.url_licitacion = 'https://otro-sitio.example/ficha';
    render(<TenderDetailPage />);
    expect(enlace()).toHaveAttribute('href', urlLicitacionMercadoPublico('621-884-LR26'));
  });
});

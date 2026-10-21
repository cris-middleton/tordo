/**
 * «Compras Ágiles abiertas de este comprador», en `/compradores/[codigo]`.
 *
 * Se fija:
 *   1. que se pide en el cliente filtrando por el código del comprador;
 *   2. que con resultados reutiliza la tarjeta de «Lo mejor de hoy»;
 *   3. que vacía o con error es UNA línea discreta con enlace a todas — nunca
 *      una caja de error en una ficha que sí cargó.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompraAgilDelComprador } from '@/components/publico/CompraAgilDelComprador';
import type { CompraAgilDestacada } from '@/types/compraAgil';

let estado: { isPending: boolean; isError: boolean; data?: unknown };
const pedidas: unknown[] = [];

vi.mock('@/lib/queries', () => ({
  useCompraAgilDestacadas: (params: unknown) => {
    pedidas.push(params);
    return estado;
  },
}));

const ITEM: CompraAgilDestacada = {
  codigo_externo: '1234-56-COT26',
  nombre: 'RESMAS DE PAPEL CARTA',
  nombre_organismo: 'HOSPITAL DE PRUEBA',
  region: 'Región del Biobío',
  monto_estimado: 1_500_000,
  fecha_publicacion: '2026-10-12T09:00:00-03:00',
  fecha_cierre: '2026-10-13T09:00:00-03:00',
  horas_restantes: 20.5,
  ofertas_recibidas: 1,
  ofertas_al: null,
  comprador: null,
  puntaje: 0.62,
  factores: { competencia: 0.5, comprador: 0.5, tiempo: 0.85, monto: 1 },
};

beforeEach(() => {
  pedidas.length = 0;
});

function comprobarLineaVacia(texto = /no tiene Compras Ágiles abiertas ahora mismo/) {
  expect(screen.getByText(texto)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /ver las de todos los compradores/i })).toHaveAttribute(
    'href',
    '/compra-agil',
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
}

describe('Compras Ágiles abiertas del comprador', () => {
  it('pide las del comprador, por su código', () => {
    estado = { isPending: true, isError: false };
    render(<CompraAgilDelComprador codigo="7297" />);
    expect(pedidas.at(-1)).toEqual({ codigo_organismo: '7297', limite: 10 });
    expect(screen.getByText(/buscando/i)).toBeInTheDocument();
  });

  it('con resultados, la tarjeta de «Lo mejor de hoy» enlazando al detalle', () => {
    estado = {
      isPending: false,
      isError: false,
      data: {
        actualizado_en: null,
        historia_disponible: true,
        ventana_desde: '2026-04-01',
        ventana_hasta: '2026-09-30',
        items: [ITEM],
      },
    };
    render(<CompraAgilDelComprador codigo="7297" />);
    const lista = screen.getByRole('list', { name: /compras ágiles abiertas de este comprador/i });
    expect(lista).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/licitaciones/1234-56-COT26'),
    ).toBe(true);
  });

  it('sin historia por unidad aún, la tarjeta no dice nada del comprador', () => {
    const datos = {
      actualizado_en: null,
      historia_disponible: false,
      ventana_desde: null,
      ventana_hasta: null,
      items: [ITEM],
    };
    estado = { isPending: false, isError: false, data: datos };
    render(<CompraAgilDelComprador codigo="7297" />);
    expect(screen.getByRole('article').textContent).not.toMatch(/historial|esta unidad|órdenes/i);
  });

  it('vacía: una línea discreta y el enlace a todas', () => {
    estado = { isPending: false, isError: false, data: { items: [] } };
    render(<CompraAgilDelComprador codigo="7297" />);
    comprobarLineaVacia();
  });

  it('con error: una línea discreta que no dice que no tenga, sin caja de error', () => {
    estado = { isPending: false, isError: true };
    render(<CompraAgilDelComprador codigo="7297" />);
    comprobarLineaVacia(/No pudimos traer sus Compras Ágiles abiertas/);
    expect(screen.queryByText(/no tiene Compras Ágiles/)).not.toBeInTheDocument();
  });
});

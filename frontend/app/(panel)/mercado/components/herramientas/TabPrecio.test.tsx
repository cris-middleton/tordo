/**
 * TabPrecio enseña el precio típico de un producto según el nivel de
 * agregación que devolvió el backend (L0..L4). L0/L0N son el nivel nuevo que
 * separa una categoría UNSPSC en productos reales — el fix para el bug
 * original: un calibrador a $557.062 y un criovial a $1 promediados como si
 * respondieran la misma pregunta (ver `backend/app/services/bi/precio.py`).
 *
 * Antes de este cambio la pantalla hacía `resultado?.resultado?.[0]` y
 * descartaba el resto: aunque el backend separara la categoría en varios
 * productos, la pantalla volvía a enseñar un solo número, escondiendo la
 * mejora un nivel más abajo. Estos tests fijan que:
 *   1. una sola banda se sigue viendo igual que antes,
 *   2. varias bandas se muestran TODAS y se pueden distinguir,
 *   3. `predictibilidad` y `qcd` son visibles, no un detalle que hay que
 *      adivinar mirando un número crudo.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TabPrecio from './TabPrecio';
import { apiClient } from '@/lib/api';
import type { PrecioBanda, PrecioResultado } from './comun';

vi.mock('@/lib/api', () => ({
  apiClient: { getBIPrecio: vi.fn() },
}));

// El combobox de búsqueda de producto no es lo que este archivo prueba: se
// fija una única opción para poder llegar al botón "Consultar".
vi.mock('@/lib/queries', () => ({
  useBuscarProductos: () => ({
    data: {
      disponible: true,
      resultados: [{ codigoProductoONU: '41116000', nombre: 'Guantes de nitrilo', n: 340 }],
    },
    isFetching: false,
  }),
}));

function banda(parcial: Partial<PrecioBanda>): PrecioBanda {
  return { p10: 40000, p50: 45000, p90: 60000, n: 20, ...parcial };
}

async function consultarProducto() {
  render(<TabPrecio />);
  await userEvent.click(screen.getByText('Guantes de nitrilo'));
  await userEvent.click(screen.getByRole('button', { name: 'Ver precios' }));
}

describe('TabPrecio', () => {
  it('renderiza una sola banda con el detalle habitual (L1)', async () => {
    const resultado: PrecioResultado = {
      disponible: true,
      nivel_usado: 'L1',
      resultado: [banda({})],
    };
    vi.mocked(apiClient.getBIPrecio).mockResolvedValue(resultado);

    await consultarProducto();

    await waitFor(() => {
      expect(screen.getByText(/la mitad pagó menos de/i)).toBeInTheDocument();
    });
    expect(screen.getByText('$45.000')).toBeInTheDocument();
    expect(screen.getByText(/su categoría del catálogo que hizo este comprador/)).toBeInTheDocument();
    // Con una sola banda no se anuncia una cuenta de "productos distintos".
    expect(screen.queryByText(/productos distintos/)).not.toBeInTheDocument();
  });

  it('muestra cada banda por separado cuando L0 separa la categoría en productos', async () => {
    const resultado: PrecioResultado = {
      disponible: true,
      nivel_usado: 'L0',
      resultado: [
        banda({ descripcion: 'Calibrador digital de espesor', p50: 557000, n: 8 }),
        banda({ descripcion: 'Criovial 2 ml', p50: 1, p10: undefined, p90: undefined, n: 50 }),
      ],
    };
    vi.mocked(apiClient.getBIPrecio).mockResolvedValue(resultado);

    await consultarProducto();

    await waitFor(() => {
      expect(screen.getByText('Calibrador digital de espesor')).toBeInTheDocument();
    });
    // Las dos bandas se ven, no sólo la primera — es la corrección que se audita.
    expect(screen.getByText('Criovial 2 ml')).toBeInTheDocument();
    expect(screen.getByText('$557.000')).toBeInTheDocument();
    expect(screen.getByText('$1')).toBeInTheDocument();
    // L0 tiene su propia lectura, distinta de "datos del organismo específico".
    expect(screen.getByText(/compras de este producto que hizo este comprador/)).toBeInTheDocument();
    expect(screen.getByText(/2 productos distintos/)).toBeInTheDocument();
  });

  it('muestra predictibilidad y dispersión (qcd) sin esconderlas detrás de un adjetivo', async () => {
    const resultado: PrecioResultado = {
      disponible: true,
      nivel_usado: 'L1',
      resultado: [banda({ predictibilidad: 'baja', qcd: 0.42, n: 6, confianza: 0.3 })],
    };
    vi.mocked(apiClient.getBIPrecio).mockResolvedValue(resultado);

    await consultarProducto();

    await waitFor(() => {
      expect(screen.getByText(/disperso/i)).toBeInTheDocument();
    });
    // El número crudo de dispersión sigue visible, no sólo el adjetivo.
    expect(screen.getByText(/0,42/)).toBeInTheDocument();
    // Y el tamaño de muestra, junto al adjetivo, no oculto detrás de él.
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('no rompe cuando el backend no manda predictibilidad ni unidad (p.ej. nivel L4)', async () => {
    const resultado: PrecioResultado = {
      disponible: true,
      nivel_usado: 'L4',
      resultado: [banda({ predictibilidad: undefined, qcd: undefined, UnidadMedida: undefined })],
    };
    vi.mocked(apiClient.getBIPrecio).mockResolvedValue(resultado);

    await consultarProducto();

    await waitFor(() => {
      expect(screen.getByText(/la mitad pagó menos de/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/no hay compras de este producto/)).toBeInTheDocument();
    // L4 agrega por rubro, sin unidad: se avisa en vez de asumir una.
    expect(screen.getByText(/sin unidad de medida/)).toBeInTheDocument();
  });

  it('muestra la unidad junto al precio cuando el backend la manda', async () => {
    const resultado: PrecioResultado = {
      disponible: true,
      nivel_usado: 'L1',
      resultado: [banda({ UnidadMedida: 'caja de 100' })],
    };
    vi.mocked(apiClient.getBIPrecio).mockResolvedValue(resultado);

    await consultarProducto();

    await waitFor(() => {
      expect(screen.getByText(/la mitad pagó menos de/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/por caja de 100/)).toBeInTheDocument();
    // Con unidad no hay nada que avisar.
    expect(screen.queryByText(/sin unidad de medida/)).not.toBeInTheDocument();
  });
});

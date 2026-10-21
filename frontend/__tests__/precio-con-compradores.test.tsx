import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CifrasBanda } from '@/components/publico/CifrasBanda';
import {
  comprasDeOrganismos,
  frasePrecio,
  metadataProducto,
  nombreProducto,
  notaCompradores,
} from '@/lib/publico';
import type { BandaUnidad, ProductoPublico } from '@/types/publico';

/**
 * Todo precio dice cuántos compradores tiene detrás y de cuándo es (auditoría
 * del 2026-10-16, D2 y M1): «90 compras de 2 organismos» no se lee igual que
 * «90 compras». Y un producto se titula como lo escribe quien lo compra, no con
 * la firma (D5): «Higiénico jumbo papel» son palabras ordenadas.
 */

const banda = (cambio: Partial<BandaUnidad> = {}): BandaUnidad => ({
  unidad: 'unidad',
  n: 46,
  p10: 129_990,
  p25: 150_921,
  p50: 190_762,
  p75: 240_000,
  p90: 369_990,
  predictibilidad: 'alta',
  confianza: 0.79,
  compradores: 40,
  cuota_mayor: 0.04,
  de_mercado: true,
  ...cambio,
});

describe('comprasDeOrganismos', () => {
  it.each([
    [46, 40, '46 compras de 40 compradores'],
    [90, 1, '90 compras de 1 comprador'],
    [1, 1, '1 compra'],
    [1_250, 300, '1.250 compras de 300 compradores'],
    [12, null, '12 compras'],
    [12, undefined, '12 compras'],
  ])('%d compras, %j compradores → «%s»', (n, compradores, esperado) => {
    expect(comprasDeOrganismos(n, compradores)).toBe(esperado);
  });
});

describe('frasePrecio', () => {
  it('con rango: la mitad se pagó entre p25 y p75', () => {
    expect(frasePrecio(banda())).toBe('La mitad de las 46 compras se pagó entre $150.921 y $240.000.');
  });

  it('con p25 = p75 al escribirlos, y también p10 = p90: todas a un precio', () => {
    const b = banda({ n: 191, p10: 1150, p25: 1150, p50: 1150, p75: 1150.4, p90: 1150 });
    expect(frasePrecio(b)).toBe('Las 191 compras se pagaron a $1.150.');
  });

  it('con p25 = p75 pero extremos distintos: sólo la mitad, nunca «entre $X y $X»', () => {
    const b = banda({ n: 30, p10: 900, p25: 1150, p50: 1150, p75: 1150, p90: 1400 });
    expect(frasePrecio(b)).toBe('La mitad de las 30 compras se pagó a $1.150.');
    expect(frasePrecio(b)).not.toMatch(/entre \$1\.150 y \$1\.150/);
  });

  it('una sola compra, en singular', () => {
    const b = banda({ n: 1, p10: 500, p25: 500, p50: 500, p75: 500, p90: 500 });
    expect(frasePrecio(b)).toBe('La única compra se pagó a $500.');
  });
});

describe('notaCompradores', () => {
  it('nada que añadir si es un precio de mercado', () => {
    expect(notaCompradores(banda())).toBeNull();
  });

  it('de un solo organismo: lo dice', () => {
    expect(notaCompradores(banda({ n: 90, compradores: 1, cuota_mayor: 1, de_mercado: false }))).toBe(
      'Todas las compras son de un mismo comprador: es el precio de su contrato.',
    );
  });

  it('con uno sobre la mitad: cuántas son suyas', () => {
    expect(notaCompradores(banda({ n: 90, compradores: 2, cuota_mayor: 88 / 90, de_mercado: false }))).toBe(
      '88 de las 90 compras son de un mismo comprador.',
    );
  });

  it('sin el dato, nada', () => {
    expect(notaCompradores(banda({ compradores: null, cuota_mayor: null, de_mercado: undefined }))).toBeNull();
  });
});

describe('CifrasBanda (la ficha de producto y /buscar)', () => {
  it('no repite cuántas compras y compradores: lo dice el pie del gráfico, justo debajo', () => {
    render(<CifrasBanda banda={banda()} />);
    expect(screen.queryByText(/46 compras de 40 compradores/)).toBeNull();
    expect(screen.getByText('$150.921 a $240.000')).toBeTruthy();
  });

  it('nunca «$X a $X»', () => {
    const { container } = render(<CifrasBanda banda={banda({ n: 191, p10: 1150, p25: 1150, p50: 1150, p75: 1150, p90: 1150 })} />);
    expect(container.textContent).not.toMatch(/\$1\.150 a \$1\.150/);
  });

  it('con un organismo que pesa más de la mitad, lo avisa', () => {
    const { container } = render(
      <CifrasBanda banda={banda({ n: 90, compradores: 2, cuota_mayor: 88 / 90, de_mercado: false })} />,
    );
    expect(container.textContent).toContain('88 de las 90 compras son de un mismo comprador.');
  });

  it('con precios dispersos no atribuye causas: dice lo que se ve', () => {
    const { container } = render(<CifrasBanda banda={banda({ predictibilidad: 'baja' })} />);
    expect(container.textContent).not.toMatch(/decide la adjudicaci/);
    expect(container.textContent).toContain('Con precios tan distintos, la mediana orienta poco.');
  });
});

describe('nombreProducto', () => {
  const p = (descripcion: string | null | undefined, firma = 'higiénico jumbo papel') => ({ firma, descripcion });

  it.each([
    ['PAPEL HIGIÉNICO JUMBO', 'Papel higiénico jumbo'],
    ['Agua mineral 500cc sin gas', 'Agua mineral 500cc sin gas'],
    // Códigos internos delante, tabuladores y saltos de línea, como vienen del dato.
    ['(4194153) TOMATE FRESCO LARGA VIDA', 'Tomate fresco larga vida'],
    ['0900317\tLAPIZ PASTA AZUL\r\r\n', 'Lapiz pasta azul'],
    ['353-0050 TORNILLO CORTICAL 3.5 X 12 MM', 'Tornillo cortical 3.5 x 12 mm'],
    ['9\tGuía metálica J 0.35 x 260 cm\n', 'Guía metálica J 0.35 x 260 cm'],
    ['  IMPRESORA MULTIFUNCIONAL.  ', 'Impresora multifuncional'],
  ])('«%s» → «%s»', (descripcion, esperado) => {
    expect(nombreProducto(p(descripcion))).toBe(esperado);
  });

  it('una descripción larga se corta en una palabra, con puntos suspensivos', () => {
    const larga = `GUANTES DE NITRILO ${'SIN POLVO '.repeat(12)}`;
    const nombre = nombreProducto(p(larga));
    expect(nombre.length).toBeLessThanOrEqual(81);
    expect(nombre).toMatch(/^Guantes de nitrilo sin polvo/);
    expect(nombre).toMatch(/[a-z]…$/);
  });

  it.each([null, undefined, '', '   ', '12345', '(4194153)'])('sin descripción legible (%j), la firma', (d) => {
    expect(nombreProducto(p(d))).toBe('Higiénico jumbo papel');
  });

  it('el título de la ficha y sus metadatos usan el mismo nombre', () => {
    const producto = {
      slug: 'higienico-jumbo-papel',
      firma: 'higiénico jumbo papel',
      descripcion: 'PAPEL HIGIÉNICO JUMBO',
      nombre_generico: null,
      codigo_onu: null,
      indexable: true,
      unidades: [banda()],
      compradores: [],
    } as ProductoPublico;
    expect(String(metadataProducto(producto).title)).toBe('Cuánto paga el Estado por papel higiénico jumbo');
  });
});

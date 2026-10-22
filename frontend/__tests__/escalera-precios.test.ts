import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bandaDeLaEscalera, fraseEscalera, lecturaEscalera, MINIMO_FILAS, PRODUCTOS_ESCALERA } from '@/lib/escaleraPrecios';
import type { BandaUnidad, ProductoPublico } from '@/types/publico';

/** La escalera de precios de «Para empezar» (`lib/escaleraPrecios.ts`). Cifras de producción del 2026-10-22. */

const banda = (cambio: Partial<BandaUnidad>): BandaUnidad => ({
  unidad: 'unidad',
  n: 100,
  p10: 1,
  p25: 1,
  p50: 1,
  p75: 1,
  p90: 1,
  predictibilidad: 'alta',
  confianza: 0.8,
  compradores: 40,
  cuota_mayor: 0.1,
  de_mercado: true,
  ...cambio,
});

const ficha = (slug: string, unidades: BandaUnidad[]): ProductoPublico =>
  ({
    slug,
    firma: slug,
    indexable: true,
    unidades,
    compradores: [],
    periodo: { ventana_desde: '2025-11-01', ventana_hasta: '2026-10-18' },
  }) as unknown as ProductoPublico;

const PRODUCCION: ProductoPublico[] = [
  ficha('azul-lapiz-pasta', [banda({ p25: 83, p50: 100, p75: 134, n: 293, compradores: 125 })]),
  ficha('agua-gas-mineral-sin', [banda({ p25: 415, p50: 550, p75: 719, n: 448, compradores: 169, predictibilidad: 'media' })]),
  ficha('cloro-gel', [banda({ p25: 791, p50: 955.5, p75: 1200, n: 662, compradores: 204 })]),
  ficha('carta-papel-resma', [banda({ p25: 2772, p50: 3101, p75: 3800, n: 61, compradores: 37 })]),
  // Los guantes se compran por caja: la de unidades (a $26) no es la que se dibuja.
  ficha('guantes-nitrilo-talla', [
    banda({ unidad: 'unidad', p25: 20, p50: 26, p75: 33 }),
    banda({ unidad: 'caja', p25: 2600, p50: 3200, p75: 3956, n: 145, compradores: 61 }),
  ]),
  ficha('impresora-multifuncional', [banda({ p25: 167_227, p50: 214_000, p75: 320_900, n: 87, compradores: 63 })]),
];

describe('lecturaEscalera', () => {
  const l = lecturaEscalera(PRODUCCION, null)!;

  it('una fila por producto, de lo más barato a lo más caro, con su rango escrito', () => {
    expect(l.grafico.filas.map((f) => [f.nombre, f.rango])).toEqual([
      ['Lápiz pasta azul', '$83 a $134'],
      ['Agua mineral sin gas', '$415 a $719'],
      ['Cloro gel', '$791 a $1.200'],
      ['Resma de papel carta', '$2.772 a $3.800'],
      ['Guantes de nitrilo (caja)', '$2.600 a $3.956'],
      ['Impresora multifuncional', '$167.227 a $320.900'],
    ]);
  });

  it('la que más varía va en la conclusión y destacada', () => {
    expect(l.conclusion).toBe(
      'La impresora multifuncional es lo que más varía: en la mitad de sus compras, el precio más alto es 1,9 veces el más bajo.',
    );
    expect(l.grafico.filas.filter((f) => f.destacada).map((f) => f.slug)).toEqual(['impresora-multifuncional']);
  });

  it('una escala logarítmica contra la mediana de cada uno, de la mitad al doble', () => {
    expect(l.grafico.marcas.map((m) => m.texto)).toEqual(['la mitad', 'la mediana', 'el doble']);
    // La impresora: $167.227 y $320.900 contra $214.000.
    const impresora = l.grafico.filas.at(-1)!;
    expect(impresora.desde).toBeCloseTo(32.2, 0);
    expect(impresora.hasta).toBeCloseTo(79.2, 0);
    for (const f of l.grafico.filas) {
      expect(f.desde).toBeGreaterThanOrEqual(0);
      expect(f.hasta).toBeLessThanOrEqual(100);
      expect(f.desde).toBeLessThanOrEqual(f.medio);
      expect(f.medio).toBeLessThanOrEqual(f.hasta);
    }
  });

  it('el pie dice cuántas compras, de cuándo y cómo se lee', () => {
    expect(l.pie).toBe(
      '1.696 compras de nov 2025 a oct 2026, precio por unidad (los guantes, por caja). La franja es la mitad de las compras de cada cosa, medida contra su propia mediana (la raya): así se comparan un lápiz y una impresora.',
    );
  });

  it(`con menos de ${MINIMO_FILAS} filas que se puedan creer, no hay escalera`, () => {
    expect(lecturaEscalera([PRODUCCION[0], null, null, PRODUCCION[3], null, PRODUCCION[5]], null)).toBeNull();
    expect(lecturaEscalera([], null)).toBeNull();
  });
});

describe('bandaDeLaEscalera', () => {
  it('sólo la unidad pedida, de mercado y creíble', () => {
    expect(bandaDeLaEscalera(PRODUCCION[4], 'caja')?.p25).toBe(2600);
    expect(bandaDeLaEscalera(PRODUCCION[0], 'caja')).toBeNull();
    expect(bandaDeLaEscalera(ficha('x', [banda({ p25: 100, p75: 200, de_mercado: false })]), 'unidad')).toBeNull();
    expect(bandaDeLaEscalera(ficha('x', [banda({ p25: 100, p75: 200, predictibilidad: 'baja' })]), 'unidad')).toBeNull();
    expect(bandaDeLaEscalera({ ...PRODUCCION[0], indexable: false }, 'unidad')).toBeNull();
    expect(bandaDeLaEscalera(null, 'unidad')).toBeNull();
  });
});

describe('fraseEscalera', () => {
  it('si ninguna pasa de 1,25 veces, el precio es parejo', () => {
    const filas = lecturaEscalera(PRODUCCION, null)!.grafico.filas.map((f) => ({ ...f, veces: 1.1 }));
    expect(fraseEscalera(filas)).toBe('Por estas 6 cosas, el Estado paga casi siempre lo mismo.');
  });
});

describe('la copia de PRODUCTOS_ESCALERA en scripts/verificar-produccion.sh', () => {
  const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'verificar-produccion.sh'), 'utf8');

  it('pide exactamente esos slugs, con su unidad y en su orden', () => {
    const copias = [...script.matchAll(/^escalon '([^']+)' '([^']+)'$/gm)].map((m) => [m[1], m[2]]);
    expect(copias).toEqual(PRODUCTOS_ESCALERA.map((p) => [p.slug, p.unidad]));
  });
});

describe('el tope del eje', () => {
  it('si una franja pasa del doble, el eje llega al triple', () => {
    const ancha = [...PRODUCCION];
    ancha[0] = ficha('azul-lapiz-pasta', [banda({ p25: 40, p50: 100, p75: 250, n: 10, compradores: 5 })]);
    expect(lecturaEscalera(ancha, null)!.grafico.marcas.map((m) => m.texto)).toEqual(['un tercio', 'la mediana', 'el triple']);
  });
});

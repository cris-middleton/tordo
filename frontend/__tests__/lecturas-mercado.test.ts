/**
 * Las lecturas de mercado de la portada (`lib/lecturasMercado.ts`): la frase del
 * gasto mensual y la de la concentración salen del dato con una regla, y una
 * lectura sin su dato se oculta entera.
 */
import { describe, expect, it } from 'vitest';

import { graficoGasto } from '@/lib/graficoGasto';
import {
  esMercadoPortada,
  fraseConcentracion,
  fraseGasto,
  lecturaConcentracion,
  lecturaGasto,
  pesosDeCadaDiez,
} from '@/lib/lecturasMercado';
import type { ConcentracionMercados, GastoMensual, MercadoPortada } from '@/types/publico';

const meses = (pico: number): GastoMensual[] =>
  Array.from({ length: 12 }, (_, i) => ({
    anio: 2025,
    mes: i + 1,
    sector: 'Salud',
    monto: i === 11 ? pico : 1e12,
  }));

const CONCENTRACION: ConcentracionMercados = {
  mercados: 1000,
  sobre_la_mitad: 600,
  un_proveedor: 40,
  monto_total: 10e12,
  monto_sobre_la_mitad: 5.2e12,
  tramos: Array.from({ length: 10 }, (_, i) => ({
    desde: i * 10,
    hasta: i * 10 + 10,
    mercados: 100,
    monto: i === 9 ? 2e12 : 0.8e12,
  })),
};

const MERCADO: MercadoPortada = { gasto_mensual: meses(1.6e12), concentracion: CONCENTRACION };

describe('fraseGasto', () => {
  const dosAnios = (dic2024: number, jun2024: number): GastoMensual[] =>
    Array.from({ length: 24 }, (_, i) => ({
      anio: 2024 + Math.floor(i / 12),
      mes: (i % 12) + 1,
      sector: 'Salud',
      monto: i === 11 ? dic2024 : i === 23 ? 1.8e12 : i === 5 ? jun2024 : 1e12,
    }));

  it('si el mes del pico es el más alto de cada año, lo dice', () => {
    expect(fraseGasto(graficoGasto(dosAnios(1.5e12, 1e12))!)).toBe(
      'El Estado compró $25,3 billones en 24 meses. Diciembre es el mes más alto de cada año. El de 2025 fue 1,8 veces un mes típico.',
    );
  });

  it('si otro año tuvo otro mes más alto, nombra sólo el pico', () => {
    expect(fraseGasto(graficoGasto(dosAnios(1.5e12, 1.6e12))!)).toBe(
      'El Estado compró $25,9 billones en 24 meses. Diciembre de 2025 fue el mes más alto: 1,8 veces un mes típico.',
    );
  });

  it('el total del periodo y el mes más alto, en veces un mes típico', () => {
    expect(fraseGasto(graficoGasto(meses(1.6e12))!)).toBe(
      'El Estado compró $12,6 billones en 12 meses. Diciembre de 2025 fue el mes más alto: 1,6 veces un mes típico.',
    );
  });

  it('dos veces es «el doble»', () => {
    expect(fraseGasto(graficoGasto(meses(2e12))!)).toBe(
      'El Estado compró $13 billones en 12 meses. Diciembre de 2025 fue el mes más alto: el doble de un mes típico.',
    );
  });

  it('con la hora del render, el mes en curso no entra', () => {
    const filas = [...meses(1.6e12), { anio: 2026, mes: 1, sector: 'Salud', monto: 1e9 }];
    const g = graficoGasto(filas, Date.parse('2026-01-15T12:00:00-03:00'))!;
    expect(g.meses.at(-1)!.clave).toBe('2025-12');
    expect(graficoGasto(filas)!.meses.at(-1)!.clave).toBe('2026-1');
  });

  it('bajo 1,25 veces, dice que compra parejo', () => {
    expect(fraseGasto(graficoGasto(meses(1.2e12))!)).toBe(
      'El Estado compró $12,2 billones en 12 meses. Compra parejo: ningún mes pasa de 1,2 veces un mes típico.',
    );
  });
});

describe('lecturaGasto', () => {
  it('conclusión, gráfico, pie con el periodo (sin contar órdenes) y sus enlaces', () => {
    const l = lecturaGasto(MERCADO, 'https://github.com/x/tordo')!;
    expect(l.pie).toMatch(/^Órdenes de compra de ene 2025 a dic 2025/);
    expect(l.pie).not.toMatch(/\d órdenes/);
    expect(l.pie).toContain('obras del MOP');
    expect(l.enlaces.map((e) => e.texto)).toEqual(['Los mercados por rubro', 'Cómo se calcula', 'Ver en la API', 'Código']);
  });

  it('sin el bloque o con menos de seis meses, null', () => {
    expect(lecturaGasto(null, null)).toBeNull();
    expect(lecturaGasto({ ...MERCADO, gasto_mensual: null }, null)).toBeNull();
    expect(lecturaGasto({ ...MERCADO, gasto_mensual: meses(1e12).slice(0, 5) }, null)).toBeNull();
  });
});

describe('fraseConcentracion', () => {
  it('de cada 10 pesos, con el redondeo de la frase', () => {
    expect(fraseConcentracion(0.52)).toBe(
      '5 de cada 10 pesos se gastan en mercados donde un solo proveedor se lleva la mitad o más',
    );
    expect(pesosDeCadaDiez(0.52)).toBe(5);
  });

  it('los bordes con palabras: nunca 0 ni 10 de algo que no lo es, y 1 en singular', () => {
    expect(fraseConcentracion(0)).toBe('Ningún mercado tiene un proveedor que se lleve la mitad o más');
    expect(fraseConcentracion(0.03)).toMatch(/^Menos de 1 de cada 10 pesos se gastan/);
    expect(fraseConcentracion(0.1)).toMatch(/^1 de cada 10 pesos se gasta en/);
    expect(fraseConcentracion(0.97)).toMatch(/^Casi todo el monto se gasta en/);
  });
});

describe('lecturaConcentracion', () => {
  it('diez tramos ordenados, los de la mitad o más destacados, y el alto en % del de más monto', () => {
    const l = lecturaConcentracion(MERCADO, null)!;
    expect(l.grafico.tramos).toHaveLength(10);
    expect(l.grafico.tramos.map((t) => t.destacado)).toEqual([false, false, false, false, false, true, true, true, true, true]);
    expect(l.grafico.tramos[9]).toMatchObject({ rotulo: 'Entre 90 % y 100 %', textoMonto: '$2 billones', alto: 100 });
    expect(l.grafico.tramos[0].alto).toBe(40);
    expect(l.pie).toContain('1.000 mercados');
    expect(l.pie).toContain('En 40 de ellos hay un solo proveedor');
  });

  it('sin el bloque, sin tramos o con todo en cero, null', () => {
    expect(lecturaConcentracion(null, null)).toBeNull();
    expect(lecturaConcentracion({ ...MERCADO, concentracion: null }, null)).toBeNull();
    expect(lecturaConcentracion({ ...MERCADO, concentracion: { ...CONCENTRACION, tramos: [] } }, null)).toBeNull();
    expect(lecturaConcentracion({ ...MERCADO, concentracion: { ...CONCENTRACION, monto_total: 0 } }, null)).toBeNull();
  });
});

describe('esMercadoPortada', () => {
  it('acepta la forma, con cada bloque nulo o presente', () => {
    expect(esMercadoPortada(MERCADO)).toBe(true);
    expect(esMercadoPortada({ gasto_mensual: null, concentracion: null })).toBe(true);
  });

  it('rechaza lo mal formado: un 200 raro oculta las lecturas, no tumba la portada', () => {
    expect(esMercadoPortada(null)).toBe(false);
    expect(esMercadoPortada({ gasto_mensual: [{ anio: '2025' }], concentracion: null })).toBe(false);
    expect(esMercadoPortada({ gasto_mensual: null, concentracion: { mercados: -1 } })).toBe(false);
    expect(esMercadoPortada({ gasto_mensual: null })).toBe(false);
  });
});

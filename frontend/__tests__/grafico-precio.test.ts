/**
 * La geometría del gráfico de precio (spec PORTADA_V7 §3.2, V7): un punto por
 * comprador sobre la franja P25–P75, en escala logarítmica, sin puntos ni
 * rótulos que se pisen. Los bordes de la spec: un comprador, P25 = P75,
 * compradores de otra unidad y puntos que coinciden.
 */
import { describe, expect, it } from 'vitest';

import {
  ANCHO_CARACTER,
  ANCHO_REFERENCIA,
  filasDePuntos,
  graficoPrecio,
  PASO_PUNTOS,
  plataCorta,
  valoresRedondos,
  type GraficoPrecio,
  type MarcaEje,
} from '@/lib/graficoPrecio';
import type { BandaUnidad, CompradorDeProducto } from '@/types/publico';

const BANDA: BandaUnidad = {
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
};

const comprador = (p50: number | null, unidad = 'Unidad', i = 0): CompradorDeProducto => ({
  codigo: `c${i}-${p50}`,
  nombre: `Comprador ${i}`,
  unidad,
  n: 3,
  p50,
});

const DIEZ = [95_000, 120_000, 151_000, 160_000, 175_000, 190_000, 210_000, 239_000, 280_000, 420_000].map((v, i) =>
  comprador(v, 'unidad', i),
);

/** La caja de un rótulo en px al ancho de referencia (la misma cuenta que el módulo). */
function caja(m: MarcaEje) {
  const px = (m.xTexto / 100) * ANCHO_REFERENCIA;
  const w = [...m.texto].length * ANCHO_CARACTER;
  if (m.ancla === 'start') return [px, px + w];
  if (m.ancla === 'end') return [px - w, px];
  return [px - w / 2, px + w / 2];
}

function sinPisarse(g: GraficoPrecio) {
  const cajas = g.marcas.filter((m) => m.texto).map(caja);
  for (const [i, a] of cajas.entries()) {
    expect(a[0], 'se sale por la izquierda').toBeGreaterThanOrEqual(0);
    expect(a[1], 'se sale por la derecha').toBeLessThanOrEqual(ANCHO_REFERENCIA);
    for (const b of cajas.slice(i + 1)) expect(a[1] <= b[0] || b[1] <= a[0], `${a} pisa ${b}`).toBe(true);
  }
  // Ningún par de puntos de la misma fila se toca.
  for (const [i, p] of g.puntos.entries()) {
    for (const q of g.puntos.slice(i + 1)) {
      if (p.fila !== q.fila) continue;
      expect(Math.abs(p.x - q.x) * (ANCHO_REFERENCIA / 100)).toBeGreaterThanOrEqual(PASO_PUNTOS - 0.3);
    }
  }
}

describe('plataCorta', () => {
  it.each([
    [850, '$850'],
    [4_200, '$4,2 mil'],
    [9_000, '$9 mil'],
    [150_921, '$151 mil'],
    [240_000, '$240 mil'],
    [999_700, '$1 millón'],
    [1_240_000, '$1,2 millones'],
    [15_600_000, '$16 millones'],
  ])('%d → %s', (v, texto) => {
    expect(plataCorta(v)).toBe(texto);
  });
});

describe('valoresRedondos', () => {
  it('1, 2 y 5 por una potencia de 10, dentro del rango', () => {
    expect(valoresRedondos(60_000, 600_000)).toEqual([100_000, 200_000, 500_000]);
    expect(valoresRedondos(3, 12)).toEqual([5, 10]);
  });
});

describe('filasDePuntos', () => {
  it('separados, todos en el eje', () => {
    expect(filasDePuntos([10, 30, 50])).toEqual([0, 0, 0]);
  });

  it('los que coinciden se apilan alternando arriba y abajo', () => {
    expect(filasDePuntos([50, 50, 50, 50, 50])).toEqual([0, -1, 1, -2, 2]);
  });

  it('dos a menos de un paso se apilan; a un paso justo, no', () => {
    const paso = (PASO_PUNTOS / ANCHO_REFERENCIA) * 100;
    expect(filasDePuntos([40, 40 + paso * 0.5])).toEqual([0, -1]);
    expect(filasDePuntos([40, 40 + paso])).toEqual([0, 0]);
  });
});

describe('graficoPrecio', () => {
  it('diez compradores: la franja, un punto por comprador y P25/P75 en negrita con dos de contexto', () => {
    const g = graficoPrecio(BANDA, DIEZ)!;
    expect(g.puntos).toHaveLength(10);
    expect(g.franja!.desde).toBeLessThan(g.franja!.hasta);
    const fuertes = g.marcas.filter((m) => m.fuerte).map((m) => m.texto);
    expect(fuertes).toEqual(['$151 mil', '$240 mil']);
    const contexto = g.marcas.filter((m) => !m.fuerte).map((m) => m.texto);
    expect(contexto).toEqual(['$50 mil', '$500 mil']);
    // En orden de izquierda a derecha, y la escala es logarítmica: el doble está a la misma distancia.
    expect(g.marcas.map((m) => m.x)).toEqual([...g.marcas.map((m) => m.x)].sort((a, b) => a - b));
    sinPisarse(g);
  });

  it('escala logarítmica: de $100 mil a $200 mil hay lo mismo que de $200 mil a $400 mil', () => {
    const g = graficoPrecio(BANDA, [comprador(100_000), comprador(200_000, 'unidad', 1), comprador(400_000, 'unidad', 2)])!;
    const [a, b, c] = g.puntos.map((p) => p.x);
    expect(Math.abs(b - a - (c - b))).toBeLessThanOrEqual(0.2);
  });

  it('los compradores de otra unidad no se dibujan, ni los que no tienen mediana', () => {
    const g = graficoPrecio(BANDA, [...DIEZ.slice(0, 3), comprador(5_000, 'caja', 9), comprador(null, 'unidad', 8)])!;
    expect(g.puntos).toHaveLength(3);
  });

  it('la unidad se compara sin mayúsculas ni espacios de sobra', () => {
    expect(graficoPrecio(BANDA, [comprador(180_000, ' UNIDAD ')])!.puntos).toHaveLength(1);
  });

  it('puntos que coinciden no se solapan: se apilan, y el alto lo dice', () => {
    const iguales = Array.from({ length: 5 }, (_, i) => comprador(190_000, 'unidad', i));
    const g = graficoPrecio(BANDA, iguales)!;
    expect(g.puntos.map((p) => p.fila)).toEqual([0, -1, 1, -2, 2]);
    expect(g.filas).toBe(2);
    sinPisarse(g);
  });

  it('un solo comprador: sin franja, un punto y su valor en negrita', () => {
    const g = graficoPrecio({ ...BANDA, compradores: 1, de_mercado: false }, [comprador(16_850)])!;
    expect(g.franja).toBeNull();
    expect(g.puntos).toHaveLength(1);
    expect(g.marcas.filter((m) => m.fuerte).map((m) => m.texto)).toEqual(['$17 mil']);
    sinPisarse(g);
  });

  it('un solo comprador que no viene en la lista: el punto es la mediana de la banda', () => {
    const g = graficoPrecio({ ...BANDA, compradores: 1 }, [])!;
    expect(g.puntos).toHaveLength(1);
    expect(g.marcas.find((m) => m.fuerte)!.texto).toBe('$191 mil');
  });

  it('P25 = P75: la franja es una línea y lleva un solo rótulo', () => {
    const g = graficoPrecio({ ...BANDA, p25: 16_850, p50: 16_850, p75: 16_850 }, [comprador(16_850)])!;
    expect(g.franja!.desde).toBe(g.franja!.hasta);
    expect(g.marcas.filter((m) => m.fuerte).map((m) => m.texto)).toEqual(['$17 mil']);
    sinPisarse(g);
  });

  it('P25 y P75 muy juntos: no se pisan (hacia fuera, o un solo rótulo con los dos)', () => {
    const g = graficoPrecio({ ...BANDA, p25: 150_000, p75: 158_000 }, [comprador(40_000), comprador(900_000, 'unidad', 1)])!;
    sinPisarse(g);
    expect(g.marcas.filter((m) => m.fuerte && m.texto).map((m) => m.texto).join(' ')).toMatch(/\$150 mil.*\$158 mil/);
  });

  it('una cola larga a un lado no saca ningún rótulo del gráfico', () => {
    sinPisarse(graficoPrecio({ ...BANDA, p25: 1_000, p75: 1_400 }, [comprador(1_100), comprador(2_000_000, 'unidad', 1)])!);
    sinPisarse(graficoPrecio({ ...BANDA, p25: 900_000, p75: 2_000_000 }, [comprador(3, 'unidad', 1), comprador(1_000_000)])!);
  });

  it.each([
    ['sin P25', { p25: null }],
    ['sin P75', { p75: null }],
    ['con P25 en 0', { p25: 0 }],
    ['con P75 bajo P25', { p25: 7_000, p75: 4_000 }],
  ])('%s: no hay gráfico', (_, cambio) => {
    expect(graficoPrecio({ ...BANDA, ...cambio } as BandaUnidad, DIEZ)).toBeNull();
  });

  it('sin compradores en la lista, la franja sola', () => {
    const g = graficoPrecio(BANDA, [])!;
    expect(g.puntos).toEqual([]);
    expect(g.franja).not.toBeNull();
  });
});

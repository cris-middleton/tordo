/**
 * La geometría del gasto mensual de la portada (`lib/graficoGasto.ts`): columnas
 * por mes apiladas por sector, el color fijo de cada sector, los huecos en el
 * tiempo y las marcas del eje con la unidad dicha una vez.
 */
import { describe, expect, it } from 'vitest';

import { graficoGasto, MINIMO_MESES, pasoRedondo } from '@/lib/graficoGasto';
import { SECTORES_CON_COLOR, sectorConColor } from '@/lib/sectores';
import type { GastoMensual } from '@/types/publico';

const fila = (anio: number, mes: number, sector: string, monto: number): GastoMensual => ({
  anio,
  mes,
  sector,
  monto,
});

/** Doce meses de 2025, Salud y Municipalidades; diciembre al doble. */
const ANIO = Array.from({ length: 12 }, (_, i) => [
  fila(2025, i + 1, 'Salud', (i === 11 ? 2 : 1) * 3e11),
  fila(2025, i + 1, 'Municipalidades', (i === 11 ? 2 : 1) * 2e11),
]).flat();

describe('los sectores y su color', () => {
  it('el color sigue al sector, no a su puesto', () => {
    expect(sectorConColor('Salud').fondo).toBe('bg-serie-1');
    expect(sectorConColor('Obras Públicas').fondo).toBe('bg-serie-4');
  });

  it('lo que no es uno de los cinco grandes, y lo que llega sin sector, cae en «Otros» gris', () => {
    for (const s of ['Legislativo y judicial', 'Otros', '', null, undefined]) {
      expect(sectorConColor(s).fondo).toBe('bg-serie-otros');
    }
  });

  it('cinco tonos distintos más el gris, en orden fijo', () => {
    expect(SECTORES_CON_COLOR.map((s) => s.fondo)).toEqual([
      'bg-serie-1',
      'bg-serie-2',
      'bg-serie-3',
      'bg-serie-4',
      'bg-serie-5',
      'bg-serie-otros',
    ]);
  });
});

describe('graficoGasto', () => {
  it('una columna por mes, con el total, las partes por sector y el alto en % del mes más alto', () => {
    const g = graficoGasto(ANIO)!;
    expect(g.meses).toHaveLength(12);
    const dic = g.meses[11];
    expect(dic.etiqueta).toBe('dic 2025');
    expect(dic.largo).toBe('diciembre de 2025');
    expect(dic.total).toBe(1e12);
    expect(dic.alto).toBe(100);
    expect(g.meses[0].alto).toBe(50);
    expect(dic.partes[0]).toBe(6e11);
    expect(dic.partes[1]).toBe(4e11);
  });

  it('el pico, el mes típico (la mediana) y cuántas veces', () => {
    const g = graficoGasto(ANIO)!;
    expect(g.pico.clave).toBe('2025-12');
    expect(g.tipico).toBe(5e11);
    expect(g.veces).toBe(2);
  });

  it('cada sector con su total y su parte del periodo', () => {
    const g = graficoGasto(ANIO)!;
    const salud = g.series.find((s) => s.clave === 'Salud')!;
    expect(salud.total).toBeCloseTo(3.9e12);
    expect(salud.parte).toBe(60);
    expect(salud.texto).toBe('$3,9 billones');
  });

  it('un mes que falta entre el primero y el último se pinta como hueco, no se salta', () => {
    const sinMarzo = ANIO.filter((f) => f.mes !== 3);
    const g = graficoGasto(sinMarzo)!;
    expect(g.meses).toHaveLength(12);
    expect(g.meses[2]).toMatchObject({ clave: '2025-3', total: 0, alto: 0 });
  });

  it('la unidad del eje se dice una vez y las marcas son números chicos', () => {
    const g = graficoGasto(ANIO)!;
    expect(g.unidad).toBe('En billones de pesos');
    expect(g.marcas.map((m) => m.texto)).toEqual(['$0,5', '$1']);
    expect(g.marcas.at(-1)!.y).toBe(100);
  });

  it('un rótulo por año en su enero; el del primer mes sólo si no pisa al siguiente', () => {
    const desdeNoviembre = [fila(2024, 11, 'Salud', 1e11), fila(2024, 12, 'Salud', 1e11), ...ANIO];
    expect(graficoGasto(desdeNoviembre)!.anios).toEqual([{ anio: 2025, indice: 2 }]);
    const desdeMarzo = [fila(2024, 3, 'Salud', 1e11), ...ANIO];
    expect(graficoGasto(desdeMarzo)!.anios[0]).toEqual({ anio: 2024, indice: 0 });
  });

  it(`con menos de ${MINIMO_MESES} meses, una fila ilegible o todo en cero: null`, () => {
    expect(graficoGasto(ANIO.filter((f) => f.mes <= MINIMO_MESES - 1))).toBeNull();
    expect(graficoGasto([...ANIO, fila(2025, 13, 'Salud', 1)])).toBeNull();
    expect(graficoGasto([...ANIO, fila(2025, 1, 'Salud', -1)])).toBeNull();
    expect(graficoGasto(ANIO.map((f) => ({ ...f, monto: 0 })))).toBeNull();
    expect(graficoGasto(null)).toBeNull();
    expect(graficoGasto([])).toBeNull();
  });
});

describe('pasoRedondo', () => {
  it('1, 2 o 5 por una potencia de diez, y deja dos o tres marcas bajo el máximo', () => {
    expect(pasoRedondo(1e12)).toBe(5e11);
    expect(pasoRedondo(1.8e12)).toBe(1e12);
    expect(pasoRedondo(7e11)).toBe(5e11);
    expect(pasoRedondo(3e8)).toBe(1e8);
  });
});

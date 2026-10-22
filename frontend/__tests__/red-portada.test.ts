import { describe, expect, it } from 'vitest';

import { ALTO, ANCHO, esRed, fraseRed, graficoRed, lecturaRed, MINIMO_COMPRADORES } from '@/lib/redPortada';
import type { RedPortada } from '@/types/publico';

/**
 * La red de la portada (`lib/redPortada.ts`): la forma del dato, la frase con su
 * regla y la disposición —compradores en un anillo, proveedores adentro—.
 */

const RED: RedPortada = {
  compradores: Array.from({ length: 12 }, (_, i) => ({
    codigo: String(100 + i),
    nombre: `SERVICIO DE SALUD ${i}`,
    sector: i < 6 ? 'Salud' : i < 9 ? 'Municipalidades' : null,
    monto: (12 - i) * 1e11,
  })),
  proveedores: [
    { codigo: 'a', nombre: 'LE VENDE A TODOS SPA', monto: 3e9, compradores: 12 },
    { codigo: 'b', nombre: 'CONTRATO GRANDE S.A.', monto: 9e10, compradores: 1 },
    { codigo: 'c', nombre: 'SIN ENLACES LTDA', monto: 1e9, compradores: 0 },
  ],
  enlaces: [
    ...Array.from({ length: 12 }, (_, i) => ({ comprador: String(100 + i), proveedor: 'a', monto: 2e8 })),
    { comprador: '100', proveedor: 'b', monto: 9e10 },
  ],
  monto_total: 10e12,
  monto_compradores: 6.2e12,
  proveedores_total: 14_659,
  a_la_mitad_o_mas: 40,
  ventana_desde: '2023-11-01',
  ventana_hasta: '2026-10-31',
};

describe('esRed', () => {
  it('acepta la forma de la API', () => expect(esRed(RED)).toBe(true));
  it.each([
    ['nula', null],
    ['sin enlaces', { ...RED, enlaces: undefined }],
    ['un monto negativo', { ...RED, compradores: [{ ...RED.compradores[0], monto: -1 }] }],
    ['una ventana ilegible', { ...RED, ventana_desde: 'ayer' }],
  ])('rechaza %s', (_, r) => expect(esRed(r)).toBe(false));
});

describe('fraseRed', () => {
  it('cuántos proveedores y cuántos le venden a la mitad o más', () => {
    expect(fraseRed(RED, 30)).toBe(
      'Los 30 organismos que más compran le compraron a 14.659 proveedores. 40 le venden a la mitad de ellos o más.',
    );
  });
  it('uno y ninguno, en palabras', () => {
    expect(fraseRed({ ...RED, a_la_mitad_o_mas: 1 }, 30)).toMatch(/Uno le vende a la mitad de ellos o más\.$/);
    expect(fraseRed({ ...RED, a_la_mitad_o_mas: 0 }, 30)).toMatch(/Ninguno le vende a la mitad de ellos\.$/);
  });
});

describe('graficoRed', () => {
  const g = graficoRed(RED)!;
  const compradores = g.nodos.filter((d) => d.tipo === 'comprador');
  const proveedores = g.nodos.filter((d) => d.tipo === 'proveedor');

  it('un nodo por comprador y por proveedor con enlaces; el que no tiene ninguno, fuera', () => {
    expect(compradores).toHaveLength(12);
    expect(proveedores.map((d) => d.nombre)).toEqual(['Le Vende a Todos SpA', 'Contrato Grande S.A.']);
  });

  it('los compradores en el anillo, los proveedores dentro, todo dentro del lienzo', () => {
    const cx = ANCHO / 2;
    const cy = ALTO / 2;
    const radio = (d: { x: number; y: number }) => Math.hypot((d.x - cx) / (ANCHO / 2), (d.y - cy) / (ALTO / 2));
    const anillo = Math.min(...compradores.map(radio));
    for (const p of proveedores) expect(radio(p)).toBeLessThan(anillo);
    for (const d of g.nodos) {
      expect(d.x - d.r).toBeGreaterThanOrEqual(0);
      expect(d.x + d.r).toBeLessThanOrEqual(ANCHO);
      expect(d.y - d.r).toBeGreaterThanOrEqual(0);
      expect(d.y + d.r).toBeLessThanOrEqual(ALTO);
    }
  });

  it('el que le vende a todos queda más cerca del centro que el de un solo comprador', () => {
    const cx = ANCHO / 2;
    const cy = ALTO / 2;
    const [todos, uno] = proveedores;
    expect(Math.hypot(todos.x - cx, todos.y - cy)).toBeLessThan(Math.hypot(uno.x - cx, uno.y - cy));
    expect(todos.amplio).toBe(true);
    expect(uno.amplio).toBe(false);
  });

  it('determinista: las mismas entradas dan las mismas posiciones (el servidor y el cliente pintan lo mismo)', () => {
    expect(graficoRed(RED)).toEqual(g);
  });

  it('el sector sin nombre cae en «Otros», y la leyenda sigue el orden fijo', () => {
    expect(g.sectores.map((s) => s.nombre)).toEqual(['Salud', 'Municipalidades', 'Otros']);
  });

  it(`con menos de ${MINIMO_COMPRADORES} compradores no hay red`, () => {
    expect(graficoRed({ ...RED, compradores: RED.compradores.slice(0, MINIMO_COMPRADORES - 1) })).toBeNull();
  });
});

describe('lecturaRed', () => {
  it('el pie dice qué se dibuja, de cuándo, qué parte del gasto es y que no hay personas naturales', () => {
    const l = lecturaRed({ red: RED }, null)!;
    expect(l.pie).toBe(
      'Los 12 organismos que más compraron de nov 2023 a oct 2026 (62 % de lo que compró el Estado) y sus proveedores: ' +
        'los más grandes de cada uno y los que le venden a más de ellos. El tamaño es lo que compró o vendió. Sin personas naturales.',
    );
    expect(l.accesible[0]).toEqual({ nombre: 'Le Vende a Todos SpA', vecinos: 12, texto: '$3 mil millones' });
  });

  it('sin el bloque (un backend anterior) o mal formado, no hay lectura', () => {
    expect(lecturaRed({}, null)).toBeNull();
    expect(lecturaRed({ red: null }, null)).toBeNull();
    expect(lecturaRed({ red: { ...RED, enlaces: 'x' } }, null)).toBeNull();
    expect(lecturaRed(null, null)).toBeNull();
  });
});

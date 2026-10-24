import { describe, expect, it } from 'vitest';

import { ALTO, ANCHO, esRed, fraseRed, graficoRed, lecturaRed, LIENZO_MOVIL, MINIMO_COMPRADORES, rotularCompradores, type NodoRed } from '@/lib/redPortada';
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
  it('una frase, con el número: a 15 o más de los 30, no «a la mitad o más de»', () => {
    expect(fraseRed(RED, 30, 15)).toBe('40 proveedores le venden a 15 o más de los 30 compradores que más compran.');
  });
  it('uno y ninguno, en palabras', () => {
    expect(fraseRed({ ...RED, a_la_mitad_o_mas: 1 }, 30, 15)).toBe(
      'Un proveedor le vende a 15 o más de los 30 compradores que más compran.',
    );
    expect(fraseRed({ ...RED, a_la_mitad_o_mas: 0 }, 30, 15)).toBe(
      'Ningún proveedor le vende a 15 o más de los 30 compradores que más compran.',
    );
  });
});

describe('detalleRed', () => {
  it('dice dónde se ven, y cuántos se dibujan si son menos de los que cuenta la conclusión', async () => {
    const { detalleRed } = await import('@/lib/redPortada');
    expect(detalleRed(RED, 40)).toBe('Son los puntos llenos del centro. Cerca del borde, los que le venden a uno solo.');
    expect(detalleRed(RED, 12)).toBe(
      'Son los puntos llenos del centro (aquí, los 12 que más venden). Cerca del borde, los que le venden a uno solo.',
    );
    expect(detalleRed({ a_la_mitad_o_mas: 1 }, 1)).toBe(
      'Es el punto lleno del centro. Cerca del borde, los que le venden a uno solo.',
    );
    expect(detalleRed({ a_la_mitad_o_mas: 0 }, 0)).toBeNull();
  });
  it('sin la mediana de lo vendido: tres cifras en dos frases no se entendían', async () => {
    const { detalleRed } = await import('@/lib/redPortada');
    expect(detalleRed(RED, 12)).not.toMatch(/\$/);
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

  it('en el lienzo del teléfono, todo dentro y los proveedores dentro del anillo', () => {
    const m = graficoRed(RED, LIENZO_MOVIL)!;
    expect([m.ancho, m.alto]).toEqual([400, 380]);
    for (const d of m.nodos) {
      expect(d.x - d.r).toBeGreaterThanOrEqual(0);
      expect(d.x + d.r).toBeLessThanOrEqual(400);
      expect(d.y - d.r).toBeGreaterThanOrEqual(0);
      expect(d.y + d.r).toBeLessThanOrEqual(380);
    }
  });

  it(`con menos de ${MINIMO_COMPRADORES} compradores no hay red`, () => {
    expect(graficoRed({ ...RED, compradores: RED.compradores.slice(0, MINIMO_COMPRADORES - 1) })).toBeNull();
  });
});

describe('lecturaRed', () => {
  it('el pie dice qué se dibuja, de cuándo, qué parte del gasto es y que no hay personas naturales', () => {
    const l = lecturaRed({ red: RED }, null)!;
    expect(l.pie).toBe(
      'Los 12 compradores que más compraron de nov 2023 a oct 2026 (62 % de lo que compró el Estado) le compraron a 14.659 proveedores. ' +
        'Aquí, los cuatro más grandes de cada uno y los que le venden a más de ellos. El tamaño es lo que compró o vendió. ' +
        'Sin personas naturales.',
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

describe('nombreCorto', () => {
  it('las siglas conocidas, sin «Ilustre» y cortado en una palabra', async () => {
    const { nombreCorto } = await import('@/lib/redPortada');
    expect(nombreCorto('Central de Abastecimiento del Sistema Nacional de Servicios de Salud')).toBe('Cenabast');
    expect(nombreCorto('I Municipalidad de Puente Alto')).toBe('Municipalidad de Puente Alto');
    expect(nombreCorto('Servicio de Salud Metropolitano Sur Oriente')).toBe('Servicio de Salud…');
  });
});

describe('rotularCompradores', () => {
  const comprador = (id: string, nombre: string, monto: number, x: number, y: number): NodoRed => ({
    id,
    tipo: 'comprador',
    nombre,
    monto,
    texto: '',
    vecinos: 0,
    sector: null,
    amplio: false,
    x,
    y,
    r: 10,
  });
  const lienzo = { ancho: 640, alto: 420 };

  it('pone cada rótulo del lado de adentro de su nodo', () => {
    const r = rotularCompradores(
      [comprador('c:1', 'Junaeb', 3, 600, 200), comprador('c:2', 'Junji', 2, 40, 200)],
      lienzo,
      3,
    );
    expect(r.map((x) => x.lado)).toEqual(['izquierda', 'derecha']);
  });

  it('dos nodos vecinos no montan sus nombres: el que choca baja bajo su nodo', () => {
    // Como en producción el 2026-10-22: Cenabast y el Fondo Nacional de Salud, pegados arriba.
    const r = rotularCompradores(
      [
        comprador('c:1', 'Fondo Nacional de Salud', 3, 380, 30),
        comprador('c:2', 'Central de Abastecimiento del S.N.S.S.', 2, 330, 20),
        comprador('c:3', 'Junaeb', 1, 330, 380),
      ],
      lienzo,
      3,
    );
    expect(r.map((x) => [x.id, x.lado])).toEqual([
      ['c:1', 'abajo'],
      ['c:2', 'izquierda'],
      ['c:3', 'izquierda'],
    ]);
  });

  it('se queda en los de más monto aunque alguno no quepa', () => {
    const nodos = Array.from({ length: 6 }, (_, i) => comprador(`c:${i}`, `Comprador ${i}`, 10 - i, 600, 40 + i * 60));
    expect(rotularCompradores(nodos, lienzo, 3).map((x) => x.id)).toEqual(['c:0', 'c:1', 'c:2']);
  });

  it('no tapa el nodo de otro comprador: sube encima del suyo', () => {
    // Junaeb abajo, con una municipalidad justo a su derecha (producción, 2026-10-22).
    const r = rotularCompradores(
      [comprador('c:1', 'Junaeb', 2, 290, 388), comprador('c:2', 'Municipalidad de Maipú', 1, 340, 390)],
      lienzo,
      1,
    );
    expect(r).toEqual([expect.objectContaining({ id: 'c:1', lado: 'arriba' })]);
  });
});

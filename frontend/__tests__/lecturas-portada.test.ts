/**
 * Las lecturas del panel de la portada (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md
 * §3.2–§3.5 y §8): cada frase sale del dato, con reglas, y cada regla se fija
 * aquí con sus bordes. «Salud y municipios compran casi lo mismo» es verdad hoy
 * y puede no serlo el domingo (D8).
 *
 * Sin dato que pintar con verdad, una lectura devuelve `null` y la portada la
 * oculta entera (principio 4): sin periodo, sin p25/p75, tramos que no suman.
 */
import { describe, expect, it } from 'vitest';

import {
  BARRAS_SECTOR,
  esSectores,
  lecturaSectores,
  nombreSector,
  UMBRAL_EMPATE,
} from '@/lib/lecturasPortada';
import { textoPeriodo } from '@/lib/periodo';
import type { SectorBI, SectoresBI } from '@/types/bi';

// ── Lectura 1: quién compra ─────────────────────────────────────────────────

const VENTANA = { ventana_desde: '2023-11-01', ventana_hasta: '2026-10-11' };

function fila(
  sector: string,
  monto_total: number,
  ventana: Pick<SectorBI, 'ventana_desde' | 'ventana_hasta'> = VENTANA,
): SectorBI {
  return { sector, monto_total, ...ventana };
}

const respuesta = (...sectores: SectorBI[]): SectoresBI => ({ disponible: true, sectores, total: sectores.length });

/** Los siete sectores de los datos locales (6 meses), con su monto real. */
const SIETE = respuesta(
  fila('Salud', 2.9816e12),
  fila('Municipalidades', 2.9484e12),
  fila('Gob. Central, Universidades', 1.9975e12),
  fila('Obras Públicas', 1.8626e12),
  fila('FFAA', 3.8045e11),
  fila('Otros', 1.5986e11),
  fila('Legislativo y judicial', 7.3408e10),
);

describe('lecturaSectores', () => {
  it('con los datos locales: Salud y municipios empatan, cuatro barras y las dos primeras pintadas', () => {
    const l = lecturaSectores(SIETE)!;
    expect(l.conclusion).toBe('Salud y municipios compran casi lo mismo');
    expect(l.pie).toBe(`Órdenes de compra, ${textoPeriodo({ desde: '2023-11-01', hasta: '2026-10-11' })}`);
    expect(l.pie).toMatch(/\(36 meses\)$/);
    expect(l.enlace).toEqual({ texto: 'Ver mercados', href: '/mercado' });
    expect(l.barras.map((b) => [b.nombre, b.monto, b.destacada])).toEqual([
      ['Salud', '$3 billones', true],
      ['Municipalidades', '$2,9 billones', true],
      ['Gob. central', '$2 billones', false],
      ['Obras públicas', '$1,9 billones', false],
    ]);
    expect(l.barras).toHaveLength(BARRAS_SECTOR);
    // El ancho es relativo al primero, con un decimal: 1,8626 / 2,9816 = 62,47 %.
    expect(l.barras.map((b) => b.ancho)).toEqual([100, 98.9, 67, 62.5]);
  });

  it(`el ${UMBRAL_EMPATE * 100} % justo NO es empate: se pinta uno y la frase reparte $100`, () => {
    const l = lecturaSectores(respuesta(fila('Salud', 100), fila('Municipalidades', 95)))!;
    expect(l.conclusion).toBe('Salud gasta $51 de cada $100 en órdenes de compra');
    expect(l.barras.map((b) => b.destacada)).toEqual([true, false]);
  });

  it('un pelo por debajo del 5 % sí es empate', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 100), fila('Municipalidades', 95.01)))!;
    expect(l.conclusion).toBe('Salud y municipios compran casi lo mismo');
  });

  it('«Otros» entre los cuatro primeros se salta y entra el quinto; el reparto cuenta todos', () => {
    const l = lecturaSectores(
      respuesta(
        fila('Salud', 100),
        fila('Otros', 90),
        fila('Municipalidades', 80),
        fila('Gob. Central, Universidades', 70),
        fila('Obras Públicas', 60),
      ),
    )!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud', 'Municipalidades', 'Gob. central', 'Obras públicas']);
    // 100 sobre 400 (Otros incluido): la frase habla de todas las órdenes de la respuesta.
    expect(l.conclusion).toBe('Salud gasta $25 de cada $100 en órdenes de compra');
  });

  it('un sector sin nombre («NA», está en el fixture del golden) tampoco ocupa barra, pero suma en el reparto', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 100), fila('NA', 90), fila('Municipalidades', 10)))!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud', 'Municipalidades']);
    // 100 sobre 200 (NA incluido).
    expect(l.conclusion).toBe('Salud gasta $50 de cada $100 en órdenes de compra');
  });

  it('un solo sector: gasta los $100 y se pinta', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 7)))!;
    expect(l.conclusion).toBe('Salud gasta $100 de cada $100 en órdenes de compra');
    expect(l.barras).toEqual([{ nombre: 'Salud', monto: '$7', ancho: 100, destacada: true }]);
  });

  it('el reparto de $100 con decimales se redondea a entero', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 2), fila('Municipalidades', 1)))!;
    expect(l.conclusion).toBe('Salud gasta $67 de cada $100 en órdenes de compra');
    expect(l.barras[1].ancho).toBe(50);
  });

  it('un sector fuera del mapa sale con su nombre tal cual, en la barra y en la frase', () => {
    const l = lecturaSectores(respuesta(fila('Bomberos de Chile', 300), fila('FFAA', 100)))!;
    expect(l.conclusion).toBe('Bomberos de Chile gasta $75 de cada $100 en órdenes de compra');
    expect(l.barras.map((b) => b.nombre)).toEqual(['Bomberos de Chile', 'FFAA']);
  });

  it('la frase empieza con mayúscula aunque el nombre de la frase no', () => {
    const l = lecturaSectores(respuesta(fila('Municipalidades', 100), fila('Salud', 99)))!;
    expect(l.conclusion).toBe('Municipios y Salud compran casi lo mismo');
  });

  it('ordena por monto aunque el backend no lo haga', () => {
    const l = lecturaSectores(respuesta(fila('Municipalidades', 10), fila('Salud', 100)))!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud', 'Municipalidades']);
  });

  it.each([
    ['sin respuesta (el backend falló o dio 503)', null],
    ['disponible: false (tabla ausente)', { disponible: false, motivo: 'parquet no generado' }],
    ['sin filas', respuesta()],
    ['sólo «Otros»', respuesta(fila('Otros', 10))],
    ['sin ventana (la semanal aún no la escribió)', respuesta(fila('Salud', 10, { ventana_desde: null, ventana_hasta: null }))],
    ['sin ventana porque el backend es anterior', respuesta({ sector: 'Salud', monto_total: 10 })],
    ['con la ventana a medias', respuesta(fila('Salud', 10, { ventana_desde: '2023-11-01', ventana_hasta: null }))],
    ['con todo en cero', respuesta(fila('Salud', 0), fila('Municipalidades', 0))],
  ])('%s: se oculta', (_, datos) => {
    expect(lecturaSectores(datos as SectoresBI | null)).toBeNull();
  });
});

describe('nombreSector', () => {
  it('un nombre para la barra y otro para la frase', () => {
    expect(nombreSector('Municipalidades')).toEqual({ barra: 'Municipalidades', frase: 'municipios' });
    expect(nombreSector('Gob. Central, Universidades')).toEqual({ barra: 'Gob. central', frase: 'Gob. central' });
    expect(nombreSector('Obras Públicas')).toEqual({ barra: 'Obras públicas', frase: 'Obras públicas' });
  });

  it('fuera del mapa, tal cual (sin espacios de sobra)', () => {
    expect(nombreSector(' Salud ')).toEqual({ barra: 'Salud', frase: 'Salud' });
  });
});

describe('esSectores', () => {
  it('acepta la respuesta buena, la de «no disponible» y filas sin ventana', () => {
    expect(esSectores(SIETE)).toBe(true);
    expect(esSectores({ disponible: false, motivo: 'parquet no generado' })).toBe(true);
    expect(esSectores({ disponible: true, sectores: [{ sector: 'Salud', monto_total: 1 }] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['un texto', 'raro'],
    ['sin disponible', { sectores: [] }],
    ['disponible sin lista', { disponible: true }],
    ['una fila nula', { disponible: true, sectores: [null] }],
    ['un sector nulo', { disponible: true, sectores: [{ sector: null, monto_total: 1 }] }],
    ['un sector vacío', { disponible: true, sectores: [{ sector: '  ', monto_total: 1 }] }],
    ['un monto de texto', { disponible: true, sectores: [{ sector: 'Salud', monto_total: '1' }] }],
    ['un monto negativo', { disponible: true, sectores: [{ sector: 'Salud', monto_total: -1 }] }],
    ['una ventana que no es fecha', { disponible: true, sectores: [{ ...fila('Salud', 1), ventana_desde: 2023 }] }],
  ])('rechaza %s', (_, datos) => {
    expect(esSectores(datos)).toBe(false);
  });
});

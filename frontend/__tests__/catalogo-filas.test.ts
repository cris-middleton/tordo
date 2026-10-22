import { describe, expect, it } from 'vitest';

import {
  FILTROS_POR_DEFECTO,
  OPCIONES_ORDEN,
  ORDENES,
  claveOrden,
  ordenDeClave,
} from '@/lib/filtrosCatalogo';
import { cierreEnPalabras } from '@/lib/licitacionEstado';

// Jueves 16-10-2026, 21:30 en Santiago (UTC-3): ya es viernes en UTC.
const AHORA = new Date('2026-10-17T00:30:00Z');

describe('cierreEnPalabras', () => {
  it('cuenta días de calendario de Chile, no de UTC', () => {
    // 23:00 del mismo jueves en Santiago: hoy, aunque en UTC ya sea viernes.
    expect(cierreEnPalabras('2026-10-17T02:00:00Z', AHORA)).toEqual({ texto: 'Cierra hoy a las 23:00', urgente: true });
    // 09:00 del viernes en Santiago.
    expect(cierreEnPalabras('2026-10-17T12:00:00Z', AHORA)).toEqual({ texto: 'Cierra mañana a las 09:00', urgente: true });
  });

  it('después de mañana, la fecha con su hora: la misma forma en todo el sitio', () => {
    expect(cierreEnPalabras('2026-10-20T15:00:00Z', AHORA)?.texto).toBe('Cierra el 20 oct a las 12:00');
    expect(cierreEnPalabras('2026-10-30T15:00:00Z', AHORA)?.texto).toBe('Cierra el 30 oct a las 12:00');
    // El año, sólo si no es el de ahora.
    expect(cierreEnPalabras('2027-01-05T15:00:00Z', AHORA)?.texto).toBe('Cierra el 5 ene 2027 a las 12:00');
  });

  it('lo cerrado dice cuándo cerró, sin urgencia', () => {
    expect(cierreEnPalabras('2026-10-12T15:00:00Z', AHORA)).toEqual({ texto: 'Cerró el 12 oct', urgente: false });
  });

  it('sin fecha o con una ilegible, nada', () => {
    expect(cierreEnPalabras(null, AHORA)).toBeNull();
    expect(cierreEnPalabras('mañana', AHORA)).toBeNull();
  });
});

describe('el orden en un solo desplegable', () => {
  it('cada par de la URL tiene su opción, así que ninguna URL antigua queda sin etiqueta', () => {
    for (const sort_by of ORDENES) {
      for (const sort_order of ['asc', 'desc'] as const) {
        const clave = claveOrden({ sort_by, sort_order });
        expect(OPCIONES_ORDEN.some((o) => claveOrden(o) === clave)).toBe(true);
      }
    }
  });

  it('ida y vuelta, y una clave desconocida vale el orden por defecto', () => {
    for (const o of OPCIONES_ORDEN) expect(ordenDeClave(claveOrden(o))).toEqual({ sort_by: o.sort_by, sort_order: o.sort_order });
    expect(ordenDeClave('basura')).toEqual({
      sort_by: FILTROS_POR_DEFECTO.sort_by,
      sort_order: FILTROS_POR_DEFECTO.sort_order,
    });
  });
});

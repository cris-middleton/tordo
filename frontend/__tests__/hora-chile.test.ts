/**
 * Fechas en hora de Chile. La API manda instantes en UTC: cortar el texto daba
 * el día en UTC (un cierre a las 22:00 de Santiago salía al día siguiente) y
 * `date-fns` formateaba en el huso del navegador.
 */
import { describe, expect, it } from 'vitest';

import { cierreFijo, fechaCortaDeChile, fechaLargaDeChile, instanteDeChile } from '@/lib/horaChile';

describe('hora de Chile', () => {
  it('un cierre a las 22:30 de Santiago es de ese día, no del siguiente', () => {
    // Octubre: horario de verano, UTC−3.
    expect(fechaCortaDeChile('2026-10-22T01:30:00Z')).toBe('21 oct 2026');
    // Julio: UTC−4.
    expect(fechaCortaDeChile('2026-07-02T03:00:00Z')).toBe('1 jul 2026');
  });

  it('una fecha sola no se mueve de día', () => {
    expect(fechaCortaDeChile('2026-10-04')).toBe('4 oct 2026');
    expect(fechaLargaDeChile('2026-10-04', true)).toBe('4 de octubre de 2026');
  });

  it('la fecha larga, con hora si se pide', () => {
    expect(fechaLargaDeChile('2026-10-21T21:00:00Z')).toBe('21 de octubre de 2026');
    expect(fechaLargaDeChile('2026-10-21T21:00:00Z', true)).toBe('21 de octubre de 2026, 18:00');
  });

  it('el cierre fijo, sin «hoy» ni cuenta atrás', () => {
    expect(cierreFijo('2026-10-22T21:05:00Z')).toBe('Cierra el 22 oct a las 18:05');
    expect(cierreFijo('2026-10-22')).toBeNull();
    expect(cierreFijo(null)).toBeNull();
    expect(cierreFijo('mañana')).toBeNull();
    expect(cierreFijo(42 as unknown as string)).toBeNull();
  });

  it('las 09:00 de Santiago de un día, en verano y en invierno', () => {
    expect(instanteDeChile('2026-10-20', 9)?.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(instanteDeChile('2026-07-01', 9)?.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(instanteDeChile('2026-10-20T00:00:00Z', 9)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { buildNarrative } from '@/lib/narrative';
import type { DashboardHomeResponse } from '@/types/dashboardHome';

const baseResponse: DashboardHomeResponse = {
  empresa: { id: 'e1', nombre: 'Test', rut: '1-1', estado_habil: 'habil', estado_habil_updated_at: null },
  resumen: {
    matches_semana: 0,
    matches_72h: 0,
    postulaciones_activas: 0,
    postulaciones_cierran_72h: 0,
    docs_por_vencer_30d: 0,
    docs_por_vencer_7d: 0,
    adjudicaciones_mes: 0,
    enviadas_mes: 0,
  },
  urgencias: [],
  matches: [],
  matches_cached_at: null,
  matches_total_disponibles: 0,
  pipeline: {
    en_seguimiento: 0,
    en_preparacion: 0,
    enviada: 0,
    adjudicada: 0,
    no_adjudicada: 0,
    tasa_adjudicacion_90d: null,
    decididas_90d: 0,
  },
  trend: {
    disponible: false,
    postulaciones_semana: [],
    tasa_adjudicacion_actual: null,
    tasa_adjudicacion_anterior: null,
    delta_enviadas_pp: null,
  },
  plan: { tier: 'paid', matches_visibles: 3 },
};

describe('buildNarrative', () => {
  it('returns greeting + empty-state phrase when nothing is happening', () => {
    const out = buildNarrative({ data: baseResponse, firstName: 'Cristián', now: new Date('2026-04-19T08:00:00-03:00') });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toMatch(/Cristián/);
    expect(out.join(' ')).toMatch(/Aprovecha|Sin novedades|Día tranquilo|despejado/i);
  });

  it('omits zero-value phrases', () => {
    const data = { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 5 } };
    const out = buildNarrative({ data, firstName: 'Ana', now: new Date('2026-04-19T08:00:00-03:00') });
    expect(out.join(' ')).not.toMatch(/0 postulaciones|0 documento|0 matches/);
  });

  it('mentions estado inhábil when estado is not habil', () => {
    const data = {
      ...baseResponse,
      empresa: { ...baseResponse.empresa!, estado_habil: 'inhabil' },
      resumen: { ...baseResponse.resumen, docs_por_vencer_30d: 2 },
    };
    const out = buildNarrative({ data, firstName: 'Pedro', now: new Date('2026-04-19T15:00:00-03:00') });
    expect(out.join(' ').toLowerCase()).toMatch(/inhábil|inhabil/);
  });

  it('uses morning greeting before noon, afternoon between 12 and 19, evening after 19', () => {
    const morning = buildNarrative({ data: baseResponse, firstName: 'X', now: new Date('2026-04-19T08:00:00-03:00') });
    const afternoon = buildNarrative({ data: baseResponse, firstName: 'X', now: new Date('2026-04-19T15:00:00-03:00') });
    const evening = buildNarrative({ data: baseResponse, firstName: 'X', now: new Date('2026-04-19T20:00:00-03:00') });
    expect(morning[0].toLowerCase()).toMatch(/buenos días|buen día|hola|arrancando|empezamos|cómo va|bienvenido|listo/);
    expect(afternoon[0].toLowerCase()).toMatch(/buenas tardes|hola|cómo vas|buen día|en la mitad|de vuelta|espero/);
    expect(evening[0].toLowerCase()).toMatch(/buenas noches|cerrando|última pasada|hola|resumen/);
  });

  it('produces stable output for the same date but rotates across days', () => {
    const day1a = buildNarrative({ data: { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 8, matches_72h: 2 } }, firstName: 'X', now: new Date('2026-04-19T08:00:00-03:00') });
    const day1b = buildNarrative({ data: { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 8, matches_72h: 2 } }, firstName: 'X', now: new Date('2026-04-19T20:00:00-03:00') });
    const day2 = buildNarrative({ data: { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 8, matches_72h: 2 } }, firstName: 'X', now: new Date('2026-04-20T08:00:00-03:00') });
    expect(day1a[1]).toEqual(day1b[1]);
    expect(day1a[1]).not.toEqual(day2[1]);
  });
});

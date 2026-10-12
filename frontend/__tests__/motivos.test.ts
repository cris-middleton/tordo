/**
 * Un diagnóstico del backend no llega a la pantalla del cliente.
 *
 * La ficha de una licitación decía «organismo_id no disponible» y «licitación
 * no encontrada en histórico», y el encaje podía decir «Modelo TF-IDF no
 * entrenado. Ejecute: python -m …». La lista es blanca: lo nuevo cae en el
 * respaldo sin que nadie tenga que acordarse de bloquearlo.
 */

import { describe, expect, it } from 'vitest';

import { motivoParaPersona } from '@/lib/motivos';

const RESPALDO = 'Todavía no tenemos datos.';

describe('motivoParaPersona', () => {
  it.each([
    'organismo_id no disponible',
    'licitación no encontrada en histórico',
    'parquet no generado',
    'parquet window_classified no generado — ejecute el ETL de analytics',
    'Modelo TF-IDF no entrenado. Ejecute: python -m etl.analytics.run_all --modulo tfidf_matcher',
    'producto no encontrado en histórico (L1+L2+L3+L4)',
    'un motivo nuevo que nadie revisó',
    // De cuando había cuentas: ya no hay una empresa a la que referirse.
    "Tu empresa no tiene historial de órdenes en 'Aseo'",
  ])('«%s» no se enseña', (motivo) => {
    expect(motivoParaPersona(motivo, RESPALDO)).toBe(RESPALDO);
  });

  it('los escritos para el usuario sí, con mayúscula inicial', () => {
    expect(motivoParaPersona("sin datos para el rubro 'Aseo'", RESPALDO)).toBe(
      "Sin datos para el rubro 'Aseo'",
    );
    expect(motivoParaPersona('la descripción no se parece a ningún rubro conocido', RESPALDO)).toBe(
      'La descripción no se parece a ningún rubro conocido',
    );
  });

  it('sin motivo, el respaldo', () => {
    expect(motivoParaPersona(null, RESPALDO)).toBe(RESPALDO);
    expect(motivoParaPersona(undefined, RESPALDO)).toBe(RESPALDO);
  });
});

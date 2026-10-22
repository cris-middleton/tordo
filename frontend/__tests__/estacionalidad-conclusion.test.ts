import { describe, expect, it } from 'vitest';

import { conclusionDeMeses } from '@/app/(panel)/mercado/components/EstacionalidadSection';

const meses = (probs: number[]) => probs.map((prob, i) => ({ mes: i + 1, prob }));

describe('conclusionDeMeses', () => {
  it('con picos del ETL, los nombra', () => {
    expect(conclusionDeMeses(meses(Array(12).fill(1 / 12)), ['marzo'])).toBe('Compra sobre todo en marzo.');
  });

  it('sin picos marcados, los tres meses que suman la mitad o más: nunca «parejo» sobre un 38 % en febrero', () => {
    // Padre Hurtado en papel: feb 38 %, mar 25 %, oct 13 %, nov 19 %, dic 6 %, el resto 0.
    const p = meses([0, 0.38, 0.25, 0, 0, 0, 0, 0, 0, 0.13, 0.19, 0.06]);
    expect(conclusionDeMeses(p, [])).toBe('Compra sobre todo en febrero, marzo y noviembre.');
  });

  it('parejo sólo si ningún mes pasa del 15 %', () => {
    expect(conclusionDeMeses(meses(Array(12).fill(1 / 12)), [])).toBe('Compra parejo todo el año.');
  });

  it('entre las dos, el mes mayor', () => {
    const p = meses([0.16, 0.12, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.06, 0.05, 0.05]);
    expect(conclusionDeMeses(p, [])).toBe('Compra todo el año, con más en enero.');
  });

  it('sin compras, lo dice', () => {
    expect(conclusionDeMeses(meses(Array(12).fill(0)), [])).toBe('No hay compras en el rubro para ver en qué meses.');
  });
});

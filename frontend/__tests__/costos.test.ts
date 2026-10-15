// @vitest-environment node
/**
 * El costo de mantener el sitio, por concepto (`/apoyar#costos`, spec del rediseño R6).
 *
 * **Ninguna cifra sin fuente** (la regla de los explicativos, CLAUDE.md): cada
 * fila cita un fragmento LITERAL de un documento del repositorio, y ese
 * fragmento contiene la cifra que se publica. Si alguien corrige el documento,
 * este test falla hasta que la página diga lo mismo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COSTOS,
  COSTO_MENSUAL_APROXIMADO,
  ETIQUETA_BASE,
  TOTAL,
  USO_INCLUIDO_EN_EL_PLAN,
  USO_RAILWAY_PROYECTADO,
  type FuenteCosto,
} from '@/lib/costos';

const RAIZ = join(__dirname, '..', '..');
const normalizar = (s: string) => s.replace(/\s+/g, ' ');
const sinUS = (s: string) => s.replace(/US\$/g, '$');

function citaPresente(f: FuenteCosto) {
  const texto = normalizar(readFileSync(join(RAIZ, f.archivo), 'utf-8'));
  expect(texto, `${f.archivo} ya no dice «${f.cita}»`).toContain(normalizar(f.cita));
}

describe('costos', () => {
  it('los conceptos de la spec, en orden', () => {
    expect(COSTOS.map((c) => c.id)).toEqual([
      'railway-plan',
      'api',
      'cron',
      'postgres',
      'r2',
      'vercel',
      'dominio',
      'sentry',
    ]);
  });

  it.each(COSTOS.map((c) => [c.id, c] as const))('%s: cada cita está en su documento', (_, costo) => {
    for (const f of costo.fuentes) citaPresente(f);
  });

  it.each(COSTOS.map((c) => [c.id, c] as const))('%s: la primera cita contiene la cifra', (_, costo) => {
    const cita = sinUS(costo.fuentes[0].cita);
    if (sinUS(costo.monto) === '$0') expect(cita).toMatch(/\$0|gratuit/);
    else expect(cita).toContain(sinUS(costo.monto));
  });

  it('el total: Railway cobra max(plan, uso) y el dominio va aparte', () => {
    for (const f of TOTAL.fuentes) citaPresente(f);
    expect(TOTAL.monto).toBe(`~${COSTO_MENSUAL_APROXIMADO}`);
    const cifra = (monto: string) => Number(monto.replace(/[^\d,]/g, '').replace(',', '.'));
    const plan = COSTOS.find((c) => c.id === 'railway-plan')!;
    const dominio = COSTOS.find((c) => c.id === 'dominio')!;
    // El uso proyectado sale de la cita del total (DESPLIEGUE §13.2), no de aquí.
    const uso = /~US\$(\d+)–(\d+) al mes/.exec(TOTAL.fuentes[0].cita);
    expect(uso, 'la primera cita del total trae el rango de uso «~US$9–10 al mes»').not.toBeNull();
    const [usoMin, usoMax] = [Number(uso![1]), Number(uso![2])];
    expect(USO_RAILWAY_PROYECTADO).toBe(`US$${usoMin}–${usoMax}`);
    expect(USO_INCLUIDO_EN_EL_PLAN).toBe(plan.monto);
    // El plan INCLUYE su uso: se paga max(plan, uso), no plan + uso.
    const railwayMin = Math.max(cifra(plan.monto), usoMin);
    const railwayMax = Math.max(cifra(plan.monto), usoMax);
    const [bajo, alto] = COSTO_MENSUAL_APROXIMADO.split('–').map((n) => Number(n.replace(/[^\d]/g, '')));
    expect(bajo).toBe(railwayMin + cifra(dominio.monto));
    expect(alto).toBe(railwayMax + cifra(dominio.monto));
    expect(TOTAL.fuentes.map((f) => f.cita)).toContain('el plan Hobby cuesta US$5 **e incluye US$5 de uso**');
  });

  it('el total es una proyección y lo dice', () => {
    expect(TOTAL.detalle).toMatch(/Proyección/);
    expect(TOTAL.detalle).toMatch(/primeros 2 días/);
    expect(TOTAL.detalle).toMatch(/No es una factura/);
  });

  it('las filas de uso de Railway son medidas y citan la medición fechada', () => {
    for (const id of ['api', 'cron', 'postgres'] as const) {
      const c = COSTOS.find((x) => x.id === id)!;
      expect(c.base).toBe('medido');
      expect(c.fuentes[0].archivo).toBe('docs/DESPLIEGUE.md');
    }
    const despliegue = normalizar(readFileSync(join(RAIZ, 'docs/DESPLIEGUE.md'), 'utf-8'));
    expect(despliegue).toContain('### 13.2 Costo medido (2026-10-15)');
  });

  it('las medidas de las filas suman dentro del uso proyectado', () => {
    const cifra = (monto: string) => Number(monto.replace(/[^\d,]/g, '').replace(',', '.'));
    const suma = ['api', 'cron', 'postgres']
      .map((id) => cifra(COSTOS.find((c) => c.id === id)!.monto))
      .reduce((a, b) => a + b, 0);
    const [min, max] = USO_RAILWAY_PROYECTADO.split('–').map((n) => Number(n.replace(/[^\d]/g, '')));
    expect(suma).toBeGreaterThanOrEqual(min - 0.5);
    expect(suma).toBeLessThanOrEqual(max);
  });

  it('lo estimado, el dominio, es lo único sin medición', () => {
    expect(COSTOS.filter((c) => c.base === 'estimado').map((c) => c.id)).toEqual(['dominio']);
  });

  it('los planes gratuitos se rotulan como tales', () => {
    expect(COSTOS.filter((c) => c.base === 'gratuito').map((c) => c.id)).toEqual(['vercel', 'sentry']);
    expect(ETIQUETA_BASE.gratuito).toBe('Plan gratuito');
  });

  it('no repone cifras que los documentos retiraron', () => {
    const publicado = JSON.stringify([COSTOS, TOTAL]);
    expect(publicado).not.toContain('1,7');
    expect(publicado).not.toContain('256');
  });
});

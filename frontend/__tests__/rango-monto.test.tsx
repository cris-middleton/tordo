/**
 * El monto de una Compra Ágil contra lo que suele gastar su unidad de compra
 * (`lib/rangoMonto.ts`, `components/compraAgil/RangoMonto.tsx`): la regla de la
 * frase, la geometría del gráfico chico y dónde sale.
 */
import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FilaCompraAgil } from '@/components/compraAgil/FilaCompraAgil';
import { AIRE_DERECHA, lecturaRango, rangoMonto, TEXTO_RANGO } from '@/lib/rangoMonto';
import type { CompraAgilDestacada, CompradorCompraAgil } from '@/types/compraAgil';

const COMPRADOR: CompradorCompraAgil = {
  ordenes: 120,
  publicadas: null,
  proveedores_distintos: 45,
  cuota_lider_pct: 12,
  monto_mediana: 850_000,
  monto_p25: 400_000,
  monto_p75: 1_500_000,
  percentil_ordenes: 0.84,
};

function item(cambios: Partial<CompraAgilDestacada> = {}): CompraAgilDestacada {
  return {
    codigo_externo: '1234-56-COT26',
    nombre: 'RESMAS DE PAPEL CARTA',
    nombre_organismo: 'HOSPITAL DE PRUEBA',
    region: 'Región del Biobío',
    monto_estimado: 1_000_000,
    fecha_publicacion: '2026-10-12T09:00:00-03:00',
    fecha_cierre: '2026-10-13T09:00:00-03:00',
    horas_restantes: 20.5,
    ofertas_recibidas: null,
    ofertas_al: null,
    comprador: COMPRADOR,
    puntaje: 0.6,
    factores: { competencia: 0.5, comprador: 0.84, tiempo: 0.85, monto: 0.9 },
    ...cambios,
  };
}

describe('la regla: sobre P75, más; bajo P25, menos; lo demás, dentro', () => {
  it('con los bordes dentro', () => {
    expect(lecturaRango(1_500_001, 400_000, 1_500_000)).toBe('sobre');
    expect(lecturaRango(1_500_000, 400_000, 1_500_000)).toBe('dentro');
    expect(lecturaRango(400_000, 400_000, 1_500_000)).toBe('dentro');
    expect(lecturaRango(399_999, 400_000, 1_500_000)).toBe('bajo');
  });

  it('cada lectura tiene su frase, sin signos de exclamación', () => {
    expect(rangoMonto(item({ monto_estimado: 3_000_000 }))?.texto).toBe('Más de lo que suele gastar');
    expect(rangoMonto(item())?.texto).toBe('Dentro de lo que suele gastar');
    expect(rangoMonto(item({ monto_estimado: 100_000 }))?.texto).toBe('Menos de lo que suele gastar');
    expect(Object.values(TEXTO_RANGO).join(' ')).not.toMatch(/[!¡]/);
  });
});

describe('la geometría: lineal desde cero, en % del ancho', () => {
  it('dentro: la escala llega a P75 con aire, y el punto queda en la franja', () => {
    const r = rangoMonto(item())!;
    const tope = 1_500_000 * AIRE_DERECHA;
    expect(r.desde).toBeCloseTo((400_000 / tope) * 100, 1);
    expect(r.hasta).toBeCloseTo((1_500_000 / tope) * 100, 1);
    expect(r.mediana).toBeCloseTo((850_000 / tope) * 100, 1);
    expect(r.monto).toBeGreaterThanOrEqual(r.desde);
    expect(r.monto).toBeLessThanOrEqual(r.hasta);
  });

  it('un monto diez veces lo usual se ve lejos: la escala llega hasta él y nada pasa de 100', () => {
    const r = rangoMonto(item({ monto_estimado: 15_000_000 }))!;
    expect(r.lectura).toBe('sobre');
    expect(r.monto).toBeCloseTo(100 / AIRE_DERECHA, 1);
    expect(r.hasta).toBeLessThan(10);
    for (const v of [r.desde, r.hasta, r.mediana, r.monto]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('la mediana se queda dentro de la franja aunque venga fuera', () => {
    const r = rangoMonto(item({ comprador: { ...COMPRADOR, monto_mediana: 2_000_000 } }))!;
    expect(r.mediana).toBe(r.hasta);
  });
});

describe('cuándo no hay gráfico', () => {
  it('sin monto, con un monto simbólico o con el tope de Compra Ágil', () => {
    expect(rangoMonto(item({ monto_estimado: null }))).toBeNull();
    expect(rangoMonto(item({ monto_estimado: 1 }))).toBeNull();
    expect(rangoMonto(item({ monto_estimado: 7_215_100, monto_es_tope: true }))).toBeNull();
  });

  it('sin historia de la unidad o sin una franja de verdad', () => {
    expect(rangoMonto(item({ comprador: null }))).toBeNull();
    expect(rangoMonto(item({ comprador: { ...COMPRADOR, monto_p25: null } }))).toBeNull();
    expect(rangoMonto(item({ comprador: { ...COMPRADOR, monto_p75: 400_000 } }))).toBeNull();
    expect(rangoMonto(item({ comprador: { ...COMPRADOR, monto_mediana: null } }))).toBeNull();
    expect(rangoMonto(item({ comprador: { ...COMPRADOR, monto_p25: 0 } }))).toBeNull();
  });
});

describe('en la fila', () => {
  const historia = { meses: 6, disponible: true };

  it('con historia: el dibujo es aria-hidden y la frase dice la comparación', () => {
    const { container } = render(<FilaCompraAgil item={item()} actualizadoEn={null} historia={historia} />);
    const fila = within(container);
    expect(fila.getByText('Dentro de lo que suele gastar')).toBeInTheDocument();
    const marcas = [...container.querySelectorAll('[class*="bg-dato"]')];
    expect(marcas).toHaveLength(2);
    expect(marcas.every((m) => m.closest('[aria-hidden="true"]'))).toBe(true);
    // Los valores van en texto en la misma fila.
    expect(container.textContent).toContain('La mitad de sus órdenes va de $400.000 a $1,5 millones');
    expect(container.textContent).toContain('$1 millón');
  });

  it('en la fila repetida sigue (su monto es otro), sin repetir lo que suele gastar la unidad', () => {
    const { container } = render(
      <FilaCompraAgil item={item({ monto_estimado: 3_000_000 })} actualizadoEn={null} historia={{ ...historia, repetida: true }} />,
    );
    expect(container.textContent).toContain('Más de lo que suele gastar');
    expect(container.textContent).not.toContain('La mitad de sus órdenes');
  });

  it('compacta (portada, sin historia) o sin historia disponible: nada', () => {
    const compacta = render(<FilaCompraAgil item={item()} actualizadoEn={null} />);
    expect(compacta.container.querySelector('[class*="bg-dato"]')).toBeNull();
    expect(compacta.container.textContent).not.toMatch(/suele gastar/);
    const sin = render(<FilaCompraAgil item={item()} actualizadoEn={null} historia={{ ...historia, disponible: false }} />);
    expect(sin.container.textContent).not.toMatch(/suele gastar/);
  });

  it('con el tope de Compra Ágil: el monto como tope y sin comparación', () => {
    const { container } = render(
      <FilaCompraAgil item={item({ monto_estimado: 7_215_100, monto_es_tope: true })} actualizadoEn={null} historia={historia} />,
    );
    expect(container.textContent).toContain('El máximo que permite Compra Ágil');
    expect(container.textContent).not.toMatch(/suele gastar/);
  });
});

/**
 * «Lo mejor de hoy en Compra Ágil».
 *
 * Se fija:
 *   1. que la hora de la última actualización se ve, en hora de Chile;
 *   2. que si falta una corrida del horario del cron la página avisa de que
 *      puede estar desactualizada — una
 *      corrida fallida del cron no puede dejarla mintiendo — y que antes no;
 *   3. que los tres factores se dicen en lenguaje llano, con sus casos sin dato;
 *   4. que cada ítem enlaza a su detalle y a Mercado Público.
 *
 * La respuesta del backend se simula con el contrato del plan del paso 9.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  frescura,
  mesesDeVentana,
  seSaltoUnaCorrida,
  ultimaCorridaEsperada,
  textoComprador,
  textoCompetencia,
  textoTiempo,
} from '@/lib/compraAgil';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';

let respuesta: CompraAgilDestacadasResponse;
let ahora: number | null;
const pedidas: unknown[] = [];

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useAhora', () => ({ useAhora: () => ahora }));

vi.mock('@/lib/queries', () => ({
  useCompraAgilDestacadas: (params: unknown) => {
    pedidas.push(params);
    return { data: respuesta, isPending: false, isError: false, error: null };
  },
}));

// 13:05 en Santiago (UTC-3 en octubre, horario de verano).
const ACTUALIZADO = '2026-10-12T13:05:00-03:00';
const HORA = Date.parse(ACTUALIZADO);

const BASE: CompraAgilDestacadasResponse = {
  actualizado_en: ACTUALIZADO,
  ventana_desde: '2026-04-01',
  ventana_hasta: '2026-09-30',
  items: [
    {
      codigo_externo: '1234-56-COT26',
      nombre: 'RESMAS DE PAPEL CARTA',
      nombre_organismo: 'HOSPITAL DE PRUEBA',
      region: 'Región del Biobío',
      monto_estimado: 1_500_000,
      fecha_publicacion: '2026-10-12T09:00:00-03:00',
      fecha_cierre: '2026-10-13T09:00:00-03:00',
      horas_restantes: 20.5,
      ofertas_recibidas: 1,
      comprador: {
        ordenes: 120,
        publicadas: 150,
        proveedores_distintos: 45,
        cuota_lider_pct: 12,
        monto_mediana: 850_000,
        monto_p25: 400_000,
        monto_p75: 1_500_000,
      },
      puntaje: 0.62,
      factores: { competencia: 0.5, comprador: 0.8, tiempo: 0.85 },
    },
  ],
};

async function montar() {
  const { default: Pagina } = await import('@/app/dashboard/compra-agil/page');
  return render(<Pagina />);
}

beforeEach(() => {
  respuesta = structuredClone(BASE);
  ahora = HORA + 60 * 60_000;
  pedidas.length = 0;
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('la página', () => {
  it('muestra la hora de la última actualización, en hora de Chile', async () => {
    await montar();
    expect(screen.getByText(/actualizado a las/i)).toHaveTextContent('13:05');
    expect(screen.queryByText(/puede estar\s+desactualizada/i)).not.toBeInTheDocument();
  });

  it('si falta una corrida programada, avisa de que puede estar desactualizada', async () => {
    // Lunes 13:05 → lunes 17:30: faltan las corridas de las 16 h.
    ahora = HORA + 4.5 * 3_600_000;
    await montar();
    expect(screen.getByRole('status')).toHaveTextContent(/se saltó al menos una actualización/);
  });

  it('dice los tres factores en lenguaje llano', async () => {
    await montar();
    const item = screen.getByRole('article');
    expect(within(item).getByText('1 cotización hasta ahora')).toBeInTheDocument();
    expect(within(item).getByText('Adjudica 120 de 150 en 6 meses')).toBeInTheDocument();
    expect(within(item).getByText('Cierra en 20 h')).toBeInTheDocument();
    expect(within(item).getByText(/Suele comprar entre \$400K y \$1,5M/)).toBeInTheDocument();
  });

  it('enlaza al detalle y a Mercado Público', async () => {
    await montar();
    const item = screen.getByRole('article');
    expect(within(item).getByRole('link', { name: /ver detalle/i })).toHaveAttribute(
      'href',
      '/dashboard/tenders/1234-56-COT26',
    );
    expect(within(item).getByRole('link', { name: /mercado público/i }).getAttribute('href')).toMatch(
      /^https:\/\/[a-z.]*mercadopublico\.cl\/.*1234-56-COT26/,
    );
  });

  it('sin historia del comprador ni dato de cotizaciones, lo dice', async () => {
    respuesta.items[0].comprador = null;
    respuesta.items[0].ofertas_recibidas = null;
    await montar();
    expect(screen.getByText('Sin dato de cotizaciones')).toBeInTheDocument();
    expect(screen.getByText(/Sin historial de este comprador/)).toBeInTheDocument();
  });

  it('sin ítems no rompe', async () => {
    respuesta.items = [];
    respuesta.actualizado_en = null;
    await montar();
    expect(screen.getByText(/no hay compras ágiles abiertas/i)).toBeInTheDocument();
  });
});

describe('los textos', () => {
  it('competencia', () => {
    expect(textoCompetencia(0)).toBe('Nadie ha cotizado aún');
    expect(textoCompetencia(3)).toBe('3 cotizaciones hasta ahora');
  });

  it('comprador sin publicadas cuenta órdenes', () => {
    expect(
      textoComprador(
        { ...BASE.items[0].comprador!, publicadas: null, ordenes: 1 },
        6,
      ),
    ).toBe('1 orden de Compra Ágil en 6 meses');
  });

  it('tiempo', () => {
    expect(textoTiempo(0.5)).toBe('Cierra en menos de 1 h');
    expect(textoTiempo(30)).toBe('Cierra en 1 día');
    expect(textoTiempo(80)).toBe('Cierra en 3 días');
  });

  it('meses de la ventana', () => {
    expect(mesesDeVentana('2026-04-01', '2026-09-30')).toBe(6);
    expect(mesesDeVentana(null, '2026-09-30')).toBeNull();
  });

  it('sin hora del visitante no avisa ni pone fecha', () => {
    const f = frescura(ACTUALIZADO, null)!;
    expect(f.desactualizado).toBe(false);
    expect(f.dia).toBeNull();
  });

  it('si no es de hoy, dice de qué día', () => {
    const f = frescura(ACTUALIZADO, HORA + 30 * 3_600_000)!;
    expect(f.dia).not.toBeNull();
    expect(f.desactualizado).toBe(true);
  });
});

describe('el aviso sigue el horario del cron, no un número de horas', () => {
  const t = (iso: string) => Date.parse(iso);

  it('sábado 22:00 con datos del sábado 12:05: sin aviso', () => {
    const ahora = t('2026-10-17T22:00:00-03:00');
    expect(ultimaCorridaEsperada(ahora)).toBe(t('2026-10-17T12:00:00-03:00'));
    expect(seSaltoUnaCorrida(t('2026-10-17T12:05:00-03:00'), ahora)).toBe(false);
  });

  it('lunes 09:00 con datos del domingo 12:05: sin aviso', () => {
    const ahora = t('2026-10-19T09:00:00-03:00');
    expect(ultimaCorridaEsperada(ahora)).toBe(t('2026-10-18T12:00:00-03:00'));
    expect(seSaltoUnaCorrida(t('2026-10-18T12:05:00-03:00'), ahora)).toBe(false);
  });

  it('lunes 15:00 con datos del lunes 10:05: aviso, falta la de las 13 h', () => {
    const ahora = t('2026-10-19T15:00:00-03:00');
    expect(ultimaCorridaEsperada(ahora)).toBe(t('2026-10-19T13:00:00-03:00'));
    expect(seSaltoUnaCorrida(t('2026-10-19T10:05:00-03:00'), ahora)).toBe(true);
  });

  it('la corrida no se exige hasta una hora después de su hora', () => {
    // Lunes 13:30: la de las 13 h puede estar corriendo todavía.
    const ahora = t('2026-10-19T13:30:00-03:00');
    expect(ultimaCorridaEsperada(ahora)).toBe(t('2026-10-19T10:00:00-03:00'));
    expect(seSaltoUnaCorrida(t('2026-10-19T10:05:00-03:00'), ahora)).toBe(false);
  });

  it('el día del cambio de hora (domingo 6 de septiembre de 2026, UTC-4 → UTC-3)', () => {
    const ahora = t('2026-09-06T14:00:00-03:00');
    // Las 12 h de Chile ese domingo son las 15:00 UTC, ya en horario de verano.
    expect(ultimaCorridaEsperada(ahora)).toBe(t('2026-09-06T15:00:00Z'));
    expect(seSaltoUnaCorrida(t('2026-09-06T12:05:00-03:00'), ahora)).toBe(false);
    // Los datos del sábado (aún UTC-4) ya no bastan.
    expect(seSaltoUnaCorrida(t('2026-09-05T12:05:00-04:00'), ahora)).toBe(true);
  });

  it('el día del cambio de vuelta (domingo 5 de abril de 2026, UTC-3 → UTC-4)', () => {
    const ahora = t('2026-04-05T13:30:00-04:00');
    expect(ultimaCorridaEsperada(ahora)).toBe(t('2026-04-05T16:00:00Z'));
  });
});

/**
 * «Lo mejor de hoy en Compra Ágil».
 *
 * Se fija:
 *   1. que la hora de la última actualización se ve, en hora de Chile;
 *   2. que si falta una corrida del horario del cron la página avisa de que
 *      puede estar desactualizada — una
 *      corrida fallida del cron no puede dejarla mintiendo — y que antes no;
 *   3. que cada factor se dice con su dato, sin puntaje ni cocientes, y que el
 *      conteo de cotizaciones no se muestra (`MOSTRAR_COTIZACIONES`);
 *   4. que cada ítem enlaza a su detalle y a Mercado Público.
 *
 * La respuesta del backend se simula con el contrato del plan del paso 9.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DESCRIPCION_DESTACADAS,
  MOSTRAR_COTIZACIONES,
  TITULO_DESTACADAS,
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
  historia_disponible: true,
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
      ofertas_al: '2026-10-12T13:00:00-03:00',
      comprador: {
        ordenes: 120,
        publicadas: null,
        proveedores_distintos: 45,
        cuota_lider_pct: 12,
        monto_mediana: 850_000,
        monto_p25: 400_000,
        monto_p75: 1_500_000,
        percentil_ordenes: 0.84,
      },
      puntaje: 0.62,
      factores: { competencia: 0.5, comprador: 0.84, tiempo: 0.85, monto: 0.9 },
    },
  ],
};

async function montar() {
  const { default: Pagina } = await import('@/app/(panel)/compra-agil/page');
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

  it('dice cada factor con su dato, sin puntaje ni cocientes', async () => {
    await montar();
    const item = screen.getByRole('article');
    // El conteo de cotizaciones está apagado (G1 sin resolver): no se dice.
    expect(within(item).queryByText('1 cotización hasta ahora')).not.toBeInTheDocument();
    expect(within(item).getByText('Esta unidad: 120 órdenes de Compra Ágil en 6 meses')).toBeInTheDocument();
    expect(within(item).getByText('Cierra en 20 h')).toBeInTheDocument();
    expect(within(item).getByText(/Suele comprar entre \$400K y \$1,5M/)).toBeInTheDocument();
    // Rediseño §6.7: ni «puntaje N/100» ni «X de Y».
    expect(item.textContent).not.toMatch(/puntaje|\/100/i);
    expect(item.textContent).not.toMatch(/\d de \d/);
  });

  it('el título y la descripción salen de un solo sitio', async () => {
    await montar();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(TITULO_DESTACADAS);
    expect(screen.getByText(DESCRIPCION_DESTACADAS)).toBeInTheDocument();
  });

  it('sin conteo de cotizaciones mantenido, no se dice nada de cotizaciones', async () => {
    await montar();
    expect(MOSTRAR_COTIZACIONES).toBe(false);
    // La tarjeta (con y sin lectura vieja o dato) ...
    expect(screen.getByRole('article').textContent).not.toMatch(/cotiz/i);
    // ... y toda la página: cabecera, descripción y lista.
    expect(document.body.textContent).not.toMatch(/cotiz/i);
  });

  it('la descripción no promete «pocas cotizaciones» ni «adjudica lo que publica»', () => {
    expect(DESCRIPCION_DESTACADAS).not.toMatch(/cotiz|adjudica|publica/i);
    expect(DESCRIPCION_DESTACADAS).toMatch(/heurística, no una predicción/);
    // «Buen monto» juzga; «de monto mayor» sólo dice lo que el orden hace.
    expect(DESCRIPCION_DESTACADAS).toMatch(/de monto mayor/);
    expect(DESCRIPCION_DESTACADAS).not.toMatch(/buen monto/);
  });

  it('los metadatos (título y descripción) salen de las mismas constantes y no hablan de cotizaciones', async () => {
    const { metadata } = await import('@/app/(panel)/compra-agil/layout');
    expect(metadata.title).toBe(TITULO_DESTACADAS);
    expect(String(metadata.description)).toContain(DESCRIPCION_DESTACADAS);
    expect(String(metadata.description)).not.toMatch(/cotiz/i);
    expect(String(metadata.description).length).toBeLessThanOrEqual(300);
  });

  it('el aviso de lista vieja no habla de cotizaciones', async () => {
    ahora = HORA + 4.5 * 3_600_000;
    await montar();
    expect(screen.getByRole('status').textContent).not.toMatch(/cotizaciones/i);
  });

  it('enlaza al detalle y a Mercado Público', async () => {
    await montar();
    const item = screen.getByRole('article');
    expect(within(item).getByRole('link', { name: /ver detalle/i })).toHaveAttribute(
      'href',
      '/licitaciones/1234-56-COT26',
    );
    expect(within(item).getByRole('link', { name: /mercado público/i }).getAttribute('href')).toMatch(
      /^https:\/\/[a-z.]*mercadopublico\.cl\/.*1234-56-COT26/,
    );
  });

  it('con historia disponible y la unidad ausente, dice que no tuvo órdenes; sin dato de cotizaciones no dice nada de ellas', async () => {
    respuesta.items[0].comprador = null;
    respuesta.items[0].ofertas_recibidas = null;
    await montar();
    expect(screen.queryByText('Sin dato de cotizaciones')).not.toBeInTheDocument();
    expect(screen.getByText('Esta unidad: sin órdenes de Compra Ágil en 6 meses')).toBeInTheDocument();
  });

  it('con la historia aún no disponible, la tarjeta no dice NADA del comprador', async () => {
    // Entre el despliegue y la primera corrida semanal: la tabla no existe. «Sin
    // historial» sería afirmar algo falso de compradores que sí lo tienen.
    respuesta.historia_disponible = false;
    respuesta.items[0].comprador = null;
    await montar();
    const item = screen.getByRole('article');
    expect(item.textContent).not.toMatch(/historial|esta unidad|órdenes|suele comprar|su orden típica/i);
    // Lo demás sigue en pie: el tiempo y los enlaces.
    expect(within(item).getByText('Cierra en 20 h')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: /ver detalle/i })).toBeInTheDocument();
  });

  it('las columnas de la tarjeta son las cosas que dice, sin hueco', async () => {
    const { unmount } = await montar();
    // Comprador y tiempo (las cotizaciones están apagadas): dos columnas, no tres.
    expect(screen.getByRole('article').querySelector('ul')!.className).toMatch(/sm:grid-cols-2/);
    expect(screen.getByRole('article').querySelector('ul')!.className).not.toMatch(/sm:grid-cols-3/);
    unmount();
    respuesta.historia_disponible = false;
    await montar();
    expect(screen.getByRole('article').querySelector('ul')!.className).toMatch(/sm:grid-cols-1/);
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

  it('comprador: conteos de la UNIDAD, nunca un cociente', () => {
    const c = BASE.items[0].comprador!;
    expect(textoComprador({ ...c, ordenes: 1 }, 6, true)).toBe(
      'Esta unidad: 1 orden de Compra Ágil en 6 meses',
    );
    expect(textoComprador({ ...c, ordenes: 0 }, 6, true)).toBe(
      'Esta unidad: sin órdenes de Compra Ágil en 6 meses',
    );
    expect(textoComprador({ ...c, ordenes: 2953, publicadas: 11 }, 6, true)).toBe(
      'Esta unidad: 2.953 órdenes de Compra Ágil en 6 meses',
    );
    // Con historia disponible, una unidad ausente no tuvo órdenes.
    expect(textoComprador(null, 6, true)).toBe('Esta unidad: sin órdenes de Compra Ágil en 6 meses');
  });

  it('comprador: sin historia disponible no se dice nada, haya o no unidad', () => {
    const c = BASE.items[0].comprador!;
    expect(textoComprador(null, 6, false)).toBeNull();
    expect(textoComprador(c, 6, false)).toBeNull();
  });

  it('competencia: un conteo viejo no se dice «hasta ahora»', () => {
    const lista = '2026-10-12T13:05:00-03:00';
    expect(textoCompetencia(0, '2026-10-12T12:30:00-03:00', lista)).toBe('Nadie ha cotizado aún');
    expect(textoCompetencia(0, '2026-10-12T08:05:00-03:00', lista)).toMatch(/^Sin cotizaciones al .*12.*08:05$/);
    expect(textoCompetencia(2, '2026-10-10T09:00:00-03:00', lista)).toMatch(/^2 cotizaciones al .*10.*09:00$/);
    expect(textoCompetencia(1, null, lista)).toBe('1 cotización hasta ahora');
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

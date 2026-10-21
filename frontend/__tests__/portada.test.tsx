/**
 * La portada: a la izquierda el titular, el buscador, las abiertas de ahora y la
 * ficha; a la derecha, el gráfico grande (cuánto compra el Estado mes a mes, por
 * sector). Debajo, a lo ancho, «Para empezar» con tres lecturas en fila (precio,
 * concentración y cierres), la franja de hoy, «Lo mejor de hoy» y las notas.
 *
 * Se fija:
 *   1. las cinco piezas —la frase de abiertas y la franja, «Lo mejor de hoy», los
 *      sectores (la «Base» de la ficha), el mercado (el gráfico grande y la lectura
 *      de concentración) y el producto (la lectura de precio)— se piden como
 *      RENDERIZADO DEL SERVIDOR (lo vivo media hora con `compra-agil`, analytics
 *      una semana con `analytics`), y **si una falla se oculta SU bloque**: la
 *      portada no lanza, ni con un 500, ni sin red, ni con una respuesta rara, ni
 *      con una hora que no se puede leer;
 *   2. el buscador no depende de nada: con el backend caído, la portada sirve
 *      para buscar, y la lectura de la nota sigue (es contenido del repo);
 *   3. «Código» y «Lo hace» sólo con su variable: nunca un enlace roto ni el
 *      hueco `[[…]]` de los documentos legales;
 *   4. nada de lo que se fue: ni el panel navy, ni la lectura de sectores, ni
 *      «Úsalo como quieras», ni el cierre, ni preguntas (están en /acerca);
 *   5. sigue siendo un componente de servidor con `metadata`, sin «Inteligencia» (R10).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home, { metadata, revalidate } from '@/app/page';
import { descripcionDestacadas, TITULO_DESTACADAS } from '@/lib/compraAgil';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { EJEMPLOS_BUSQUEDA } from '@/lib/buscar';
import { notaDeLaPortada, PRODUCTO_PORTADA } from '@/lib/lecturasPortada';
import { pedirMercadoPortada } from '@/lib/publicoServidor';
import { leerNotas, rutaNota } from '@/lib/notas';
import * as portada from '@/lib/portada';
import { rutaProducto } from '@/lib/publico';
import { pedirDestacadas } from '@/lib/publicoServidor';
import { TITULO_LECTURAS } from '@/components/portada/LecturasPortada';
import type { SectoresBI } from '@/types/bi';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { BandaUnidad, GastoMensual, MercadoPortada, ProductoPublico, ResumenPortada } from '@/types/publico';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';
const TITULO = portada.TITULO_PORTADA;
const CAMPO = portada.ETIQUETA_BUSCADOR;

function item(n: number): CompraAgilDestacada {
  return {
    codigo_externo: `1234-${n}-COT26`,
    nombre: `Compra de prueba ${n}`,
    nombre_organismo: 'Hospital de Prueba',
    region: 'Región Metropolitana de Santiago',
    monto_estimado: 500000,
    fecha_publicacion: '2026-10-12T10:00:00Z',
    fecha_cierre: '2026-10-14T10:00:00Z',
    horas_restantes: 30,
    ofertas_recibidas: 1,
    ofertas_al: null,
    comprador: null,
    puntaje: 0.8,
    factores: { competencia: 1, comprador: 0.8, tiempo: 1, monto: 1 },
  };
}

const DESTACADAS: CompraAgilDestacadasResponse = {
  actualizado_en: '2026-10-12T16:05:00Z',
  historia_disponible: true,
  ventana_desde: '2026-04-12',
  ventana_hasta: '2026-10-12',
  items: [1, 2, 3, 4, 5].map(item),
};

const RESUMEN: ResumenPortada = {
  licitaciones_abiertas: 4232,
  compra_agil_abiertas: 2714,
  actualizado_en: '2026-10-14T11:00:00-03:00',
  compra_agil_por_cierre: { hoy: 312, manana: 740, dos_tres_dias: 1105, despues: 557 },
  publicadas_hoy: 612,
  mas_publica_hoy: 'SERVICIO DE SALUD METROPOLITANO SUR',
};

const VENTANA = { ventana_desde: '2023-11-01', ventana_hasta: '2026-10-11' };
const SECTORES: SectoresBI = {
  disponible: true,
  total: 3,
  sectores: [
    { sector: 'Salud', monto_total: 2.9816e12, n_oc: 2_000_000, ...VENTANA },
    { sector: 'Municipalidades', monto_total: 2.9484e12, n_oc: 2_480_000, ...VENTANA },
    { sector: 'Gob. Central, Universidades', monto_total: 1.9975e12, n_oc: 1_000_000, ...VENTANA },
  ],
};
const BASE = '5,48 millones de órdenes de compra, nov 2023 a oct 2026';

const BANDA: BandaUnidad = {
  unidad: 'unidad',
  n: 46,
  p10: 129_990,
  p25: 150_921,
  p50: 190_762,
  p75: 240_000,
  p90: 369_990,
  predictibilidad: 'alta',
  confianza: 0.79,
  compradores: 40,
  cuota_mayor: 0.04,
  de_mercado: true,
};
const PRODUCTO: ProductoPublico = {
  slug: PRODUCTO_PORTADA.slug,
  firma: 'impresora multifuncional',
  nombre_generico: null,
  codigo_onu: null,
  descripcion: null,
  indexable: true,
  unidades: [BANDA],
  compradores: [120_000, 160_000, 190_000, 230_000, 300_000].map((p50, i) => ({
    codigo: `c${i}`,
    nombre: `Municipalidad ${i}`,
    unidad: 'unidad',
    n: 3,
    p50,
  })),
  periodo: { ventana_desde: '2025-11-01', ventana_hasta: '2026-10-31' },
};

/**
 * Doce meses, nov 2025 a oct 2026: Salud $1 billón y Municipalidades $0,5 al mes,
 * salvo diciembre, en que Salud compra $2 billones. Total $19 billones; el mes
 * típico (la mediana) es $1,5 billones y diciembre, $2,5: 1,7 veces.
 */
const GASTO: GastoMensual[] = Array.from({ length: 12 }, (_, i) => {
  const anio = i < 2 ? 2025 : 2026;
  const mes = ((10 + i) % 12) + 1;
  return [
    { anio, mes, sector: 'Salud', monto: mes === 12 ? 2e12 : 1e12, n_oc: 1000 },
    { anio, mes, sector: 'Municipalidades', monto: 0.5e12, n_oc: 500 },
  ];
}).flat();
/** Diez tramos; de la mitad para arriba, $1,5 billones cada uno: 7,5 de 12,5 = 6 de cada 10 pesos. */
const MERCADO: MercadoPortada = {
  gasto_mensual: GASTO,
  concentracion: {
    mercados: 1000,
    sobre_la_mitad: 500,
    un_proveedor: 80,
    monto_total: 12.5e12,
    monto_sobre_la_mitad: 7.5e12,
    tramos: Array.from({ length: 10 }, (_, i) => ({
      desde: i * 10,
      hasta: i * 10 + 10,
      mercados: 100,
      monto: i >= 5 ? 1.5e12 : 1e12,
    })),
  },
};

const NOTAS = leerNotas();
const CONCLUSION_GASTO = 'El Estado compró $19 billones en 12 meses. Diciembre de 2025 fue el mes más alto: 1,7 veces un mes típico.';
const CONCLUSION_PRECIO = `${PRODUCTO_PORTADA.nombre}: la mitad de las compras se pagó entre $150.921 y $240.000`;
const CONCLUSION_CONCENTRACION = '6 de cada 10 pesos se compran en mercados donde un solo proveedor se lleva la mitad o más';
const CONCLUSION_CIERRES = '4 de cada 10 Compras Ágiles abiertas cierran hoy o mañana';
// La lectura de la nota es la más reciente CON `antes_despues`, no la primera de la lista.
const NOTA_PORTADA = notaDeLaPortada(NOTAS)!;
const TITULO_NOTA = NOTA_PORTADA.titulo;
const LECTURAS = TITULO_LECTURAS;

/** Las conclusiones de las lecturas de «Para empezar» (sus `h3`), en orden. */
const conclusiones = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

/** La frase «Ahora puedes postular a…», o null. */
const abiertas = () =>
  screen.queryAllByText((_, el) => el?.tagName === 'P' && /^Ahora puedes postular a /.test(el.textContent ?? ''))[0] ?? null;

/** El gráfico grande, o null. */
const gasto = (container: HTMLElement) => container.querySelector<HTMLElement>('section[aria-labelledby="gasto-titulo"]');

type Respuesta = () => Promise<Response>;
const ok =
  (cuerpo: unknown): Respuesta =>
  async () =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
const caido: Respuesta = async () => new Response('{}', { status: 502 });
const sinRed: Respuesta = async () => Promise.reject(new TypeError('fetch failed'));

let pedidas: { url: string; init: RequestInit }[] = [];

type Piezas = { destacadas?: Respuesta; resumen?: Respuesta; sectores?: Respuesta; mercado?: Respuesta; producto?: Respuesta };

/** Cada pieza con su respuesta; lo que no se diga, caído. */
function simularBackend({ destacadas = caido, resumen = caido, sectores = caido, mercado = caido, producto = caido }: Piezas) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      if (url.endsWith('/publico/portada')) return resumen();
      if (url.includes('/compra-agil/destacadas')) return destacadas();
      if (url.endsWith('/bi/sector')) return sectores();
      if (url.endsWith('/publico/mercado')) return mercado();
      if (url.includes('/publico/productos/')) return producto();
      return new Response('{}', { status: 404 });
    }),
  );
}

const TODO: Piezas = {
  destacadas: ok(DESTACADAS),
  resumen: ok(RESUMEN),
  sectores: ok(SECTORES),
  mercado: ok(MERCADO),
  producto: ok(PRODUCTO),
};
const todo = () => simularBackend(TODO);

beforeEach(() => {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.REPOSITORIO_URL;
  delete process.env.RESPONSABLE_LEGAL;
  delete process.env.AUTOR_NOMBRE;
  delete process.env.AUTOR_ROL;
  delete process.env.AUTOR_URL;
});

describe('lo que la portada pide al backend', () => {
  it('las cinco piezas, como renderizado del servidor: lo vivo media hora, analytics una semana', async () => {
    todo();
    render(await Home());
    const cache = Object.fromEntries(pedidas.map((p) => [p.url.replace(BACKEND, ''), p.init.next]));
    expect(cache).toEqual({
      '/api/v1/compra-agil/destacadas?limite=5': { revalidate: 1800, tags: ['compra-agil'] },
      '/api/v1/publico/portada': { revalidate: 1800, tags: ['compra-agil'] },
      '/api/v1/bi/sector': { revalidate: 604800, tags: ['analytics'] },
      '/api/v1/publico/mercado': { revalidate: 604800, tags: ['analytics'] },
      [`/api/v1/publico/productos/${encodeURIComponent(PRODUCTO_PORTADA.slug)}`]: { revalidate: 604800, tags: ['analytics'] },
    });
    for (const { init } of pedidas) {
      const cabeceras = new Headers(init.headers);
      expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
      expect(cabeceras.has('X-Tordo-Visitante')).toBe(false);
    }
    expect(revalidate).toBe(1800);
  });

  it.each([
    ['un 500', async () => new Response('{}', { status: 500 })],
    ['sin red', sinRed],
    ['una respuesta sin items', ok({ detail: 'raro' })],
    ['un item nulo', ok({ ...DESTACADAS, items: [item(1), null] })],
    ['un item que no es un objeto', ok({ ...DESTACADAS, items: [item(1), 'raro'] })],
    ['un item sin codigo_externo', ok({ ...DESTACADAS, items: [item(1), { ...item(2), codigo_externo: undefined }] })],
    ['un item con horas_restantes de texto', ok({ ...DESTACADAS, items: [{ ...item(1), horas_restantes: '30' }] })],
    ['un item con nombre nulo', ok({ ...DESTACADAS, items: [{ ...item(1), nombre: null }] })],
    ['un item con monto_es_tope de texto', ok({ ...DESTACADAS, items: [{ ...item(1), monto_es_tope: 'sí' }] })],
    ['una actualizado_en que no es texto', ok({ ...DESTACADAS, actualizado_en: 5 })],
  ])('«Lo mejor de hoy» con %s devuelve null y no lanza', async (_, respuesta) => {
    simularBackend({ destacadas: respuesta });
    await expect(pedirDestacadas(5)).resolves.toBeNull();
  });

  it.each([
    ['un 503 (FEATURE_ANALYTICS apagada)', async () => new Response('{}', { status: 503 })],
    ['sin red', sinRed],
    ['una respuesta que no es un objeto', ok(['raro'])],
    ['gasto_mensual que no es una lista', ok({ ...MERCADO, gasto_mensual: 'raro' })],
    ['una fila de gasto sin monto', ok({ ...MERCADO, gasto_mensual: [{ ...GASTO[0], monto: undefined }] })],
    ['un tramo sin monto', ok({ ...MERCADO, concentracion: { ...MERCADO.concentracion!, tramos: [{ desde: 0, hasta: 10, mercados: 1 }] } })],
  ])('el mercado con %s devuelve null y no lanza', async (_, respuesta) => {
    simularBackend({ mercado: respuesta });
    await expect(pedirMercadoPortada()).resolves.toBeNull();
  });

  it('el mercado con un bloque nulo (sin su tabla) sigue valiendo', async () => {
    simularBackend({ mercado: ok({ gasto_mensual: null, concentracion: MERCADO.concentracion }) });
    await expect(pedirMercadoPortada()).resolves.toMatchObject({ gasto_mensual: null });
  });

  it('un item nulo en la respuesta oculta el bloque y la portada no se cae', async () => {
    simularBackend({
      destacadas: ok({ ...DESTACADAS, items: [item(1), null] }),
      resumen: ok(RESUMEN),
    });
    const { container } = render(await Home());
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(TITULO);
    expect(abiertas()).not.toBeNull();
  });

  it('una respuesta bien formada, con campos nulos donde el tipo lo admite, sigue valiendo', async () => {
    const nulos = {
      ...item(1),
      nombre_organismo: null,
      monto_estimado: null,
      ofertas_recibidas: null,
      ofertas_al: null,
    };
    simularBackend({ destacadas: ok({ ...DESTACADAS, items: [nulos] }) });
    await expect(pedirDestacadas(5)).resolves.toMatchObject({ items: [{ codigo_externo: '1234-1-COT26' }] });
  });

  it('la hora de actualización va con el día, en hora de Chile', () => {
    expect(portada.actualizadoEnPalabras('2026-10-12T16:05:00Z')).toMatch(/12.*oct.*13:05/);
    expect(portada.actualizadoEnPalabras(null)).toBeNull();
    expect(portada.actualizadoEnPalabras('no es fecha')).toBeNull();
  });
});

describe('lo primero: el buscador', () => {
  it('un solo h1, el titular, y el formulario a /buscar con el campo nombrado', async () => {
    todo();
    render(await Home());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(TITULO);
    expect(screen.getByRole('searchbox', { name: CAMPO })).toHaveAttribute('name', 'q');
    expect(screen.getByRole('search')).toHaveAttribute('action', '/buscar');
    expect(within(screen.getByRole('list', { name: 'Ejemplos de búsqueda' })).getAllByRole('link')).toHaveLength(
      EJEMPLOS_BUSQUEDA.length,
    );
  });

  it.each([
    ['caído', caido],
    ['sin red', sinRed],
  ])('el buscador está aunque el backend no responda nada (%s)', async (_, respuesta) => {
    simularBackend({ destacadas: respuesta, resumen: respuesta, sectores: respuesta, mercado: respuesta, producto: respuesta });
    const { container } = render(await Home());
    expect(screen.getByRole('searchbox', { name: CAMPO })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ejemplos de búsqueda' })).toBeInTheDocument();
    expect(abiertas()).toBeNull();
    expect(gasto(container)).toBeNull();
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.queryByText('Actualizado el')).toBeNull();
    // La nota es contenido del repo: la banda sigue, con una sola lectura.
    expect(conclusiones()).toEqual([TITULO_NOTA]);
    expect(screen.getByRole('region', { name: 'Notas de datos' })).toBeInTheDocument();
  });
});

describe('las abiertas de ahora', () => {
  it('una frase, con cada cifra al catálogo con el filtro que la cuenta', async () => {
    todo();
    render(await Home());
    const frase = abiertas() as HTMLElement;
    expect(frase).toHaveTextContent('Ahora puedes postular a 4.232 licitaciones y 2.714 Compras Ágiles.');
    expect(within(frase).getByRole('link', { name: '4.232 licitaciones' })).toHaveAttribute('href', urlCatalogoAbiertas('licitaciones'));
    expect(within(frase).getByRole('link', { name: '2.714 Compras Ágiles' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('compra_agil'),
    );
  });

  it.each([
    ['un 502', caido],
    ['sin hora', ok({ ...RESUMEN, actualizado_en: null })],
    ['una hora que no se puede leer', ok({ ...RESUMEN, actualizado_en: 'ayer a las once' })],
    ['un conteo negativo', ok({ ...RESUMEN, licitaciones_abiertas: -1 })],
  ])('con %s la frase se oculta y lo demás sigue', async (nombre, resumen) => {
    simularBackend({ destacadas: ok(DESTACADAS), resumen });
    const { container } = render(await Home());
    expect(abiertas()).toBeNull();
    expect(container.textContent).not.toMatch(/invalid date|NaN/i);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(TITULO);
    expect(container.querySelector('#hoy')).not.toBeNull();
    // Sin hora legible tampoco hay de cuándo son los tramos de cierre (principio 4).
    if (/hora/.test(nombre)) expect(screen.queryByText(CONCLUSION_CIERRES)).toBeNull();
  });
});

describe('«Lo mejor de hoy»', () => {
  it('compacto: cinco filas, el título de un solo sitio y «Ver todas»', async () => {
    todo();
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(within(bloque).getByRole('heading', { level: 2 })).toHaveTextContent(TITULO_DESTACADAS);
    expect(within(bloque).getAllByRole('article')).toHaveLength(5);
    expect(within(bloque).getByRole('link', { name: /^ver todas/i })).toHaveAttribute('href', '/compra-agil');
    // Las cotizaciones las decide MOSTRAR_COTIZACIONES (portada-hoy.test.tsx); aquí, lo que nunca sale.
    expect(bloque.textContent).not.toMatch(/puntaje|\/100|esta unidad/i);
    expect(bloque).toHaveTextContent(descripcionDestacadas(true));
    expect(bloque).toHaveTextContent(/compran seguido/);
  });

  it('sin historia aún, la portada no afirma un criterio que no ordena', async () => {
    simularBackend({
      destacadas: ok({ ...DESTACADAS, historia_disponible: false }),
      resumen: ok(RESUMEN),
    });
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(bloque).toHaveTextContent(descripcionDestacadas(false));
    expect(bloque.textContent).not.toMatch(/compran seguido/);
  });

  it('si la respuesta no trae `historia_disponible`, tampoco lo promete', async () => {
    const { historia_disponible: _omitida, ...sinCampo } = DESTACADAS;
    simularBackend({ destacadas: ok(sinCampo), resumen: ok(RESUMEN) });
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(bloque.textContent).not.toMatch(/compran seguido/);
  });

  it.each([
    ['sin hora', null],
    ['una hora que no se puede leer', 'ayer a las once'],
  ])('con %s el bloque entero se oculta, no sólo su hora', async (_, hora) => {
    simularBackend({
      destacadas: ok({ ...DESTACADAS, actualizado_en: hora }),
      resumen: ok(RESUMEN),
    });
    const { container } = render(await Home());
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.queryByText(TITULO_DESTACADAS)).toBeNull();
    expect(container.textContent).not.toMatch(/invalid date|NaN/i);
    expect(abiertas()).not.toBeNull();
  });

  it('con la franja, no repite «Actualizado el»: la hora se dice una vez', async () => {
    todo();
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(bloque.textContent).not.toMatch(/actualizado/i);
    expect(screen.getAllByText(/^Actualizado el/)).toHaveLength(1);
  });

  it('sin la franja (resumen caído), el bloque dice su propia hora', async () => {
    simularBackend({ destacadas: ok(DESTACADAS) });
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(within(bloque).getByText(/Actualizado el/)).toHaveTextContent(/12.*oct.*13:05/);
  });

  it('si el backend falla, el bloque se oculta y la frase de abiertas sigue', async () => {
    simularBackend({ resumen: ok(RESUMEN) });
    const { container } = render(await Home());
    expect(container.querySelector('#hoy')).toBeNull();
    expect(abiertas()).not.toBeNull();
  });

  it('sin Compras Ágiles abiertas, lo dice en vez de dejar un hueco', async () => {
    simularBackend({ destacadas: ok({ ...DESTACADAS, items: [] }), resumen: ok(RESUMEN) });
    render(await Home());
    expect(screen.getByText(/no hay compras ágiles abiertas/i)).toBeInTheDocument();
  });
});

describe('quién lo hace y de dónde sale (spec PORTADA_V7 §3.5, §3.6)', () => {
  it('sin REPOSITORIO_URL: ningún «Código» ni «El script»', async () => {
    todo();
    const { container } = render(await Home());
    expect(screen.queryByRole('link', { name: 'Código' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'El script' })).toBeNull();
    expect(container.textContent).not.toMatch(/código abierto/i);
  });

  it('con REPOSITORIO_URL: «Código» en el pie de cada gráfico calculado, al fichero que lo calcula', async () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    todo();
    render(await Home());
    expect(screen.getAllByRole('link', { name: 'Código' }).map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/x/tordo/blob/main/etl/analytics/trend_analysis.py',
      'https://github.com/x/tordo/blob/main/etl/analytics/product_price_bands.py',
      'https://github.com/x/tordo/blob/main/etl/analytics/competitor_analysis.py',
      'https://github.com/x/tordo/blob/main/backend/app/repositories/licitaciones.py',
    ]);
  });

  it('la ficha: Base calculada de /bi/sector, Fuente y Se actualiza', async () => {
    todo();
    render(await Home());
    expect(screen.getByText('Base').nextElementSibling).toHaveTextContent(BASE);
    expect(screen.getByText('Fuente').nextElementSibling).toHaveTextContent('Datos abiertos de ChileCompra');
    expect(screen.getByText('Se actualiza').nextElementSibling).toHaveTextContent(portada.SE_ACTUALIZA);
  });

  it.each([
    ['503 (FEATURE_ANALYTICS apagada)', async () => new Response('{}', { status: 503 })],
    ['sin la tabla', ok({ disponible: false, motivo: 'parquet no generado' })],
    ['sin n_oc (backend anterior)', ok({ ...SECTORES, sectores: SECTORES.sectores!.map(({ n_oc: _n, ...f }) => f) })],
    [
      'sin ventana',
      ok({ ...SECTORES, sectores: SECTORES.sectores!.map(({ sector, monto_total, n_oc }) => ({ sector, monto_total, n_oc })) }),
    ],
  ])('con /bi/sector %s, la fila «Base» no sale y lo demás sigue', async (_, sectores) => {
    simularBackend({ ...TODO, sectores });
    const { container } = render(await Home());
    expect(screen.queryByText('Base')).toBeNull();
    expect(screen.getByText('Fuente')).toBeInTheDocument();
    expect(conclusiones()).toEqual([CONCLUSION_PRECIO, CONCLUSION_CONCENTRACION, CONCLUSION_CIERRES]);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('sin AUTOR_NOMBRE no firma, ni con rol, y nunca enseña el hueco', async () => {
    process.env.AUTOR_ROL = 'ingeniero que construye productos con datos';
    todo();
    const { container } = render(await Home());
    expect(container.textContent).not.toMatch(/lo hace|data scientist|ingeniero que construye|\[\[/i);
    expect(screen.queryByRole('complementary', { name: 'Quién lo hace' })).toBeNull();
  });

  it('con AUTOR_NOMBRE, AUTOR_ROL y AUTOR_URL: «Lo hace» en la ficha y la ficha del autor junto a las notas', async () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    process.env.AUTOR_ROL = 'ingeniero que construye productos con datos';
    process.env.AUTOR_URL = 'https://github.com/prueba';
    todo();
    render(await Home());
    expect(screen.getByText('Lo hace').nextElementSibling).toHaveTextContent(
      'Nombre De Prueba, ingeniero que construye productos con datos',
    );
    const ficha = screen.getByRole('complementary', { name: 'Quién lo hace' });
    expect(ficha).toHaveTextContent(
      /Nombre De Prueba, ingeniero que construye productos con datos, hace .+ y escribe las notas\./,
    );
    expect(within(ficha).getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/prueba');
    expect(screen.getByRole('region', { name: 'Notas de datos' })).toContainElement(ficha);
  });

  it('con AUTOR_NOMBRE y sin AUTOR_ROL: el nombre solo, sin rol por defecto', async () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    todo();
    const { container } = render(await Home());
    expect(screen.getByText('Lo hace').nextElementSibling?.textContent).toBe('Nombre De Prueba');
    const ficha = screen.getByRole('complementary', { name: 'Quién lo hace' });
    expect(ficha).toHaveTextContent(/Nombre De Prueba hace .+ y escribe las notas\./);
    expect(container.textContent).not.toMatch(/data scientist/i);
  });

  it('firma la autoría, no el responsable legal (spec PORTADA_V7 V5)', async () => {
    process.env.RESPONSABLE_LEGAL = 'Otra Persona';
    todo();
    const { container } = render(await Home());
    expect(container.textContent).not.toMatch(/Otra Persona/);
  });
});

describe('las notas de datos', () => {
  it('sin el precio (como producción hasta la corrida semanal), entra la nota más reciente con gráfico', async () => {
    simularBackend({ ...TODO, producto: caido });
    const { container } = render(await Home());
    expect(conclusiones()).toEqual([CONCLUSION_CONCENTRACION, CONCLUSION_CIERRES, TITULO_NOTA]);
    const lectura = container.querySelector('article[aria-labelledby="lectura-nota"]') as HTMLElement;
    expect(NOTA_PORTADA.antes_despues).not.toBeNull();
    expect(lectura).toHaveTextContent(NOTA_PORTADA.titulo);
    expect(lectura.querySelector('figure')).not.toBeNull();
    expect(within(lectura).getByRole('link', { name: 'Leer la nota' })).toHaveAttribute('href', rutaNota(NOTA_PORTADA.slug));
    // La lista no usa la regla: las cuatro últimas, en su orden (lo fija el test de abajo).
    expect(NOTA_PORTADA).toBe(NOTAS.find((n) => n.antes_despues !== null));
  });

  it('las cuatro últimas, con fecha y título, y «Todas las notas»', async () => {
    todo();
    render(await Home());
    const seccion = screen.getByRole('region', { name: 'Notas de datos' });
    const enlaces = within(within(seccion).getByRole('list')).getAllByRole('link');
    expect(enlaces.map((a) => a.textContent)).toEqual(NOTAS.slice(0, 4).map((n) => n.titulo));
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(NOTAS.slice(0, 4).map((n) => rutaNota(n.slug)));
    expect(within(seccion).getByRole('link', { name: 'Todas las notas' })).toHaveAttribute('href', '/notas');
  });
});

describe('lo que ya no está', () => {
  it('ni panel navy, ni sectores, ni «Úsalo como quieras», ni el cierre, ni preguntas (están en /acerca)', async () => {
    todo();
    const { container } = render(await Home());
    expect(container.innerHTML).not.toMatch(/bg-band\d/);
    // V1: las lecturas van sobre blanco. Ninguna superficie oscura en la portada.
    expect(container.querySelectorAll('.bg-brand-navy, .dark')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Ver mercados' })).toBeNull();
    expect(container.textContent).not.toMatch(/compran casi lo mismo|De cada \$100/);
    expect(screen.queryByRole('heading', { name: 'Úsalo como quieras' })).toBeNull();
    expect(container.textContent).not.toMatch(/Mantenerlo, casi|Se usa/);
    expect(screen.queryByRole('heading', { name: /qué hay en el sitio|preguntas frecuentes/i })).toBeNull();
    expect(container.querySelector('details')).toBeNull();
    expect(portada).not.toHaveProperty('ACCESOS');
    expect(portada).not.toHaveProperty('PREGUNTAS');
  });

  it('no promete nada de lo que se fue con las cuentas', async () => {
    todo();
    const { container } = render(await Home());
    const texto = `${container.textContent} ${metadata.description} ${JSON.stringify(metadata.title)}`;
    expect(texto).not.toMatch(
      /alerta|aviso por correo|informe semanal|encaje|prueba gratis|trial|inicia sesión|tu posición|suscrip|plazo de pago|paga a \d/i,
    );
  });
});

describe('la estructura', () => {
  it('desde lg, dos columnas 5/7: buscador, abiertas y ficha a la izquierda; el gráfico grande a la derecha', async () => {
    todo();
    const { container } = render(await Home());
    expect(container.querySelector('.max-w-6xl')).not.toBeNull();
    const grande = gasto(container) as HTMLElement;
    const rejilla = grande.parentElement as HTMLElement;
    expect(rejilla).toHaveClass('grid', 'lg:grid-cols-[5fr_7fr]', 'lg:gap-x-12');
    expect(grande).toHaveClass('lg:col-start-2', 'lg:row-start-1', 'lg:row-span-2');
    const buscador = screen.getByRole('searchbox', { name: CAMPO }).closest('.lg\\:col-start-1') as HTMLElement;
    expect(buscador.parentElement).toBe(rejilla);
    expect(buscador).toHaveClass('lg:row-start-1');
    expect(buscador).toContainElement(abiertas());
    const ficha = screen.getByText('Fuente').closest('dl') as HTMLElement;
    expect(ficha.parentElement).toBe(rejilla);
    expect(ficha).toHaveClass('lg:col-start-1', 'lg:row-start-2');
    // «Para empezar» va debajo, a lo ancho: fuera de la rejilla de arriba.
    expect(rejilla).not.toContainElement(screen.getByRole('region', { name: LECTURAS }));
  });

  it('sin el gráfico grande, el buscador se queda solo con su ancho de lectura y la ficha baja tras «Para empezar»', async () => {
    simularBackend({ ...TODO, mercado: caido });
    const { container } = render(await Home());
    expect(gasto(container)).toBeNull();
    const buscador = screen.getByRole('searchbox', { name: CAMPO }).closest('.lg\\:col-start-1') as HTMLElement;
    expect(buscador.parentElement).toHaveClass('max-w-2xl');
    expect(buscador.parentElement).not.toHaveClass('grid');
    const ficha = screen.getByText('Fuente').closest('dl') as HTMLElement;
    expect(ficha).toHaveClass('max-w-2xl');
    // La primera conclusión cabe así en la primera pantalla del teléfono.
    const lecturas = screen.getByRole('region', { name: LECTURAS });
    expect(lecturas.compareDocumentPosition(ficha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('en el DOM (y en móvil): buscador, abiertas, gráfico grande, ficha, «Para empezar», franja, «Lo mejor de hoy» y notas', async () => {
    todo();
    const { container } = render(await Home());
    const orden = [
      screen.getByRole('searchbox', { name: CAMPO }),
      abiertas() as HTMLElement,
      gasto(container) as HTMLElement,
      screen.getByText('Fuente').closest('dl') as HTMLElement,
      screen.getByRole('region', { name: LECTURAS }),
      screen.getByText('Actualizado el').closest('dl') as HTMLElement,
      container.querySelector('#hoy') as HTMLElement,
      screen.getByRole('region', { name: 'Notas de datos' }),
    ];
    for (let i = 1; i < orden.length; i++) {
      expect(orden[i - 1].compareDocumentPosition(orden[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('sin abiertas, la ficha sigue a la izquierda, bajo el buscador', async () => {
    simularBackend({ ...TODO, resumen: caido });
    render(await Home());
    expect(abiertas()).toBeNull();
    expect(screen.getByText('Fuente').closest('dl')).toHaveClass('lg:col-start-1', 'lg:row-start-2');
  });
});

describe('el gráfico grande: cuánto compra el Estado, mes a mes', () => {
  it('el h2 es la conclusión, que sale del dato; columnas por mes, leyenda por sector y su pie de método', async () => {
    todo();
    const { container } = render(await Home());
    const grande = gasto(container) as HTMLElement;
    expect(screen.getByRole('region', { name: CONCLUSION_GASTO })).toBe(grande);
    expect(within(grande).getByRole('heading', { level: 2 })).toHaveTextContent(CONCLUSION_GASTO);
    expect(grande.querySelectorAll('[data-mes]')).toHaveLength(12);
    // La leyenda escribe cada sector con su total: los valores en texto.
    expect(grande).toHaveTextContent('Salud');
    expect(grande).toHaveTextContent('$13 billones, 68 %');
    expect(grande).toHaveTextContent('Municipalidades');
    expect(grande).toHaveTextContent('$6 billones, 32 %');
    // Y la tabla de los meses, fuera de la vista.
    expect(within(grande).getAllByRole('row')).toHaveLength(12);
    expect(within(grande).getByRole('link', { name: 'Ver en la API' })).toHaveAttribute(
      'href',
      'https://api.tordo.cl/api/v1/publico/mercado',
    );
    expect(grande).toHaveTextContent('Órdenes de compra de nov 2025 a oct 2026');
    // Sin el conteo de órdenes: `time_series` lo cuenta por rubro y al sumar se repetía.
    expect(grande).not.toHaveTextContent(/[0-9.]+ órdenes de compra/);
    expect(grande).toHaveTextContent(/obras del MOP/);
  });

  it('el dibujo, fuera del árbol accesible', async () => {
    todo();
    const { container } = render(await Home());
    const grande = gasto(container) as HTMLElement;
    for (const mes of grande.querySelectorAll('[data-mes]')) expect(mes.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it.each([
    ['menos de seis meses', ok({ ...MERCADO, gasto_mensual: GASTO.slice(0, 10) })],
    ['sin la tabla (gasto_mensual nulo)', ok({ ...MERCADO, gasto_mensual: null })],
    ['todo en cero', ok({ ...MERCADO, gasto_mensual: GASTO.map((f) => ({ ...f, monto: 0 })) })],
  ])('con %s el gráfico grande no sale y lo demás sigue', async (_, mercado) => {
    simularBackend({ ...TODO, mercado });
    const { container } = render(await Home());
    expect(gasto(container)).toBeNull();
    expect(screen.getByRole('searchbox', { name: CAMPO })).toBeInTheDocument();
    expect(conclusiones()).toContain(CONCLUSION_PRECIO);
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('«Para empezar»', () => {
  it('con todo, tres lecturas en fila —precio, concentración y cierres—, cada una con su pie de método', async () => {
    todo();
    const { container } = render(await Home());
    const banda = screen.getByRole('region', { name: LECTURAS });
    expect(LECTURAS).toBe('Para empezar');
    expect(within(banda).getByRole('heading', { level: 2 })).toHaveTextContent(LECTURAS);
    expect(conclusiones()).toEqual([CONCLUSION_PRECIO, CONCLUSION_CONCENTRACION, CONCLUSION_CIERRES]);
    expect(within(banda).getAllByRole('article')).toHaveLength(3);
    expect(within(banda).getAllByRole('list', { name: 'Método y datos' })).toHaveLength(3);
    // En fila desde lg, alineadas por subrejilla.
    expect(banda.innerHTML).toMatch(/lg:grid-cols-3/);
    expect(banda.innerHTML).toMatch(/lg:grid-rows-subgrid/);
    // La nota no entra: se queda en «Notas de datos», más abajo.
    expect(container.querySelector('article[aria-labelledby="lectura-nota"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Leer la nota' })).toBeNull();
    // «Ver el producto» es la conclusión misma (spec §3.2).
    expect(screen.getByRole('link', { name: CONCLUSION_PRECIO })).toHaveAttribute('href', rutaProducto(PRODUCTO_PORTADA.slug));
    expect(screen.getByRole('link', { name: 'Las que cierran primero' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('compra_agil', [], { sort_by: 'fecha_cierre', sort_order: 'asc' }),
    );
    expect(within(banda).getAllByRole('link', { name: 'Ver en la API' }).map((a) => a.getAttribute('href'))).toEqual([
      `https://api.tordo.cl/api/v1/publico/productos/${PRODUCTO_PORTADA.slug}`,
      'https://api.tordo.cl/api/v1/publico/mercado',
      'https://api.tordo.cl/api/v1/publico/portada',
    ]);
  });

  it('la concentración: diez tramos, los de la mitad para arriba en el color del dato, y los valores en texto', async () => {
    todo();
    const { container } = render(await Home());
    const lectura = container.querySelector('article[aria-labelledby="lectura-concentracion"]') as HTMLElement;
    const columnas = [...lectura.querySelectorAll('.bg-dato, .bg-dato-tenue')];
    expect(columnas).toHaveLength(10);
    expect(columnas.map((c) => c.classList.contains('bg-dato'))).toEqual([false, false, false, false, false, true, true, true, true, true]);
    for (const c of columnas) expect(c.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(within(lectura).getAllByRole('row')).toHaveLength(10);
    expect(lectura).toHaveTextContent('Entre 90 % y 100 %');
    expect(lectura).toHaveTextContent('1.000 mercados');
    expect(lectura).toHaveTextContent('En 80 de ellos hay un solo proveedor.');
  });

  it('el precio: un punto por comprador, los valores en texto y el SVG fuera del árbol accesible', async () => {
    todo();
    const { container } = render(await Home());
    const lectura = container.querySelector('article[aria-labelledby="lectura-precio"]') as HTMLElement;
    // Los círculos visibles; los otros cinco, transparentes, son el área de toque del globo.
    expect(lectura.querySelectorAll('svg circle.fill-dato')).toHaveLength(5);
    expect(lectura.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(lectura).toHaveTextContent('Percentil 25: $150.921');
    expect(lectura).toHaveTextContent('40 compradores');
  });

  it('los cierres: diez celdas, tantas llenas como décimos de la frase, y la tabla de los cuatro tramos', async () => {
    todo();
    const { container } = render(await Home());
    const lectura = container.querySelector('article[aria-labelledby="lectura-cierres"]') as HTMLElement;
    const celdas = [...lectura.querySelectorAll('[data-decimo]')];
    expect(celdas).toHaveLength(10);
    expect(celdas.filter((c) => c.getAttribute('data-decimo') === 'si')).toHaveLength(4);
    expect(within(lectura).getAllByRole('row').map((f) => f.textContent)).toEqual([
      'Hoy312',
      'Mañana740',
      'En 2 o 3 días1.105',
      'Después557',
    ]);
  });

  it.each([
    ['el producto con 404', { producto: async () => new Response('{}', { status: 404 }) }, CONCLUSION_PRECIO],
    ['el producto no indexable', { producto: ok({ ...PRODUCTO, indexable: false }) }, CONCLUSION_PRECIO],
    ['el producto sin periodo', { producto: ok({ ...PRODUCTO, periodo: null }) }, CONCLUSION_PRECIO],
    ['el producto sin p25', { producto: ok({ ...PRODUCTO, unidades: [{ ...BANDA, p25: null }] }) }, CONCLUSION_PRECIO],
    [
      'el producto de un solo comprador',
      { producto: ok({ ...PRODUCTO, unidades: [{ ...BANDA, compradores: 1, cuota_mayor: 1, de_mercado: false }] }) },
      CONCLUSION_PRECIO,
    ],
    ['el producto sin la lista de compradores', { producto: ok({ ...PRODUCTO, compradores: undefined }) }, CONCLUSION_PRECIO],
    ['un backend sin los tramos de cierre', { resumen: ok({ ...RESUMEN, compra_agil_por_cierre: undefined }) }, CONCLUSION_CIERRES],
    ['tramos de cierre mal formados', { resumen: ok({ ...RESUMEN, compra_agil_por_cierre: { hoy: 'muchas' } }) }, CONCLUSION_CIERRES],
    ['tramos que no suman las abiertas', { resumen: ok({ ...RESUMEN, compra_agil_abiertas: 9999 }) }, CONCLUSION_CIERRES],
    ['el mercado con 503', { mercado: async () => new Response('{}', { status: 503 }) }, CONCLUSION_CONCENTRACION],
    ['el mercado sin la tabla de concentración', { mercado: ok({ ...MERCADO, concentracion: null }) }, CONCLUSION_CONCENTRACION],
    [
      'una concentración sin monto',
      { mercado: ok({ ...MERCADO, concentracion: { ...MERCADO.concentracion!, monto_total: 0 } }) },
      CONCLUSION_CONCENTRACION,
    ],
    [
      'una concentración mal formada',
      { mercado: ok({ ...MERCADO, concentracion: { ...MERCADO.concentracion!, mercados: 'muchos' } }) },
      CONCLUSION_CONCENTRACION,
    ],
  ])('con %s se oculta sólo esa lectura, y entra la nota detrás de las otras', async (_, cambio, oculta) => {
    simularBackend({ ...TODO, ...cambio });
    const { container } = render(await Home());
    const otras = [CONCLUSION_PRECIO, CONCLUSION_CONCENTRACION, CONCLUSION_CIERRES].filter((c) => c !== oculta);
    expect(conclusiones()).toEqual([...otras, TITULO_NOTA]);
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
    expect(screen.getByRole('searchbox', { name: CAMPO })).toBeInTheDocument();
  });

  it('un resumen con tramos rotos no se lleva la frase de abiertas ni la franja', async () => {
    simularBackend({ ...TODO, resumen: ok({ ...RESUMEN, compra_agil_por_cierre: { hoy: 'muchas' } }) });
    render(await Home());
    expect(abiertas()).not.toBeNull();
    expect(screen.getByText('Publicadas hoy:')).toBeInTheDocument();
  });
});

describe('la franja de hoy', () => {
  const franja = () => screen.getByText('Actualizado el').closest('dl') as HTMLElement;

  it('publicadas hoy, quién más publica y la hora con el día', async () => {
    todo();
    render(await Home());
    expect(within(franja()).getByText('612 licitaciones y Compras Ágiles')).toBeInTheDocument();
    expect(within(franja()).getByTitle('Servicio de Salud Metropolitano Sur')).toBeInTheDocument();
    expect(within(franja()).getByText('Actualizado el').nextElementSibling).toHaveTextContent(/14.*oct.*11:00/);
  });

  it('con 0 publicadas hoy (cada madrugada), sólo la hora', async () => {
    simularBackend({ ...TODO, resumen: ok({ ...RESUMEN, publicadas_hoy: 0, mas_publica_hoy: null }) });
    render(await Home());
    expect(screen.queryByText('Publicadas hoy:')).toBeNull();
    expect(screen.queryByText('Más publica hoy:')).toBeNull();
    expect(franja()).toBeInTheDocument();
  });

  it('un backend sin los campos nuevos: sólo la hora, sin «undefined»', async () => {
    const { publicadas_hoy: _p, mas_publica_hoy: _m, compra_agil_por_cierre: _c, ...anterior } = RESUMEN;
    simularBackend({ ...TODO, resumen: ok(anterior) });
    const { container } = render(await Home());
    expect(screen.queryByText('Publicadas hoy:')).toBeNull();
    expect(franja()).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined|null/);
  });
});

describe('servidor y metadatos', () => {
  it('la página y sus piezas son de servidor (las islas cliente son los gráficos, en components/graficos)', () => {
    const raiz = join(__dirname, '..');
    const fuentes = [
      join(raiz, 'app', 'page.tsx'),
      ...readdirSync(join(raiz, 'components', 'portada')).map((f) => join(raiz, 'components', 'portada', f)),
    ];
    expect(fuentes.length).toBeGreaterThanOrEqual(7);
    for (const f of fuentes) expect(readFileSync(f, 'utf-8'), f).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('canonical, descripción corta y título sin «Inteligencia» (R10) ni «gratis y sin cuenta» (D11)', () => {
    expect(metadata.alternates?.canonical).toBe('/');
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    const titulo = JSON.stringify(metadata.title);
    expect(titulo).toMatch(/Qué compra el Estado de Chile y a qué precio/);
    const visible = `${titulo} ${metadata.description} ${JSON.stringify(metadata.openGraph)} ${JSON.stringify(metadata.twitter)}`;
    expect(visible).not.toMatch(/inteligencia|gratis y sin cuenta|sin registrarte/i);
    // Que `twitter` esté de verdad en lo que se mira: un test que lee `undefined` no ve nada.
    expect(metadata.twitter).toMatchObject({ title: expect.stringMatching(/Qué compra el Estado de Chile/) });
  });
});

/**
 * La portada v7 (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3 y §9): arriba se
 * busca, con las cifras y la ficha al lado; debajo, «Lo que dicen los datos», la
 * franja de hoy, «Lo mejor de hoy» y las notas de datos.
 *
 * Se fija:
 *   1. las cuatro piezas —la tira y la franja, «Lo mejor de hoy», los sectores
 *      (la «Base» de la ficha) y el producto (la lectura de precio)— se piden como
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
import { leerNotas, rutaNota } from '@/lib/notas';
import * as portada from '@/lib/portada';
import { rutaProducto } from '@/lib/publico';
import { pedirDestacadas } from '@/lib/publicoServidor';
import type { SectoresBI } from '@/types/bi';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { BandaUnidad, ProductoPublico, ResumenPortada } from '@/types/publico';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';
const PREGUNTA = '¿Qué le vendes al Estado?';

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

const NOTAS = leerNotas();
const CONCLUSION_PRECIO = `${PRODUCTO_PORTADA.nombre}: la mitad se pagó entre $150.921 y $240.000`;
const CONCLUSION_CIERRES = '4 de cada 10 Compras Ágiles abiertas cierran hoy o mañana';
// La lectura de la nota es la más reciente CON `antes_despues`, no la primera de la lista.
const NOTA_PORTADA = notaDeLaPortada(NOTAS)!;
const TITULO_NOTA = NOTA_PORTADA.titulo;
const LECTURAS = 'Lo que dicen los datos';

/** Las conclusiones de las lecturas (los `h3` de la banda), en orden. */
const conclusiones = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

type Respuesta = () => Promise<Response>;
const ok =
  (cuerpo: unknown): Respuesta =>
  async () =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
const caido: Respuesta = async () => new Response('{}', { status: 502 });
const sinRed: Respuesta = async () => Promise.reject(new TypeError('fetch failed'));

let pedidas: { url: string; init: RequestInit }[] = [];

type Piezas = { destacadas?: Respuesta; resumen?: Respuesta; sectores?: Respuesta; producto?: Respuesta };

/** Cada pieza con su respuesta; lo que no se diga, caído. */
function simularBackend({ destacadas = caido, resumen = caido, sectores = caido, producto = caido }: Piezas) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      if (url.endsWith('/publico/portada')) return resumen();
      if (url.includes('/compra-agil/destacadas')) return destacadas();
      if (url.endsWith('/bi/sector')) return sectores();
      if (url.includes('/publico/productos/')) return producto();
      return new Response('{}', { status: 404 });
    }),
  );
}

const TODO: Piezas = { destacadas: ok(DESTACADAS), resumen: ok(RESUMEN), sectores: ok(SECTORES), producto: ok(PRODUCTO) };
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
  delete process.env.AUTOR_URL;
});

describe('lo que la portada pide al backend', () => {
  it('las cuatro piezas, como renderizado del servidor: lo vivo media hora, analytics una semana', async () => {
    todo();
    render(await Home());
    const cache = Object.fromEntries(pedidas.map((p) => [p.url.replace(BACKEND, ''), p.init.next]));
    expect(cache).toEqual({
      '/api/v1/compra-agil/destacadas?limite=5': { revalidate: 1800, tags: ['compra-agil'] },
      '/api/v1/publico/portada': { revalidate: 1800, tags: ['compra-agil'] },
      '/api/v1/bi/sector': { revalidate: 604800, tags: ['analytics'] },
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

  it('un item nulo en la respuesta oculta el bloque y la portada no se cae', async () => {
    simularBackend({
      destacadas: ok({ ...DESTACADAS, items: [item(1), null] }),
      resumen: ok(RESUMEN),
    });
    const { container } = render(await Home());
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREGUNTA);
    expect(screen.getByRole('list', { name: 'Abiertas ahora' })).toBeInTheDocument();
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
  it('un solo h1, la pregunta, y el formulario a /buscar', async () => {
    todo();
    render(await Home());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREGUNTA);
    expect(screen.getByRole('searchbox', { name: PREGUNTA })).toHaveAttribute('name', 'q');
    expect(screen.getByRole('search')).toHaveAttribute('action', '/buscar');
    expect(within(screen.getByRole('list', { name: 'Ejemplos de búsqueda' })).getAllByRole('link')).toHaveLength(
      EJEMPLOS_BUSQUEDA.length,
    );
  });

  it.each([
    ['caído', caido],
    ['sin red', sinRed],
  ])('el buscador está aunque el backend no responda nada (%s)', async (_, respuesta) => {
    simularBackend({ destacadas: respuesta, resumen: respuesta, sectores: respuesta, producto: respuesta });
    const { container } = render(await Home());
    expect(screen.getByRole('searchbox', { name: PREGUNTA })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ejemplos de búsqueda' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Abiertas ahora' })).toBeNull();
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.queryByText('Actualizado el')).toBeNull();
    // La nota es contenido del repo: la banda sigue, con una sola lectura.
    expect(conclusiones()).toEqual([TITULO_NOTA]);
    expect(screen.getByRole('region', { name: 'Notas de datos' })).toBeInTheDocument();
  });
});

describe('la tira de cifras', () => {
  it('dos cifras al catálogo con el filtro que las cuenta', async () => {
    todo();
    render(await Home());
    const tira = screen.getByRole('list', { name: 'Abiertas ahora' });
    expect(within(tira).getByRole('link', { name: '4.232 licitaciones abiertas' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('licitaciones'),
    );
    expect(within(tira).getByRole('link', { name: '2.714 Compras Ágiles abiertas' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('compra_agil'),
    );
  });

  it.each([
    ['un 502', caido],
    ['sin hora', ok({ ...RESUMEN, actualizado_en: null })],
    ['una hora que no se puede leer', ok({ ...RESUMEN, actualizado_en: 'ayer a las once' })],
    ['un conteo negativo', ok({ ...RESUMEN, licitaciones_abiertas: -1 })],
  ])('con %s la tira se oculta y lo demás sigue', async (nombre, resumen) => {
    simularBackend({ destacadas: ok(DESTACADAS), resumen });
    const { container } = render(await Home());
    expect(screen.queryByRole('list', { name: 'Abiertas ahora' })).toBeNull();
    expect(container.textContent).not.toMatch(/invalid date|NaN/i);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREGUNTA);
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
    expect(screen.getByRole('list', { name: 'Abiertas ahora' })).toBeInTheDocument();
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

  it('si el backend falla, el bloque se oculta y la tira sigue', async () => {
    simularBackend({ resumen: ok(RESUMEN) });
    const { container } = render(await Home());
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.getByRole('list', { name: 'Abiertas ahora' })).toBeInTheDocument();
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

  it('con REPOSITORIO_URL: «Código» en el pie de cada lectura calculada, al fichero que la calcula', async () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    todo();
    render(await Home());
    expect(screen.getAllByRole('link', { name: 'Código' }).map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/x/tordo/blob/main/etl/analytics/product_price_bands.py',
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
    expect(conclusiones()).toEqual([CONCLUSION_PRECIO, CONCLUSION_CIERRES, TITULO_NOTA]);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('sin AUTOR_NOMBRE no firma, y nunca enseña el hueco', async () => {
    todo();
    const { container } = render(await Home());
    expect(container.textContent).not.toMatch(/lo hace|data scientist|\[\[/i);
    expect(screen.queryByRole('complementary', { name: 'Quién lo hace' })).toBeNull();
  });

  it('con AUTOR_NOMBRE y AUTOR_URL: «Lo hace» en la ficha y la ficha del autor junto a las notas', async () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    process.env.AUTOR_URL = 'https://github.com/prueba';
    todo();
    render(await Home());
    expect(screen.getByText('Lo hace').nextElementSibling).toHaveTextContent('Nombre De Prueba, data scientist');
    const ficha = screen.getByRole('complementary', { name: 'Quién lo hace' });
    expect(ficha).toHaveTextContent(/Nombre De Prueba hace .+\. Es data scientist/);
    expect(within(ficha).getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/prueba');
    expect(screen.getByRole('region', { name: 'Notas de datos' })).toContainElement(ficha);
  });

  it('firma la autoría, no el responsable legal (spec PORTADA_V7 V5)', async () => {
    process.env.RESPONSABLE_LEGAL = 'Otra Persona';
    todo();
    const { container } = render(await Home());
    expect(container.textContent).not.toMatch(/Otra Persona/);
  });
});

describe('las notas de datos', () => {
  it('la lectura es la nota más reciente con gráfico; la lista sigue en su orden', async () => {
    todo();
    const { container } = render(await Home());
    const lectura = container.querySelector('article[aria-labelledby="lectura-nota"]') as HTMLElement;
    expect(NOTA_PORTADA.antes_despues).not.toBeNull();
    expect(lectura).toHaveTextContent(NOTA_PORTADA.titulo);
    expect(lectura.querySelector('figure')).not.toBeNull();
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

describe('la estructura (spec PORTADA_V7 §3.1 y §3.7)', () => {
  it('desde lg, la fila de entrada en 7/5: el buscador a la izquierda, las cifras y la ficha a la derecha', async () => {
    todo();
    const { container } = render(await Home());
    expect(container.querySelector('.max-w-6xl')).not.toBeNull();
    const buscador = screen.getByRole('searchbox', { name: PREGUNTA }).closest('.lg\\:col-span-7') as HTMLElement;
    expect(buscador).not.toBeNull();
    expect(buscador.parentElement).toHaveClass('lg:grid-cols-12');
    expect(screen.getByRole('list', { name: 'Abiertas ahora' }).parentElement).toHaveClass('lg:col-start-8');
    expect(screen.getByText('Fuente').closest('dl')).toHaveClass('lg:col-start-8', 'lg:row-start-2');
  });

  it('en el DOM (y en móvil) las lecturas van antes que la ficha: la primera conclusión cabe en la primera pantalla', async () => {
    todo();
    render(await Home());
    const lecturas = screen.getByRole('region', { name: LECTURAS });
    const ficha = screen.getByText('Fuente').closest('dl') as HTMLElement;
    expect(lecturas.compareDocumentPosition(ficha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lecturas).toHaveClass('lg:row-start-3');
  });

  it('después de las lecturas: la franja, «Lo mejor de hoy» y las notas, en ese orden', async () => {
    todo();
    const { container } = render(await Home());
    const orden = [
      screen.getByRole('region', { name: LECTURAS }),
      screen.getByText('Actualizado el').closest('dl') as HTMLElement,
      container.querySelector('#hoy') as HTMLElement,
      screen.getByRole('region', { name: 'Notas de datos' }),
    ];
    for (let i = 1; i < orden.length; i++) {
      expect(orden[i - 1].compareDocumentPosition(orden[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('«Lo que dicen los datos»', () => {
  it('con todo, tres lecturas sobre blanco —precio, cierres y la última nota—, cada una con su pie de método', async () => {
    todo();
    render(await Home());
    const banda = screen.getByRole('region', { name: LECTURAS });
    expect(within(banda).getByText('Cada lectura dice de dónde sale, cómo se calcula y dónde bajarla.')).toBeInTheDocument();
    expect(conclusiones()).toEqual([CONCLUSION_PRECIO, CONCLUSION_CIERRES, TITULO_NOTA]);
    expect(within(banda).getAllByRole('article')).toHaveLength(3);
    expect(within(banda).getAllByRole('list', { name: 'Método y datos' })).toHaveLength(3);
    expect(banda.lastElementChild).toHaveClass('lg:grid-cols-3');
    // «Ver el producto» es la conclusión misma (spec §3.2).
    expect(screen.getByRole('link', { name: CONCLUSION_PRECIO })).toHaveAttribute('href', rutaProducto(PRODUCTO_PORTADA.slug));
    expect(screen.getByRole('link', { name: 'Las que cierran primero' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('compra_agil', [], { sort_by: 'fecha_cierre', sort_order: 'asc' }),
    );
    expect(screen.getByRole('link', { name: 'Leer la nota' })).toHaveAttribute('href', rutaNota(NOTA_PORTADA.slug));
    expect(screen.getAllByRole('link', { name: 'Ver en la API' }).map((a) => a.getAttribute('href'))).toEqual([
      `https://api.tordo.cl/api/v1/publico/productos/${PRODUCTO_PORTADA.slug}`,
      'https://api.tordo.cl/api/v1/publico/portada',
    ]);
  });

  it('el precio: un punto por comprador, los valores en texto y el SVG fuera del árbol accesible', async () => {
    todo();
    const { container } = render(await Home());
    const lectura = container.querySelector('article[aria-labelledby="lectura-precio"]') as HTMLElement;
    expect(lectura.querySelectorAll('svg circle')).toHaveLength(5);
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
  ])('con %s se oculta sólo esa lectura, y las otras dos se reparten el ancho', async (_, cambio, oculta) => {
    simularBackend({ ...TODO, ...cambio });
    const { container } = render(await Home());
    expect(conclusiones()).not.toContain(oculta);
    expect(conclusiones()).toHaveLength(2);
    const rejilla = screen.getByRole('region', { name: LECTURAS }).lastElementChild;
    expect(rejilla).toHaveClass('md:grid-cols-2');
    expect(rejilla).not.toHaveClass('lg:grid-cols-3');
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
    expect(screen.getByRole('searchbox', { name: PREGUNTA })).toBeInTheDocument();
  });

  it('un resumen con tramos rotos no se lleva la tira ni la franja', async () => {
    simularBackend({ ...TODO, resumen: ok({ ...RESUMEN, compra_agil_por_cierre: { hoy: 'muchas' } }) });
    render(await Home());
    expect(screen.getByRole('list', { name: 'Abiertas ahora' })).toBeInTheDocument();
    expect(screen.getByText('Publicadas hoy:')).toBeInTheDocument();
  });
});

describe('la franja de hoy', () => {
  const franja = () => screen.getByText('Actualizado el').closest('dl') as HTMLElement;

  it('publicadas hoy, quién más publica y la hora con el día', async () => {
    todo();
    render(await Home());
    expect(within(franja()).getByText('612')).toBeInTheDocument();
    expect(within(franja()).getByTitle('Servicio De Salud Metropolitano Sur')).toBeInTheDocument();
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
  it('la página y sus piezas son de servidor', () => {
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

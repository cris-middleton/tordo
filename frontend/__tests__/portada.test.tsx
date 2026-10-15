/**
 * La portada (spec del rediseño §6.3): un buscador primero, y lo vivo debajo.
 *
 * Se fija:
 *   1. lo vivo —la tira y «Lo mejor de hoy»— se pide como RENDERIZADO DEL
 *      SERVIDOR, media hora, etiqueta `compra-agil`, y **si el backend falla se
 *      oculta**: la portada no lanza, ni con un 500, ni sin red, ni con una
 *      respuesta rara, ni con una hora que no se puede leer;
 *   2. el buscador no depende de nada: con el backend caído, la portada sirve
 *      para buscar;
 *   3. «Código abierto» y «hecho por» sólo con su variable: nunca un enlace roto,
 *      una promesa falsa ni el hueco `[[…]]` de los documentos legales;
 *   4. nada de lo que se fue: ni hero, ni bandas, ni accesos, ni preguntas (están
 *      en /acerca), ni lo que se fue con las cuentas;
 *   5. sigue siendo un componente de servidor con `metadata`, sin «Inteligencia» (R10).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home, { metadata, revalidate } from '@/app/page';
import { descripcionDestacadas, TITULO_DESTACADAS } from '@/lib/compraAgil';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { EJEMPLOS_BUSQUEDA } from '@/lib/buscar';
import * as portada from '@/lib/portada';
import { pedirDestacadas } from '@/lib/publicoServidor';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { ResumenPortada } from '@/types/publico';

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
};

type Respuesta = () => Promise<Response>;
const ok =
  (cuerpo: unknown): Respuesta =>
  async () =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });
const caido: Respuesta = async () => new Response('{}', { status: 502 });
const sinRed: Respuesta = async () => Promise.reject(new TypeError('fetch failed'));

let pedidas: { url: string; init: RequestInit }[] = [];

/** Cada pieza viva con su respuesta; lo que no se diga, caído. */
function simularBackend({ destacadas = caido, resumen = caido }: { destacadas?: Respuesta; resumen?: Respuesta }) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      if (url.endsWith('/publico/portada')) return resumen();
      if (url.includes('/compra-agil/destacadas')) return destacadas();
      return new Response('{}', { status: 404 });
    }),
  );
}

const todo = () => simularBackend({ destacadas: ok(DESTACADAS), resumen: ok(RESUMEN) });

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
});

describe('lo que la portada pide al backend', () => {
  it('las dos piezas vivas, como renderizado del servidor, media hora, etiqueta compra-agil', async () => {
    todo();
    render(await Home());
    expect(pedidas.map((p) => p.url).sort()).toEqual([
      `${BACKEND}/api/v1/compra-agil/destacadas?limite=5`,
      `${BACKEND}/api/v1/publico/portada`,
    ]);
    for (const { init } of pedidas) {
      const cabeceras = new Headers(init.headers);
      expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
      expect(cabeceras.has('X-Tordo-Visitante')).toBe(false);
      expect(init.next).toEqual({ revalidate: 1800, tags: ['compra-agil'] });
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
    simularBackend({ destacadas: respuesta, resumen: respuesta });
    const { container } = render(await Home());
    expect(screen.getByRole('searchbox', { name: PREGUNTA })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ejemplos de búsqueda' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Abiertas ahora' })).toBeNull();
    expect(container.querySelector('#hoy')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Úsalo como quieras' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apoyar' })).toHaveAttribute('href', '/apoyar');
  });
});

describe('la tira de cifras', () => {
  it('dos cifras al catálogo con el filtro que las cuenta, y la hora', async () => {
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
    expect(screen.getByText(/^actualizado el/)).toHaveTextContent(/14.*oct.*11:00/);
  });

  it.each([
    ['un 502', caido],
    ['sin hora', ok({ ...RESUMEN, actualizado_en: null })],
    ['una hora que no se puede leer', ok({ ...RESUMEN, actualizado_en: 'ayer a las once' })],
    ['un conteo negativo', ok({ ...RESUMEN, licitaciones_abiertas: -1 })],
  ])('con %s la tira se oculta y lo demás sigue', async (_, resumen) => {
    simularBackend({ destacadas: ok(DESTACADAS), resumen });
    const { container } = render(await Home());
    expect(screen.queryByRole('list', { name: 'Abiertas ahora' })).toBeNull();
    expect(container.textContent).not.toMatch(/invalid date|NaN/i);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREGUNTA);
    expect(container.querySelector('#hoy')).not.toBeNull();
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
    expect(within(bloque).getByText(/Actualizado el/)).toHaveTextContent(/12.*oct.*13:05/);
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

describe('lo abierto y quién lo hace', () => {
  it('sin REPOSITORIO_URL: ni «Código» ni «código abierto»', async () => {
    todo();
    const { container } = render(await Home());
    expect(screen.queryByRole('link', { name: 'Código' })).toBeNull();
    expect(container.textContent).not.toMatch(/código y api abiertos/i);
    expect(screen.getByText(portada.lemaPortada(null))).toBeInTheDocument();
  });

  it('con REPOSITORIO_URL: «Código» enlazado y el lema lo dice', async () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    todo();
    render(await Home());
    expect(screen.getByRole('link', { name: 'Código' })).toHaveAttribute('href', 'https://github.com/x/tordo');
    expect(screen.getByText(portada.lemaPortada('https://github.com/x/tordo'))).toBeInTheDocument();
  });

  it('sin RESPONSABLE_LEGAL no firma, y nunca enseña el hueco', async () => {
    todo();
    const { container } = render(await Home());
    expect(container.textContent).not.toMatch(/hecho por|\[\[/i);
  });

  it('con RESPONSABLE_LEGAL, «hecho por» y el nombre', async () => {
    process.env.RESPONSABLE_LEGAL = 'Nombre De Prueba';
    todo();
    render(await Home());
    expect(screen.getByText(/hecho por Nombre De Prueba/)).toBeInTheDocument();
  });

  it('el costo sale de lib/costos y enlaza al desglose', async () => {
    todo();
    render(await Home());
    expect(screen.getByRole('link', { name: `~${COSTO_MENSUAL_APROXIMADO} al mes` })).toHaveAttribute(
      'href',
      '/apoyar#costos',
    );
  });
});

describe('lo que ya no está', () => {
  it('ni hero, ni bandas, ni accesos, ni preguntas frecuentes (están en /acerca)', async () => {
    todo();
    const { container } = render(await Home());
    expect(container.innerHTML).not.toMatch(/bg-brand-navy|bg-band\d/);
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

  it('canonical, descripción corta y título sin «Inteligencia» (R10)', () => {
    expect(metadata.alternates?.canonical).toBe('/');
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    const titulo = JSON.stringify(metadata.title);
    expect(titulo).toMatch(/gratis y sin cuenta/i);
    const visible = `${titulo} ${metadata.description} ${JSON.stringify(metadata.openGraph)} ${JSON.stringify(metadata.twitter)}`;
    expect(visible).not.toMatch(/inteligencia/i);
    // Que `twitter` esté de verdad en lo que se mira: un test que lee `undefined` no ve nada.
    expect(metadata.twitter).toMatchObject({ title: expect.stringMatching(/gratis y sin cuenta/i) });
  });
});

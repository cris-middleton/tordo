/**
 * La portada (paso 10b del pivote).
 *
 * Se fija:
 *   1. el bloque «Lo mejor de hoy» se pide como RENDERIZADO DEL SERVIDOR, con
 *      media hora de caché y la etiqueta `compra-agil` que vacía el cron;
 *   2. **si el backend falla, el bloque se oculta y la portada sigue en pie**
 *      — no lanza, ni con un 500, ni sin red, ni con una respuesta rara;
 *   3. un solo `h1`, las dos acciones del hero y nada que prometa lo que se fue
 *      con las cuentas (avisos, informe, encaje, prueba gratis…);
 *   4. sigue siendo un componente de servidor con `metadata`;
 *   5. cada enlace a una guía apunta a un explicativo que existe.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home, { metadata, revalidate } from '@/app/page';
import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from '@/lib/compraAgil';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { ACCESOS, PREGUNTAS, actualizadoEnPalabras } from '@/lib/portada';
import { pedirDestacadas } from '@/lib/publicoServidor';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

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

const RESPUESTA: CompraAgilDestacadasResponse = {
  actualizado_en: '2026-10-12T16:05:00Z',
  historia_disponible: true,
  ventana_desde: '2026-04-12',
  ventana_hasta: '2026-10-12',
  items: [1, 2, 3, 4, 5].map(item),
};

let pedidas: { url: string; init: RequestInit }[] = [];

function simularBackend(respuesta: () => Promise<Response>) {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url, init });
      return respuesta();
    }),
  );
}

const ok = (cuerpo: unknown) => async () =>
  new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('el bloque vivo', () => {
  it('se pide como renderizado del servidor, media hora, etiqueta compra-agil', async () => {
    simularBackend(ok(RESPUESTA));
    expect(await pedirDestacadas(5)).toEqual(RESPUESTA);
    const { url, init } = pedidas[0];
    expect(url).toBe(`${BACKEND}/api/v1/compra-agil/destacadas?limite=5`);
    const cabeceras = new Headers(init.headers);
    expect(cabeceras.get('X-Tordo-Proxy')).toBe(SECRETO);
    expect(cabeceras.has('X-Tordo-Visitante')).toBe(false);
    expect(init.next).toEqual({ revalidate: 1800, tags: ['compra-agil'] });
    expect(revalidate).toBe(1800);
  });

  it.each([
    ['un 500', async () => new Response('{}', { status: 500 })],
    ['sin red', async () => Promise.reject(new TypeError('fetch failed'))],
    ['una respuesta sin items', ok({ detail: 'raro' })],
  ])('con %s devuelve null y no lanza', async (_, respuesta) => {
    simularBackend(respuesta);
    await expect(pedirDestacadas(5)).resolves.toBeNull();
  });

  it('la hora de actualización va con el día, en hora de Chile', () => {
    // 16:05 UTC del lunes 12 de octubre es 13:05 en Santiago (UTC-3 en primavera).
    expect(actualizadoEnPalabras('2026-10-12T16:05:00Z')).toMatch(/12.*oct.*13:05/);
    expect(actualizadoEnPalabras(null)).toBeNull();
    expect(actualizadoEnPalabras('no es fecha')).toBeNull();
  });
});

describe('la portada', () => {
  it('con destacadas: el hero, las cinco y la hora', async () => {
    simularBackend(ok(RESPUESTA));
    render(await Home());

    expect(screen.getByText(new RegExp(`unos ${COSTO_MENSUAL_APROXIMADO.replace('$', '\\$')} al mes`))).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /inteligencia de compras públicas, gratis y sin cuenta/i,
    );
    expect(screen.getByRole('link', { name: new RegExp(`^${TITULO_DESTACADAS}$`, 'i') })).toHaveAttribute(
      'href',
      '/compra-agil',
    );
    expect(screen.getByRole('link', { name: /buscar precios/i })).toHaveAttribute('href', '/productos');

    const lista = screen.getByRole('list', { name: /compras ágiles destacadas de hoy/i });
    // Los hijos directos: cada tarjeta trae su propia lista de factores.
    expect(lista.children).toHaveLength(5);
    expect(within(lista).getByText(/compra de prueba 5/i)).toBeInTheDocument();
    expect(screen.getByText(/13:05/)).toBeInTheDocument();
  });

  it('el bloque dice el título y la descripción de un solo sitio y no habla de cotizaciones', async () => {
    simularBackend(ok(RESPUESTA));
    const { container } = render(await Home());

    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(within(bloque).getByRole('heading', { level: 2 })).toHaveTextContent(TITULO_DESTACADAS);
    expect(within(bloque).getByText(DESCRIPCION_DESTACADAS)).toBeInTheDocument();
    // El conteo de cotizaciones no se mantiene (G1 sin resolver): ni en el
    // texto del bloque ni en sus cinco tarjetas.
    expect(bloque.textContent).not.toMatch(/cotiz/i);
  });

  it('con la historia por unidad aún sin calcular, las tarjetas no dicen nada del comprador', async () => {
    simularBackend(ok({ ...RESPUESTA, historia_disponible: false }));
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(within(bloque).getAllByRole('article')).toHaveLength(5);
    expect(bloque.textContent).not.toMatch(/historial|esta unidad|órdenes|suele comprar/i);
  });

  it('con la historia disponible, cada tarjeta dice lo de su unidad', async () => {
    simularBackend(ok(RESPUESTA));
    const { container } = render(await Home());
    const bloque = container.querySelector('#hoy') as HTMLElement;
    expect(within(bloque).getAllByText(/^Esta unidad: /)).toHaveLength(5);
  });

  it('la pregunta frecuente de «lo mejor de hoy» dice lo que ordena, sin «cotizaciones»', () => {
    const p = PREGUNTAS.find((q) => q.enlace?.href === '/guias/lo-mejor-de-hoy-en-compra-agil');
    expect(p).toBeDefined();
    expect(p!.pregunta).toContain(TITULO_DESTACADAS);
    expect(p!.respuesta).toBe(DESCRIPCION_DESTACADAS);
    expect(`${p!.pregunta} ${p!.respuesta}`).not.toMatch(/cotiz|adjudica lo que publica/i);
  });

  it('si el backend falla, el bloque se oculta y lo demás sigue', async () => {
    simularBackend(async () => new Response('{}', { status: 502 }));
    render(await Home());

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /lo mejor de hoy/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /qué hay en el sitio/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /apoyar el sitio/i })[0]).toHaveAttribute('href', '/apoyar');
  });

  it('sin Compras Ágiles abiertas, lo dice en vez de dejar un hueco', async () => {
    simularBackend(ok({ ...RESPUESTA, items: [] }));
    render(await Home());
    expect(screen.getByText(/no hay compras ágiles abiertas/i)).toBeInTheDocument();
  });

  it('no promete nada de lo que se fue con las cuentas', async () => {
    simularBackend(ok(RESPUESTA));
    const { container } = render(await Home());
    const texto = `${container.textContent} ${metadata.description} ${JSON.stringify(metadata.title)}`;
    expect(texto).not.toMatch(
      /alerta|aviso por correo|informe semanal|encaje|prueba gratis|trial|inicia sesión|tu posición|suscrip|plazo de pago|paga a \d/i,
    );
  });

  it('es un componente de servidor con metadata y canonical', () => {
    const fuente = readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf-8');
    expect(fuente).not.toMatch(/^\s*['"]use client['"]/m);
    expect(metadata.alternates?.canonical).toBe('/');
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
  });
});

describe('enlaces a las guías', () => {
  const CONTENIDO = join(__dirname, '..', 'content', 'explicativos');
  const destinos = [
    ...ACCESOS.map((a) => a.href),
    ...PREGUNTAS.flatMap((p) => (p.enlace ? [p.enlace.href] : [])),
    '/guias/de-donde-salen-los-datos',
  ].filter((h) => h.startsWith('/guias/'));

  it('hay enlaces a guías que revisar', () => {
    expect(destinos.length).toBeGreaterThanOrEqual(4);
  });

  it.each(destinos)('%s existe', (href) => {
    expect(existsSync(join(CONTENIDO, `${href.slice('/guias/'.length)}.mdx`))).toBe(true);
  });
});

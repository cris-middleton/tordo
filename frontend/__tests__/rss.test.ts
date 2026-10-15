// @vitest-environment node
/**
 * Los feeds RSS (`/rss/licitaciones`, `/rss/compra-agil`).
 *
 * Se fija:
 *   1. el escape XML — un `<` o un `&` en el nombre de una licitación rompía
 *      el feed entero, y un lector no dice por qué;
 *   2. la lista blanca — un parámetro desconocido no llega al backend, y el
 *      tamaño y el orden los pone el feed;
 *   3. que llama al backend como el visitante, como el proxy;
 *   4. la caché del CDN, los enlaces absolutos y la cita de la fuente en
 *      CADA ítem (es condición de uso de los datos).
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FUENTE_DATOS } from '@/lib/atribucion';
import { descripcionDestacadas, TITULO_DESTACADAS } from '@/lib/compraAgil';
import { CACHE_RSS, construirRss, escaparXml, filtrarParams, PARAMS_RSS_LICITACIONES } from '@/lib/rss';

const BACKEND = 'http://backend.prueba:8000';
const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

let pedidas: { url: URL; headers: Headers }[] = [];

function simularBackend(cuerpo: unknown, status = 200) {
  process.env.API_URL = BACKEND;
  process.env.PROXY_SECRETO = SECRETO;
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      pedidas.push({ url: new URL(url), headers: new Headers(init.headers) });
      return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.PROXY_SECRETO;
});

const LICITACION_TRAMPA = {
  id: 1,
  codigo_externo: '1234-5-LE26',
  nombre: 'Tornillos <M8> & tuercas "inox" de O\'Higgins',
  nombre_organismo: 'MUNICIPALIDAD DE PRUEBA',
  region: 'Región del Biobío',
  monto_estimado: 2_000_000,
  fecha_publicacion: '2026-10-12T09:00:00-03:00',
  fecha_cierre: '2026-10-20T15:00:00-03:00',
};

describe('escape XML', () => {
  it('escapa <, >, &, comillas y apóstrofos', () => {
    expect(escaparXml(`<a href="x">B & C's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;B &amp; C&apos;s&lt;/a&gt;',
    );
  });

  it('quita los caracteres de control que XML no admite', () => {
    expect(escaparXml('a\u0000b\u000Bc\td')).toBe('abc\td');
  });

  it('un ítem con trampas sigue siendo XML válido', () => {
    const xml = construirRss({
      titulo: 'T & <C>',
      enlace: 'https://tordo.cl/?a=1&b=2',
      descripcion: 'd',
      items: [{ titulo: LICITACION_TRAMPA.nombre, enlace: 'https://x/?a=1&b=2', descripcion: '<b>', guid: 'g' }],
    });
    expect(xml).toContain('<title>Tornillos &lt;M8&gt; &amp; tuercas &quot;inox&quot; de O&apos;Higgins</title>');
    expect(xml).toContain('<link>https://x/?a=1&amp;b=2</link>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    // Lo parsea un parser XML de verdad, no sólo una regex.
    const { DOMParser } = new (require('jsdom').JSDOM)().window;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('item')[0].getElementsByTagName('title')[0].textContent).toBe(
      LICITACION_TRAMPA.nombre,
    );
  });
});

describe('lista blanca', () => {
  it('sólo pasan los filtros conocidos, recortados y sin vacíos', () => {
    const p = filtrarParams(
      new URLSearchParams('search=+agua+&region=&limit=5000&offset=9&sort_by=nombre&evil=1&estado=Publicada'),
      PARAMS_RSS_LICITACIONES,
    );
    expect(p.toString()).toBe('search=agua&estado=Publicada');
  });
});

describe('/rss/licitaciones', () => {
  async function pedir(url: string, headers: Record<string, string> = {}) {
    const { GET } = await import('@/app/rss/licitaciones/route');
    return GET(new NextRequest(url, { headers }));
  }

  it('pide al backend sólo los filtros, más su orden y tamaño, como el visitante', async () => {
    simularBackend({ items: [LICITACION_TRAMPA], total: 1, page: 1, size: 50, pages: 1 });
    await pedir('https://tordo.cl/rss/licitaciones?search=tornillos&limit=999&x=<script>', {
      'x-real-ip': '200.1.2.3',
    });

    expect(pedidas).toHaveLength(1);
    const { url, headers } = pedidas[0];
    expect(url.origin).toBe(BACKEND);
    expect(url.pathname).toBe('/api/v1/tenders/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'tornillos',
      sort_by: 'fecha_publicacion',
      sort_order: 'desc',
      limit: '50',
      offset: '0',
    });
    expect(headers.get('x-tordo-visitante')).toBe('200.1.2.3');
    expect(headers.get('x-tordo-proxy')).toBe(SECRETO);
  });

  it('reenvía abiertas al backend', async () => {
    simularBackend({ items: [], total: 0, page: 1, size: 50, pages: 1 });
    await pedir('https://tordo.cl/rss/licitaciones?search=tornillos&abiertas=1');
    expect(pedidas[0].url.searchParams.get('abiertas')).toBe('1');
  });

  it('responde RSS cacheable, con enlaces absolutos y la fuente en cada ítem', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://tordo.cl/');
    simularBackend({ items: [LICITACION_TRAMPA, { ...LICITACION_TRAMPA, codigo_externo: '2' }] });
    const res = await pedir('http://interno:3000/rss/licitaciones?search=tornillos');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/rss\+xml/);
    expect(res.headers.get('cache-control')).toBe(CACHE_RSS);
    expect(CACHE_RSS).toBe('public, s-maxage=1800, stale-while-revalidate=600');

    const xml = await res.text();
    expect(xml).toContain('<link>https://tordo.cl/licitaciones/1234-5-LE26</link>');
    expect(xml).toContain('<link>https://tordo.cl/licitaciones?search=tornillos</link>');
    const items = xml.split('<item>').slice(1);
    expect(items).toHaveLength(2);
    for (const item of items) expect(item).toContain(escaparXml(FUENTE_DATOS));
  });

  it('sin NEXT_PUBLIC_SITE_URL, el origen sale del host de la petición', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    simularBackend({ items: [LICITACION_TRAMPA] });
    const res = await pedir('http://0.0.0.0:3000/rss/licitaciones', {
      host: 'tordo.example',
      'x-forwarded-proto': 'https',
    });
    expect(await res.text()).toContain('<link>https://tordo.example/licitaciones/1234-5-LE26</link>');
  });

  it('un filtro inválido es 400; un backend caído, 502', async () => {
    simularBackend({ detail: 'x' }, 422);
    expect((await pedir('https://tordo.cl/rss/licitaciones?tipo_convocatoria=nada')).status).toBe(400);
    simularBackend({ detail: 'x' }, 500);
    expect((await pedir('https://tordo.cl/rss/licitaciones')).status).toBe(502);
  });
});

describe('/rss/compra-agil', () => {
  it('pide las destacadas con región y búsqueda, nada más', async () => {
    simularBackend({
      actualizado_en: null,
      historia_disponible: true,
      ventana_desde: null,
      ventana_hasta: null,
      items: [
        {
          ...LICITACION_TRAMPA,
          codigo_externo: '99-1-COT26',
          horas_restantes: 20,
          ofertas_recibidas: 3,
          ofertas_al: null,
          comprador: null,
          puntaje: 0.5,
          factores: { competencia: 1, comprador: 0.5, tiempo: 0.8, monto: 1 },
        },
      ],
    });
    const { GET } = await import('@/app/rss/compra-agil/route');
    const res = await GET(
      new NextRequest('https://tordo.cl/rss/compra-agil?region=Región del Biobío&limite=50&foo=1'),
    );

    const { url } = pedidas[0];
    expect(url.pathname).toBe('/api/v1/compra-agil/destacadas');
    expect(Object.fromEntries(url.searchParams)).toEqual({ region: 'Región del Biobío', limite: '20' });

    const xml = await res.text();
    expect(res.headers.get('cache-control')).toBe(CACHE_RSS);
    // El conteo de cotizaciones no se mantiene (G1 cerrada: no se refresca): ni en el
    // canal ni en cada ítem, aunque el backend lo mande.
    expect(xml).not.toMatch(/cotiz/i);
    expect(xml).toContain(escaparXml(TITULO_DESTACADAS));
    expect(xml).toContain(escaparXml(descripcionDestacadas(true)));
    expect(xml).toContain(escaparXml(FUENTE_DATOS));
    expect(xml).toMatch(/&lt;m8&gt;/i);
  });

  async function rssConHistoria(historia_disponible: boolean) {
    simularBackend({
      actualizado_en: null,
      historia_disponible,
      ventana_desde: '2026-04-01',
      ventana_hasta: '2026-09-30',
      items: [
        {
          ...LICITACION_TRAMPA,
          codigo_externo: '99-2-COT26',
          horas_restantes: 20,
          ofertas_recibidas: null,
          ofertas_al: null,
          comprador: historia_disponible
            ? {
                ordenes: 524,
                publicadas: null,
                proveedores_distintos: 40,
                cuota_lider_pct: 10,
                monto_mediana: 850_000,
                monto_p25: 400_000,
                monto_p75: 1_500_000,
                percentil_ordenes: 0.9,
              }
            : null,
          puntaje: 0.5,
          factores: { competencia: 1, comprador: 0.5, tiempo: 0.8, monto: 1 },
        },
      ],
    });
    const { GET } = await import('@/app/rss/compra-agil/route');
    return (await GET(new NextRequest('https://tordo.cl/rss/compra-agil'))).text();
  }

  it('con historia disponible, cada ítem dice las órdenes de su unidad', async () => {
    const xml = await rssConHistoria(true);
    expect(xml).toContain('Esta unidad: 524 órdenes de Compra Ágil en 6 meses');
    expect(xml).toMatch(/Suele comprar entre/);
  });

  it('sin historia aún, el ítem no dice nada del comprador', async () => {
    const xml = await rssConHistoria(false);
    expect(xml).not.toMatch(/historial|esta unidad|suele comprar|su orden típica/i);
    // Ni el canal afirma un criterio que no está ordenando nada.
    expect(xml).toContain(escaparXml(descripcionDestacadas(false)));
    expect(xml).not.toMatch(/compran seguido/);
  });
});

/**
 * Las notas de datos: `/notas`, `/notas/<slug>` y `/rss/notas`
 * (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §5).
 *
 * Se fija:
 *   1. la lista va de la más nueva a la más vieja, con fecha y título;
 *   2. la nota se pinta entera: un h1, la fecha, el estado, sus datos, el cuerpo
 *      sin Markdown suelto y las fuentes; con `AUTOR_NOMBRE` la firma, sin ella
 *      ninguna línea de autor;
 *   3. «El cambio» y «El script» sólo cuando existen, y el script sólo con
 *      `REPOSITORIO_URL`;
 *   4. cada enlace interno de cada nota lleva a una ruta que existe;
 *   5. el feed: RSS válido, ordenado, con la cita de la fuente y el XML escapado.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// El feed lee `leerNotas`; un test le pasa una nota con caracteres de XML.
const sobrescribir = vi.hoisted(() => ({ notas: null as unknown[] | null }));
vi.mock('@/lib/notas', async (original) => {
  const real = await original<typeof import('@/lib/notas')>();
  return { ...real, leerNotas: () => (sobrescribir.notas as Nota[] | null) ?? real.leerNotas() };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import PaginaNota, { dynamicParams, generateMetadata, generateStaticParams } from '@/app/(publico)/notas/[slug]/page';
import PaginaNotas from '@/app/(publico)/notas/page';
import { GET } from '@/app/rss/notas/route';
import { FUENTE_DATOS } from '@/lib/atribucion';
import { destinos } from '@/lib/markdown';
import { ETIQUETA_ESTADO, fechaLarga, leerNotas, ordenarNotas, type Nota } from '@/lib/notas';
import { escaparXml } from '@/lib/rss';

const NOTAS = leerNotas();
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

afterEach(() => {
  vi.unstubAllEnvs();
  sobrescribir.notas = null;
});

describe('el orden', () => {
  it('de la más nueva a la más vieja; a igual fecha, por título', () => {
    const nota = (titulo: string, fecha: string) => ({ titulo, fecha }) as Nota;
    expect(
      ordenarNotas([nota('B', '2026-08-16'), nota('Z', '2026-10-16'), nota('A', '2026-08-16')]).map((n) => n.titulo),
    ).toEqual(['Z', 'A', 'B']);
  });

  it('las del disco ya vienen así', () => {
    expect(NOTAS.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < NOTAS.length; i++) expect(NOTAS[i - 1].fecha >= NOTAS[i].fecha).toBe(true);
  });

  it('fechaLarga no pasa por la zona horaria', () => {
    expect(fechaLarga('2026-10-16')).toBe('16 de octubre de 2026');
    expect(fechaLarga('2026-01-01')).toBe('1 de enero de 2026');
  });
});

describe('/notas', () => {
  it('lista cada nota con su fecha y su enlace, en orden, sin tarjetas', () => {
    const { container } = render(<PaginaNotas />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(NOTAS.length);
    NOTAS.forEach((n, i) => {
      const enlace = within(items[i]).getByRole('link', { name: new RegExp(escapar(n.titulo)) });
      expect(enlace).toHaveAttribute('href', `/notas/${n.slug}`);
      expect(within(items[i]).getByText((_, el) => el?.tagName === 'TIME')).toHaveAttribute('dateTime', n.fecha);
    });
    expect(container.querySelector('a[href="/rss/notas"]')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/rounded-xl|shadow/);
  });
});

describe('/notas/<slug>', () => {
  it('se generan todas en el build y el resto es 404', async () => {
    expect(generateStaticParams()).toEqual(NOTAS.map((n) => ({ slug: n.slug })));
    expect(dynamicParams).toBe(false);
    await expect(PaginaNota(params('no-existe'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sin AUTOR_NOMBRE no hay línea de autor', async () => {
    vi.stubEnv('AUTOR_NOMBRE', '');
    render(await PaginaNota(params(NOTAS[0].slug)));
    expect(screen.getByText(/^Nota de datos del/)).toHaveTextContent(`Nota de datos del ${fechaLarga(NOTAS[0].fecha)}.`);
    expect(screen.queryByText(/La escribe/)).toBeNull();
  });

  it('con AUTOR_NOMBRE firma, y con AUTOR_URL https enlaza el nombre', async () => {
    vi.stubEnv('AUTOR_NOMBRE', 'Ana Pérez');
    vi.stubEnv('AUTOR_URL', 'https://github.com/ana');
    render(await PaginaNota(params(NOTAS[0].slug)));
    expect(screen.getByText(/^Nota de datos del/)).toHaveTextContent(
      `Nota de datos del ${fechaLarga(NOTAS[0].fecha)}. La escribe Ana Pérez.`,
    );
    expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute('href', 'https://github.com/ana');
  });

  it('un AUTOR_URL que no es https no se enlaza', async () => {
    vi.stubEnv('AUTOR_NOMBRE', 'Ana Pérez');
    vi.stubEnv('AUTOR_URL', 'javascript:alert(1)');
    render(await PaginaNota(params(NOTAS[0].slug)));
    expect(screen.queryByRole('link', { name: 'Ana Pérez' })).toBeNull();
    expect(screen.getByText(/La escribe Ana Pérez/)).toBeInTheDocument();
  });

  it('«El script» sólo con repositorio', async () => {
    const conScript = NOTAS.find((n) => n.script);
    expect(conScript, 'guarda: alguna nota trae script').toBeDefined();
    vi.stubEnv('REPOSITORIO_URL', '');
    const sin = render(await PaginaNota(params(conScript!.slug)));
    expect(screen.queryByRole('link', { name: 'El script' })).toBeNull();
    sin.unmount();
    vi.stubEnv('REPOSITORIO_URL', 'https://github.com/cris-middleton/tordo');
    render(await PaginaNota(params(conScript!.slug)));
    expect(screen.getByRole('link', { name: 'El script' })).toHaveAttribute(
      'href',
      `https://github.com/cris-middleton/tordo/blob/main/${conScript!.script}`,
    );
  });

  describe.each(NOTAS.map((n) => [n.slug, n] as const))('%s', (slug, nota) => {
    it('metadatos con título, resumen, canonical y openGraph', async () => {
      const m = await generateMetadata(params(slug));
      expect(m.title).toBe(nota.titulo);
      expect(m.description).toBe(nota.resumen);
      expect(m.alternates?.canonical).toBe(`/notas/${slug}`);
      expect(m.openGraph).toMatchObject({ title: nota.titulo, url: `/notas/${slug}`, type: 'article' });
    });

    it('se pinta entera, con estado y fuentes, y sin Markdown suelto', async () => {
      const { container } = render(await PaginaNota(params(slug)));
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByText(ETIQUETA_ESTADO[nota.estado])).toBeInTheDocument();
      expect(screen.getByText(nota.medido_sobre)).toBeInTheDocument();
      const fuentes = screen.getByRole('region', { name: /fuentes/i });
      expect(within(fuentes).getAllByRole('listitem')).toHaveLength(nota.fuentes.length);
      if (nota.cambio) expect(screen.getByRole('link', { name: 'El cambio' })).toHaveAttribute('href', nota.cambio);
      else expect(screen.queryByRole('link', { name: 'El cambio' })).toBeNull();
      if (nota.antes_despues) expect(screen.getByText(nota.antes_despues.rotulo)).toBeInTheDocument();

      const copia = container.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('pre, code').forEach((n) => n.remove());
      expect(copia.textContent).not.toMatch(/\*\*|\]\(|```|\|---|^#{2,} /m);
    });

    it('enlaces internos a rutas que existen', () => {
      for (const d of destinos(nota.cuerpo).filter((x) => x.startsWith('/'))) expect(existe(d), d).toBe(true);
    });
  });
});

// ── Rutas que existen (como en guias.test.tsx) ───────────────────────────────

const APP = join(__dirname, '..', 'app');

function patrones(dir = APP): string[][] {
  const salida: string[][] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...patrones(ruta));
    else if (entrada === 'page.tsx') {
      salida.push(
        relative(APP, dir)
          .split(/[\\/]/)
          .filter((s) => s && !/^\(.*\)$/.test(s)),
      );
    }
  }
  return salida;
}

const PATRONES = patrones();
const SLUGS = new Set(NOTAS.map((n) => n.slug));
const GUIAS = new Set(
  readdirSync(join(__dirname, '..', 'content', 'explicativos')).map((f) => f.replace(/\.mdx$/, '')),
);

function existe(href: string): boolean {
  const segmentos = href.split(/[?#]/)[0].split('/').filter(Boolean);
  if (segmentos[0] === 'notas' && segmentos.length === 2) return SLUGS.has(segmentos[1]);
  if (segmentos[0] === 'guias' && segmentos.length === 2) return GUIAS.has(segmentos[1]);
  return PATRONES.some(
    (p) => p.length === segmentos.length && p.every((s, i) => /^\[.+\]$/.test(s) || s === segmentos[i]),
  );
}

it('guarda del resolvedor: lo que no existe, no existe', () => {
  expect(existe('/notas/no-existe')).toBe(false);
  expect(existe('/guias/no-existe')).toBe(false);
  expect(existe('/notas')).toBe(true);
});

// ── El feed ──────────────────────────────────────────────────────────────────

describe('/rss/notas', () => {
  const pedir = () => GET(new NextRequest('https://tordo.prueba/rss/notas', { headers: { host: 'tordo.prueba' } }));

  it('RSS 2.0 con la caché de los feeds, un ítem por nota y en orden', async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/rss\+xml/);
    expect(r.headers.get('cache-control')).toMatch(/s-maxage=1800/);
    const xml = await r.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0">/);
    const enlaces = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    expect(enlaces).toEqual(NOTAS.map((n) => `https://tordo.prueba/notas/${n.slug}`));
  });

  it('cada ítem cita la fuente', async () => {
    const xml = await (await pedir()).text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    expect(items).toHaveLength(NOTAS.length);
    for (const item of items) expect(item).toContain(escaparXml(FUENTE_DATOS));
  });

  it('el texto de una nota va escapado', async () => {
    sobrescribir.notas = [{ ...NOTAS[0], titulo: 'A & B <c>', resumen: 'x "y" <z>' }];
    const xml = await (await pedir()).text();
    expect(xml).toContain('<title>A &amp; B &lt;c&gt;</title>');
    expect(xml).toContain('x &quot;y&quot; &lt;z&gt;');
    expect(xml).not.toContain('<c>');
  });
});

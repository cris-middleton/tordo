/**
 * Las guías (`/guias`, `/guias/<slug>`), publicadas desde
 * `content/explicativos/*.mdx`.
 *
 * Se fija:
 *   1. el Markdown mínimo de `lib/markdown.ts`: cada construcción que usa el
 *      contenido, y que un `#` (h1) en el cuerpo rompe el build;
 *   2. cada guía se pinta entera — un h1, la fecha, las fuentes — y **sin
 *      marcadores de Markdown sueltos** (lo que delataría una construcción sin
 *      soporte);
 *   3. **cada enlace interno de cada guía apunta a una ruta que existe**,
 *      resuelta contra `app/` y, para `/guias/<slug>`, contra las guías;
 *   4. metadatos con canonical, y un slug desconocido es 404.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import PaginaGuia, { dynamicParams, generateMetadata, generateStaticParams } from '@/app/(publico)/guias/[slug]/page';
import PaginaGuias from '@/app/(publico)/guias/page';
import { Markdown } from '@/components/guias/Markdown';
import { leerGuias } from '@/lib/guias';
import { bloques, destinos, enLinea } from '@/lib/markdown';

const GUIAS = leerGuias();
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('Markdown mínimo', () => {
  it('en línea: negrita, cursiva, código y enlaces, anidados', () => {
    expect(enLinea('a **b [c](/d)** *e* `f*g*`')).toEqual([
      { t: 'texto', v: 'a ' },
      {
        t: 'negrita',
        hijos: [
          { t: 'texto', v: 'b ' },
          { t: 'enlace', href: '/d', hijos: [{ t: 'texto', v: 'c' }] },
        ],
      },
      { t: 'texto', v: ' ' },
      { t: 'cursiva', hijos: [{ t: 'texto', v: 'e' }] },
      { t: 'texto', v: ' ' },
      { t: 'codigo', v: 'f*g*' },
    ]);
    // Un asterisco suelto no abre cursiva.
    expect(enLinea('10.000 / *n* y 2 * 3')).toEqual([
      { t: 'texto', v: '10.000 / ' },
      { t: 'cursiva', hijos: [{ t: 'texto', v: 'n' }] },
      { t: 'texto', v: ' y 2 * 3' },
    ]);
  });

  it('bloques: títulos, párrafos, listas con continuación, cita, código y tabla', () => {
    const arbol = bloques(
      [
        '## Uno',
        'línea a',
        'línea b',
        '',
        '- item uno',
        '  sigue',
        '- item dos',
        '',
        '3. tres',
        '   sigue',
        '4. cuatro',
        '',
        '> cita',
        '',
        '```',
        'x = 1',
        '```',
        '',
        '| a | b |',
        '|---|---|',
        '| **1** | 2 |',
      ].join('\n'),
    );
    expect(arbol.map((b) => b.t)).toEqual(['titulo', 'parrafo', 'lista', 'lista', 'cita', 'codigo', 'tabla']);
    expect(arbol[1]).toEqual({ t: 'parrafo', hijos: [{ t: 'texto', v: 'línea a línea b' }] });
    expect(arbol[2]).toMatchObject({ ordenada: false, items: [[{ v: 'item uno sigue' }], [{ v: 'item dos' }]] });
    expect(arbol[3]).toMatchObject({ ordenada: true, inicio: 3, items: [[{ v: 'tres sigue' }], [{ v: 'cuatro' }]] });
    expect(arbol[5]).toEqual({ t: 'codigo', v: 'x = 1' });
    expect(arbol[6]).toMatchObject({ t: 'tabla', filas: [[[{ t: 'negrita' }], [{ v: '2' }]]] });
  });

  it('un h1 en el cuerpo, un código sin cerrar o una tabla sin separador rompen', () => {
    expect(() => bloques('# Título')).toThrow(/h1/);
    expect(() => bloques('```\nsin cerrar')).toThrow(/sin cerrar/);
    expect(() => bloques('| a |\n| b |')).toThrow(/separadora/);
  });

  it('una línea que no casa con nada no cuelga el parser', () => {
    expect(bloques('#sin-espacio')).toEqual([{ t: 'parrafo', hijos: [{ t: 'texto', v: '#sin-espacio' }] }]);
  });

  it('un destino que no es interno, mailto ni https no se convierte en enlace', () => {
    const { container } = render(<Markdown arbol={bloques('[x](javascript:alert(1)) [y](http://a.cl)')} />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    const externo = render(<Markdown arbol={bloques('[z](https://www.chilecompra.cl)')} />);
    expect(externo.container.querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

// ── Rutas que existen ───────────────────────────────────────────────────────

const APP = join(__dirname, '..', 'app');

/** Cada `page.tsx` de `app/` como patrón de segmentos, sin grupos `(x)`. */
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
const SLUGS = new Set(GUIAS.map((g) => g.slug));

function existe(href: string): boolean {
  const segmentos = href.split(/[?#]/)[0].split('/').filter(Boolean);
  if (segmentos[0] === 'guias' && segmentos.length === 2) return SLUGS.has(segmentos[1]);
  return PATRONES.some(
    (p) => p.length === segmentos.length && p.every((s, i) => /^\[.+\]$/.test(s) || s === segmentos[i]),
  );
}

describe('las guías', () => {
  it('hay guías y rutas que revisar', () => {
    expect(GUIAS.length).toBeGreaterThanOrEqual(6);
    expect(PATRONES.length).toBeGreaterThanOrEqual(10);
    // La guarda del resolvedor: lo que no existe, no existe.
    expect(existe('/no-existe')).toBe(false);
    expect(existe('/guias/no-existe')).toBe(false);
    expect(existe('/rubros/cualquiera')).toBe(true);
  });

  it('se generan todas en el build y el resto es 404', async () => {
    expect(generateStaticParams()).toEqual(GUIAS.map((g) => ({ slug: g.slug })));
    expect(dynamicParams).toBe(false);
    await expect(PaginaGuia(params('no-existe'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('el índice las enlaza todas con su fecha', () => {
    render(<PaginaGuias />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const g of GUIAS) {
      expect(screen.getByRole('link', { name: new RegExp(g.titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute(
        'href',
        `/guias/${g.slug}`,
      );
    }
  });

  describe.each(GUIAS.map((g) => [g.slug, g] as const))('%s', (slug, guia) => {
    it('enlaces internos a rutas que existen', () => {
      const internos = destinos(guia.cuerpo).filter((d) => d.startsWith('/'));
      for (const d of internos) expect(existe(d), d).toBe(true);
    });

    it('metadatos con título, descripción y canonical', async () => {
      const m = await generateMetadata(params(slug));
      expect(m.title).toBe(guia.titulo);
      expect(m.description).toBe(guia.descripcion);
      expect(m.alternates?.canonical).toBe(`/guias/${slug}`);
    });

    it('se pinta entera y sin marcadores sueltos', async () => {
      const { container } = render(await PaginaGuia(params(slug)));
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByText(/actualizada el/i)).toBeInTheDocument();
      const fuentes = screen.getByRole('region', { name: /fuentes/i });
      expect(within(fuentes).getAllByRole('listitem')).toHaveLength(guia.fuentes.length);

      // Fuera de los bloques de código, nada de Markdown crudo.
      const copia = container.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('pre, code').forEach((n) => n.remove());
      expect(copia.textContent).not.toMatch(/\*\*|\]\(|```|\|---|^#{2,} /m);
    });
  });
});

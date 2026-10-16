/**
 * Lo primero de la portada (spec del rediseño §6.3, principio 1): la pregunta,
 * el buscador como `<form>` GET a /buscar —funciona sin JavaScript—, sus
 * ejemplos y la tira de cifras vivas con su hora.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BuscadorPortada } from '@/components/portada/BuscadorPortada';
import { TiraCifras } from '@/components/portada/TiraCifras';
import { EJEMPLOS_BUSQUEDA, rutaBuscar } from '@/lib/buscar';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { PLACEHOLDER_BUSCADOR, SUBTITULO_PORTADA, tiraDeLaPortada } from '@/lib/portada';

const PREGUNTA = '¿Qué le vendes al Estado?';
const leer = (f: string) => readFileSync(join(__dirname, '..', 'components', 'portada', f), 'utf8');

describe('BuscadorPortada', () => {
  it('la pregunta es el h1 y, a la vez, la etiqueta del campo', () => {
    render(<BuscadorPortada />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREGUNTA);
    expect(screen.getByRole('searchbox', { name: PREGUNTA })).toBeInTheDocument();
  });

  it('el subtítulo dice qué hace la búsqueda, y el campo no repite los ejemplos', () => {
    render(<BuscadorPortada />);
    expect(screen.getByText(SUBTITULO_PORTADA)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: PREGUNTA })).toHaveAttribute('placeholder', PLACEHOLDER_BUSCADOR);
  });

  it('el botón va en el color del dato con su etiqueta encima, no en el de acción', () => {
    render(<BuscadorPortada />);
    const boton = screen.getByRole('button', { name: 'Buscar' });
    expect(boton).toHaveClass('bg-dato', 'text-onDato');
    expect(boton).not.toHaveClass('btn-accent');
  });

  it('el h1 no lleva clase de peso: la regla de los titulares ya lo pone en 800', () => {
    render(<BuscadorPortada />);
    expect(screen.getByRole('heading', { level: 1 }).className).not.toMatch(/(^|\s)font-(normal|medium|semibold|bold|extrabold|black)(\s|$)/);
  });

  it('es un <form> GET a /buscar con el campo q: funciona sin JavaScript', () => {
    render(<BuscadorPortada />);
    const formulario = screen.getByRole('search');
    expect(formulario.tagName).toBe('FORM');
    expect(formulario).toHaveAttribute('action', '/buscar');
    expect(formulario).toHaveAttribute('method', 'get');
    const campo = within(formulario).getByRole('searchbox');
    expect(campo).toHaveAttribute('name', 'q');
    expect(campo).toBeRequired();
    expect(campo).toHaveAttribute('minlength', '3');
    expect(campo).toHaveAttribute('maxlength', '100');
    expect(within(formulario).getByRole('button', { name: 'Buscar' })).toHaveAttribute('type', 'submit');
  });

  it('los ejemplos, en su orden, cada uno a su búsqueda', () => {
    render(<BuscadorPortada />);
    const enlaces = within(screen.getByRole('list', { name: 'Ejemplos de búsqueda' })).getAllByRole('link');
    expect(enlaces.map((a) => a.textContent)).toEqual([...EJEMPLOS_BUSQUEDA]);
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(EJEMPLOS_BUSQUEDA.map(rutaBuscar));
  });

  it.each(['BuscadorPortada.tsx', 'TiraCifras.tsx'])('%s no lleva JavaScript propio', (f) => {
    expect(leer(f)).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('ningún enlace de la portada fuerza el prefetch (cada vista costaría llamadas al backend)', () => {
    // `prefetch` a secas es `true` para Next: sólo se admite `prefetch={false}`.
    const raiz = join(__dirname, '..');
    const fuentes = [
      join(raiz, 'app', 'page.tsx'),
      ...readdirSync(join(raiz, 'components', 'portada')).map((f) => join(raiz, 'components', 'portada', f)),
    ];
    expect(fuentes.length).toBeGreaterThanOrEqual(7);
    for (const f of fuentes) {
      // Sin comentarios: los docstrings explican justamente que no hay prefetch.
      const codigo = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '');
      expect(codigo, f).not.toMatch(/\bprefetch\b(?!\s*=\s*\{\s*false\s*\})/);
    }
  });
});

describe('TiraCifras', () => {
  const tira = tiraDeLaPortada({
    licitaciones_abiertas: 4232,
    compra_agil_abiertas: 2714,
    actualizado_en: '2026-10-14T11:00:00-03:00',
  })!;

  it('dos cifras, cada una al catálogo con el filtro que la cuenta; la hora va en la franja', () => {
    render(<TiraCifras tira={tira} />);
    const lista = screen.getByRole('list', { name: 'Abiertas ahora' });
    expect(within(lista).getByRole('link', { name: '4.232 licitaciones abiertas' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('licitaciones'),
    );
    expect(within(lista).getByRole('link', { name: '2.714 Compras Ágiles abiertas' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('compra_agil'),
    );
    expect(screen.queryByText(/actualizado/i)).toBeNull();
  });

  it('cada cifra, un bloque con su borde en el color del dato', () => {
    render(<TiraCifras tira={tira} />);
    const bloques = within(screen.getByRole('list', { name: 'Abiertas ahora' })).getAllByRole('listitem');
    expect(bloques).toHaveLength(2);
    for (const bloque of bloques) {
      expect(bloque).toHaveClass('border-dato');
      expect(bloque).not.toHaveClass('border-accent');
    }
  });
});

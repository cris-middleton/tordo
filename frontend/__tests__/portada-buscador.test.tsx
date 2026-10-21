/**
 * Lo primero de la portada (spec del rediseño §6.3, principio 1): el titular, el
 * buscador como `<form>` GET a /buscar —funciona sin JavaScript—, sus ejemplos y
 * la frase de lo que se puede postular ahora.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BuscadorPortada } from '@/components/portada/BuscadorPortada';
import { AbiertasAhora } from '@/components/portada/AbiertasAhora';
import { EJEMPLOS_BUSQUEDA, rutaBuscar } from '@/lib/buscar';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import {
  ETIQUETA_BUSCADOR,
  PLACEHOLDER_BUSCADOR,
  SUBTITULO_PORTADA,
  TITULO_PORTADA,
  tiraDeLaPortada,
} from '@/lib/portada';

const leer = (f: string) => readFileSync(join(__dirname, '..', 'components', 'portada', f), 'utf8');

describe('BuscadorPortada', () => {
  it('el h1 dice lo que el sitio responde, sin signos de pregunta, y el campo tiene su propio nombre', () => {
    render(<BuscadorPortada />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(TITULO_PORTADA);
    expect(TITULO_PORTADA).toBe('Cuánto paga el Estado por lo que vendes');
    expect(h1.textContent).not.toMatch(/[¿?]/);
    expect(h1.querySelector('label')).toBeNull();
    expect(screen.getByRole('searchbox', { name: ETIQUETA_BUSCADOR })).toBeInTheDocument();
    expect(ETIQUETA_BUSCADOR).toBe('Producto o servicio que vendes');
  });

  it('el subtítulo dice qué hace la búsqueda, y el campo no repite los ejemplos', () => {
    render(<BuscadorPortada />);
    expect(screen.getByText(SUBTITULO_PORTADA)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: ETIQUETA_BUSCADOR })).toHaveAttribute('placeholder', PLACEHOLDER_BUSCADOR);
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

  it.each(['BuscadorPortada.tsx', 'AbiertasAhora.tsx'])('%s no lleva JavaScript propio', (f) => {
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

describe('AbiertasAhora', () => {
  const tira = tiraDeLaPortada({
    licitaciones_abiertas: 4232,
    compra_agil_abiertas: 2714,
    actualizado_en: '2026-10-14T11:00:00-03:00',
  })!;

  it('una frase, con cada cifra al catálogo con el filtro que la cuenta; la hora va en la franja', () => {
    const { container } = render(<AbiertasAhora tira={tira} />);
    expect(container.textContent).toBe('Ahora puedes postular a 4.232 licitaciones y 2.714 Compras Ágiles.');
    expect(screen.getByRole('link', { name: '4.232 licitaciones' })).toHaveAttribute('href', urlCatalogoAbiertas('licitaciones'));
    expect(screen.getByRole('link', { name: '2.714 Compras Ágiles' })).toHaveAttribute('href', urlCatalogoAbiertas('compra_agil'));
    expect(screen.queryByText(/actualizado/i)).toBeNull();
  });

  it('en singular cuando hay una', () => {
    const una = tiraDeLaPortada({ licitaciones_abiertas: 1, compra_agil_abiertas: 1, actualizado_en: '2026-10-14T11:00:00-03:00' })!;
    const { container } = render(<AbiertasAhora tira={una} />);
    expect(container.textContent).toBe('Ahora puedes postular a 1 licitación y 1 Compra Ágil.');
  });

  it('sin la plantilla de «métrica de héroe»: ni lista de bloques ni filete lateral', () => {
    const { container } = render(<AbiertasAhora tira={tira} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(container.innerHTML).not.toMatch(/border-l-/);
  });
});

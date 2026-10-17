/**
 * `/acerca` (spec del rediseño §6.3 y §6.7): lo que la portada dejó de explicar
 * —qué es, de dónde salen los datos, cómo se financia— y las preguntas
 * frecuentes. Indexable, en el sitemap y enlazada desde el pie.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PaginaAcerca, { metadata } from '@/app/(publico)/acerca/page';
import { PREGUNTAS } from '@/lib/acerca';
import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from '@/lib/compraAgil';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { PAGINAS_FIJAS } from '@/lib/publico';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

afterEach(() => {
  delete process.env.AUTOR_NOMBRE;
  delete process.env.AUTOR_ROL;
  delete process.env.RESPONSABLE_LEGAL;
});

describe('la página /acerca', () => {
  it('un solo h1 y sus cuatro secciones, con ancla', () => {
    const { container } = render(<PaginaAcerca />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Acerca de ${APP_NAME}`);
    for (const id of ['que-es', 'datos', 'financiacion', 'preguntas']) {
      expect(container.querySelector(`section#${id}`), id).not.toBeNull();
    }
  });

  it('todas las preguntas frecuentes, cada una en un <details> cerrado', () => {
    const { container } = render(<PaginaAcerca />);
    const detalles = container.querySelectorAll('#preguntas details');
    expect(PREGUNTAS.length).toBeGreaterThanOrEqual(6);
    expect(detalles).toHaveLength(PREGUNTAS.length);
    for (const d of detalles) expect(d).not.toHaveAttribute('open');
    for (const p of PREGUNTAS) expect(screen.getByText(p.pregunta)).toBeInTheDocument();
  });

  it('el costo sale de lib/costos y enlaza a su desglose', () => {
    render(<PaginaAcerca />);
    expect(
      screen.getByRole('link', { name: `alrededor de ${COSTO_MENSUAL_APROXIMADO} al mes` }),
    ).toHaveAttribute('href', '/apoyar#costos');
  });

  it('enlaza la guía de los datos, lo abierto y el contacto', () => {
    render(<PaginaAcerca />);
    expect(screen.getByRole('link', { name: 'Cómo se procesan' })).toHaveAttribute(
      'href',
      '/guias/de-donde-salen-los-datos',
    );
    expect(screen.getByRole('link', { name: /api, un servidor mcp/i })).toHaveAttribute('href', '/abierto');
    expect(screen.getByRole('link', { name: 'hola@tordo.cl' })).toHaveAttribute('href', 'mailto:hola@tordo.cl');
  });

  it('sin AUTOR_NOMBRE no dice quién lo hace: ni el hueco ni un nombre, ni el rol', () => {
    process.env.AUTOR_ROL = 'ingeniero que construye productos con datos';
    const { container } = render(<PaginaAcerca />);
    expect(container.textContent).not.toMatch(/\[\[|lo hace |ingeniero que construye/i);
  });

  it('con AUTOR_NOMBRE y AUTOR_ROL dice quién lo hace, con su rol', () => {
    process.env.AUTOR_NOMBRE = '  Nombre De Prueba ';
    process.env.AUTOR_ROL = ' ingeniero que construye productos con datos ';
    render(<PaginaAcerca />);
    expect(
      screen.getByText('Lo hace Nombre De Prueba, ingeniero que construye productos con datos, a título personal.'),
    ).toBeInTheDocument();
  });

  it('con AUTOR_NOMBRE y sin AUTOR_ROL, sólo el nombre: no hay rol por defecto', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    const { container } = render(<PaginaAcerca />);
    expect(screen.getByText('Lo hace Nombre De Prueba, a título personal.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/data scientist/i);
  });

  it('firma la autoría, no el responsable legal (spec PORTADA_V7 V5)', () => {
    process.env.RESPONSABLE_LEGAL = 'Otra Persona';
    const { container } = render(<PaginaAcerca />);
    expect(container.textContent).not.toMatch(/Otra Persona|lo hace /i);
  });

  it('es indexable, con canonical y en el sitemap', () => {
    expect(metadata.title).toBe('Acerca');
    expect(metadata.alternates?.canonical).toBe('/acerca');
    expect(metadata.robots).toBeUndefined();
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    expect(`${String(metadata.title)} ${String(metadata.description)}`).not.toMatch(/inteligencia/i);
    expect(PAGINAS_FIJAS).toContain('/acerca');
  });

  it('es un componente de servidor', () => {
    const fuente = readFileSync(join(__dirname, '..', 'app', '(publico)', 'acerca', 'page.tsx'), 'utf8');
    expect(fuente).not.toMatch(/^\s*['"]use client['"]/m);
  });
});

describe('las preguntas frecuentes (lib/acerca.ts)', () => {
  it('la de «lo mejor de hoy» dice lo que ordena, sin «cotizaciones»', () => {
    const p = PREGUNTAS.find((q) => q.enlace?.href === '/guias/lo-mejor-de-hoy-en-compra-agil');
    expect(p).toBeDefined();
    expect(p!.pregunta).toContain(TITULO_DESTACADAS);
    expect(p!.respuesta).toBe(DESCRIPCION_DESTACADAS);
    expect(`${p!.pregunta} ${p!.respuesta}`).not.toMatch(/cotiz|adjudica lo que publica/i);
  });

  it('ninguna promete lo que se fue con las cuentas', () => {
    const texto = PREGUNTAS.map((p) => `${p.pregunta} ${p.respuesta}`).join(' ');
    expect(texto).not.toMatch(
      /alerta|aviso por correo|informe semanal|encaje|prueba gratis|trial|inicia sesión|tu posición|suscrip|plazo de pago|paga a \d/i,
    );
  });

  const CONTENIDO = join(__dirname, '..', 'content', 'explicativos');
  const guias = PREGUNTAS.flatMap((p) => (p.enlace?.href.startsWith('/guias/') ? [p.enlace.href] : []));

  it('enlazan a guías (guarda: sin enlaces no habría nada que revisar)', () => {
    expect(guias.length).toBeGreaterThanOrEqual(4);
  });

  it.each(guias)('%s existe', (href) => {
    expect(existsSync(join(CONTENIDO, `${href.slice('/guias/'.length)}.mdx`))).toBe(true);
  });
});

/**
 * `/acerca` (spec del rediseño §6.3 y §6.7): lo que la portada dejó de explicar
 * —qué es, de dónde salen los datos, cómo se financia— y las preguntas
 * frecuentes. Indexable, en el sitemap y enlazada desde el pie.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
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
  delete process.env.AUTOR_URL;
  delete process.env.RESPONSABLE_LEGAL;
  delete process.env.REPOSITORIO_URL;
});

describe('la página /acerca', () => {
  it('un solo h1 y sus cuatro secciones, con ancla', () => {
    const { container } = render(<PaginaAcerca />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Qué es ${APP_NAME}`);
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
    expect(screen.getByRole('link', { name: 'la guía de los datos' })).toHaveAttribute(
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
    const { container } = render(<PaginaAcerca />);
    expect(container.querySelector('#quien-lo-hace p')).toHaveTextContent(
      'Lo hace Nombre De Prueba, ingeniero que construye productos con datos, a título personal.',
    );
  });

  it('con AUTOR_NOMBRE y sin AUTOR_ROL, sólo el nombre: no hay rol por defecto', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    const { container } = render(<PaginaAcerca />);
    expect(container.querySelector('#quien-lo-hace p')).toHaveTextContent(/^Lo hace Nombre De Prueba, a título personal\.$/);
    expect(container.textContent).not.toMatch(/data scientist/i);
  });

  it('«Quién lo hace» es su propia sección, sólo con AUTOR_NOMBRE, y enlaza a las notas', () => {
    const sin = render(<PaginaAcerca />);
    expect(sin.container.querySelector('section#quien-lo-hace')).toBeNull();
    sin.unmount();

    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    const { container } = render(<PaginaAcerca />);
    const seccion = container.querySelector('section#quien-lo-hace') as HTMLElement;
    expect(seccion).not.toBeNull();
    expect(container.querySelector('section#financiacion')?.textContent).not.toMatch(/lo hace /i);
    expect(within(seccion).getByRole('link', { name: 'notas de datos' })).toHaveAttribute('href', '/notas');
    // Sin REPOSITORIO_URL no se enlaza el código.
    expect(within(seccion).queryByRole('link', { name: /código/i })).toBeNull();
  });

  it('con AUTOR_URL https el nombre enlaza ahí; sin ella, o con http, es texto', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    process.env.AUTOR_URL = 'https://github.com/prueba';
    const con = render(<PaginaAcerca />);
    const seccion = con.container.querySelector('section#quien-lo-hace') as HTMLElement;
    expect(within(seccion).getByRole('link', { name: 'Nombre De Prueba' })).toHaveAttribute(
      'href',
      'https://github.com/prueba',
    );
    // Las notas, como su trabajo, en una frase que no se alaba.
    expect(seccion.textContent).toMatch(/Su trabajo se lee en las notas de datos: cada una cuenta un error/);
    con.unmount();

    process.env.AUTOR_URL = 'http://github.com/prueba';
    const sin = render(<PaginaAcerca />).container.querySelector('section#quien-lo-hace') as HTMLElement;
    expect(within(sin).queryByRole('link', { name: 'Nombre De Prueba' })).toBeNull();
  });

  it('el texto corrido va a 16 px y en text, no chico y gris', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    const { container } = render(<PaginaAcerca />);
    for (const id of ['que-es', 'datos', 'financiacion', 'quien-lo-hace']) {
      const p = container.querySelector(`section#${id} p`) as HTMLElement;
      const caja = p.closest('[class*="text-"]') as HTMLElement;
      expect(caja.className, id).toMatch(/\btext-base\b/);
      expect(caja.className, id).toMatch(/\btext-text\b/);
    }
  });

  it('con REPOSITORIO_URL, «Quién lo hace» enlaza al código', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    const { container } = render(<PaginaAcerca />);
    const seccion = container.querySelector('section#quien-lo-hace') as HTMLElement;
    expect(within(seccion).getByRole('link', { name: 'código del sitio' })).toHaveAttribute(
      'href',
      'https://github.com/x/tordo',
    );
  });

  it('las preguntas van sin caja: filetes, summary de 44 px y chevron en text-muted', () => {
    const { container } = render(<PaginaAcerca />);
    for (const d of container.querySelectorAll('#preguntas details')) {
      expect(d.className).not.toMatch(/\b(border|rounded|shadow)/);
      const summary = d.querySelector('summary') as HTMLElement;
      expect(summary.className).toMatch(/\bmin-h-11\b/);
      expect(summary.querySelector('svg')?.getAttribute('class')).toMatch(/text-muted/);
    }
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

/**
 * El panel de lecturas de la portada (spec IDENTIDAD_Y_PORTADA §3.2, §3.4, D4 y D9):
 *   1. es la superficie oscura del sitio: `dark` sobre `bg-brand-navy`;
 *   2. cada lectura: conclusión (h3), pie, enlace y gráfico en HTML/CSS;
 *   3. las barras van con `aria-hidden` y los valores como texto;
 *   4. `dato` sólo en lo que la conclusión nombra, el resto `dato-tenue`;
 *   5. el precio sólo rotula p25 y p75 debajo y «mediana $X» encima; con la cola
 *      larga a un lado, p25 y p75 van en un solo rótulo;
 *   6. una lectura sin dato no se pinta, y sin ninguna no hay panel.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PanelLecturas } from '@/components/portada/PanelLecturas';
import type { LecturaCierres, LecturaPrecio, LecturaSectores } from '@/lib/lecturasPortada';

const SECTORES: LecturaSectores = {
  conclusion: 'Salud y municipios compran casi lo mismo',
  pie: 'Órdenes de compra, nov 2023 – oct 2026 (36 meses)',
  enlace: { texto: 'Ver mercados', href: '/mercado' },
  barras: [
    { nombre: 'Salud', monto: '$3 billones', ancho: 100, destacada: true },
    { nombre: 'Municipalidades', monto: '$2,9 billones', ancho: 98.9, destacada: true },
    { nombre: 'Gob. central', monto: '$2 billones', ancho: 67, destacada: false },
  ],
};

const PRECIO: LecturaPrecio = {
  conclusion: 'Guantes nitrilo: la mitad se pagó entre $4.200 y $6.900',
  pie: 'Precio por caja, 184 compras, oct 2025 – sep 2026 (12 meses)',
  enlace: { texto: 'Ver el producto', href: '/productos/guantes-nitrilo' },
  p10: { valor: '$2.100', posicion: 0 },
  p25: { valor: '$4.200', posicion: 21.6 },
  p50: { valor: '$5.390', posicion: 33.9 },
  p75: { valor: '$6.900', posicion: 49.5 },
  p90: { valor: '$11.800', posicion: 100 },
};

const CIERRES: LecturaCierres = {
  conclusion: '4 de cada 10 Compras Ágiles abiertas cierran hoy o mañana',
  pie: '2.714 abiertas, por día de cierre',
  enlace: {
    texto: 'Ver las que cierran primero',
    href: '/licitaciones?tipo_convocatoria=compra_agil&abiertas=1&sort_by=fecha_cierre&sort_order=asc',
  },
  columnas: [
    { nombre: 'Hoy', valor: '312', alto: 28, destacada: true },
    { nombre: 'Mañana', valor: '740', alto: 67, destacada: true },
    { nombre: 'En 2 o 3 días', valor: '1.105', alto: 100, destacada: false },
    { nombre: 'Después', valor: '557', alto: 50, destacada: false },
  ],
};

const TODAS = { sectores: SECTORES, precio: PRECIO, cierres: CIERRES };
const NOMBRE = 'Lo que dicen los datos';

const soloPrecio = (precio: LecturaPrecio) => render(<PanelLecturas sectores={null} cierres={null} precio={precio} />);

describe('PanelLecturas', () => {
  it('es la superficie oscura: dark sobre bg-brand-navy, con nombre, divisores en dato-tenue', () => {
    render(<PanelLecturas {...TODAS} />);
    const panel = screen.getByRole('region', { name: NOMBRE });
    expect(panel).toHaveClass('dark', 'bg-brand-navy');
    expect(panel.querySelector('.divide-dato-tenue')).not.toBeNull();
  });

  it('tres lecturas: conclusión (h3, en text y negrita, sin font-display), pie y enlace', () => {
    render(<PanelLecturas {...TODAS} />);
    const titulos = screen.getAllByRole('heading', { level: 3 });
    expect(titulos.map((h) => h.textContent)).toEqual([SECTORES.conclusion, PRECIO.conclusion, CIERRES.conclusion]);
    for (const h of titulos) {
      expect(h).toHaveClass('text-text', 'font-bold');
      expect(h).not.toHaveClass('font-display');
    }
    for (const l of [SECTORES, PRECIO, CIERRES]) {
      expect(screen.getByText(l.pie)).toBeInTheDocument();
      const enlace = screen.getByRole('link', { name: l.enlace.texto });
      expect(enlace).toHaveAttribute('href', l.enlace.href);
      // .enlace (primary, medido sobre brand-navy) y un foco que se ve sobre el navy.
      expect(enlace).toHaveClass('enlace', 'focus-visible:ring-text', 'focus-visible:ring-offset-brand-navy');
      // `.enlace` trae `hover:text-accent`, y en el panel no va accent (spec §5): la
      // utilidad gana a la capa de componentes.
      expect(enlace).toHaveClass('hover:text-text');
    }
  });

  it('las barras son decorado (aria-hidden); los valores, texto que se lee', () => {
    const { container } = render(<PanelLecturas {...TODAS} />);
    const conEstilo = [...container.querySelectorAll<HTMLElement>('[style]')];
    expect(conEstilo.length).toBeGreaterThan(5);
    for (const el of conEstilo) {
      // Todo lo posicionado es una barra oculta… o un rótulo de precio, que sí se lee.
      const decorado = el.closest('[aria-hidden="true"]') ?? el.closest('ul[aria-label="Precios pagados"]');
      expect(decorado, el.outerHTML).not.toBeNull();
    }
    for (const valor of ['$3 billones', '$2,9 billones', '$4.200', '$5.390', '$6.900', '312', '1.105']) {
      expect(screen.getByText(valor)).toBeInTheDocument();
    }
    // Un lector de pantalla oye qué es cada precio, no una lista de montos sueltos.
    const precios = screen.getByRole('list', { name: 'Precios pagados' });
    expect(within(precios).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Percentil 25: $4.200',
      'mediana $5.390',
      'Percentil 75: $6.900',
    ]);
  });

  it('p10 y p90 marcan los extremos del riel, sin rótulo (§3.4)', () => {
    soloPrecio(PRECIO);
    expect(screen.queryByText('$2.100')).toBeNull();
    expect(screen.queryByText('$11.800')).toBeNull();
  });

  it('«mediana $X» va encima de la marca y los cuartiles debajo, acotados al riel por su ancho', () => {
    soloPrecio(PRECIO);
    const precios = screen.getByRole('list', { name: 'Precios pagados' });
    const [p25, mediana, p75] = within(precios).getAllByRole('listitem');
    expect(mediana).toHaveClass('top-0');
    expect(p25).toHaveClass('bottom-0');
    expect(p75).toHaveClass('bottom-0');
    // El ch del rótulo es el de su peso más grueso: la negrita va en el <li>.
    expect(mediana).toHaveClass('font-bold');
    for (const li of [p25, mediana, p75]) expect(li).toHaveClass('left-[var(--izquierda)]', '-translate-x-1/2');
    expect(mediana.style.getPropertyValue('--izquierda')).toBe('clamp(7ch, 33.9%, calc(100% - 7ch))');
    expect(p25.style.getPropertyValue('--izquierda')).toBe('clamp(3ch, 21.6%, calc(100% - 3ch))');
    expect(p75.style.getPropertyValue('--izquierda')).toBe('clamp(3ch, 49.5%, calc(100% - 3ch))');
  });

  it.each([
    [
      'cola larga a la derecha',
      { ...PRECIO, p25: { valor: '$4.200', posicion: 1.2 }, p50: { valor: '$4.900', posicion: 3 }, p75: { valor: '$6.900', posicion: 8.4 } },
      4.8,
    ],
    [
      'cola larga a la izquierda',
      { ...PRECIO, p25: { valor: '$4.200', posicion: 92 }, p50: { valor: '$4.900', posicion: 95 }, p75: { valor: '$6.900', posicion: 99 } },
      95.5,
    ],
  ])('%s: p25 y p75 en un solo rótulo «$p25 – $p75», centrado entre los dos', (_, precio, centro) => {
    soloPrecio(precio);
    const precios = screen.getByRole('list', { name: 'Precios pagados' });
    const items = within(precios).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const [banda, mediana] = items;
    // Lo que se ve, sin el texto para lectores de pantalla.
    const visible = banda.cloneNode(true) as HTMLElement;
    visible.querySelectorAll('.sr-only').forEach((el) => el.remove());
    expect(visible.textContent).toBe('$4.200 – $6.900');
    // Un lector de pantalla sigue oyendo qué es cada cifra.
    expect(banda.textContent).toBe('Percentil 25: $4.200 – Percentil 75: $6.900');
    // «$4.200 – $6.900»: 15 caracteres.
    expect(banda.style.getPropertyValue('--izquierda')).toBe(`clamp(7.5ch, ${centro}%, calc(100% - 7.5ch))`);
    expect(mediana).toHaveTextContent('mediana $4.900');
  });

  it('cierres: un lector de pantalla oye «Hoy: 312», el nombre antes que el valor', () => {
    render(<PanelLecturas sectores={null} precio={null} cierres={CIERRES} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    items.forEach((li, i) => {
      const { nombre, valor } = CIERRES.columnas[i];
      // Lo primero que se lee es «Hoy: 312»; lo visible, que va valor arriba y nombre
      // abajo, queda fuera del árbol de accesibilidad.
      expect(li.firstElementChild).toHaveClass('sr-only');
      expect(li.firstElementChild).toHaveTextContent(`${nombre}: ${valor}`);
      for (const visible of [...li.children].slice(1)) expect(visible).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('dato sólo en lo que la conclusión nombra; el resto, dato-tenue', () => {
    const { container } = render(<PanelLecturas {...TODAS} />);
    // Sectores: 2 pintadas + 1 apagada. Precio: banda pintada + riel apagado. Cierres: 2 + 2.
    expect(container.querySelectorAll('.bg-dato')).toHaveLength(5);
    expect(container.querySelectorAll('.bg-dato-tenue')).toHaveLength(4);
  });

  it.each([
    ['sólo sectores', { sectores: SECTORES, precio: null, cierres: null }, SECTORES.conclusion],
    ['sólo precio', { sectores: null, precio: PRECIO, cierres: null }, PRECIO.conclusion],
    ['sólo cierres', { sectores: null, precio: null, cierres: CIERRES }, CIERRES.conclusion],
  ])('con %s, sólo esa lectura', (_, lecturas, conclusion) => {
    render(<PanelLecturas {...lecturas} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([conclusion]);
  });

  it('sin p10, p90 ni mediana, la banda se pinta igual', () => {
    const { container } = soloPrecio({ ...PRECIO, p10: null, p50: null, p90: null });
    expect(screen.queryByText(/mediana/)).toBeNull();
    expect(screen.getByText('$4.200')).toBeInTheDocument();
    expect(screen.getByText('$6.900')).toBeInTheDocument();
    expect(container.querySelectorAll('.bg-dato')).toHaveLength(1);
  });

  it('sin ninguna lectura no pinta nada', () => {
    const { container } = render(<PanelLecturas sectores={null} precio={null} cierres={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sin JS propio, sin colores crudos y sólo tintas con par sobre brand-navy', () => {
    const fuente = readFileSync(join(__dirname, '..', 'components', 'portada', 'PanelLecturas.tsx'), 'utf8');
    expect(fuente).not.toMatch(/^\s*['"]use client['"]/m);
    // `accent` también tiene par medido, pero en el panel no va (spec §5): ni escrito
    // aquí ni heredado. Los enlaces son `.enlace` (primary), cuyo `hover:text-accent`
    // se pisa con `hover:text-text` (lo afirma el test de los enlaces).
    expect(fuente).not.toMatch(/#[0-9a-fA-F]{3,6}\b|text-white|bg-white|text-subtle|text-primary\b|text-accent|font-display/);
    expect(fuente).not.toMatch(/prefetch/);
  });
});

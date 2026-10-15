/**
 * El pie único (spec del rediseño §6.2): la cita de ChileCompra una sola vez,
 * los legales, el costo, las licencias, el contacto y el selector de tema. El
 * mapa del sitio sale de la misma lista que la cabecera.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PieSitio } from '@/components/cascara/PieSitio';

afterEach(() => {
  delete process.env.REPOSITORIO_URL;
});

const mapa = () =>
  within(screen.getByRole('navigation', { name: 'Mapa del sitio' }))
    .getAllByRole('link')
    .map((a) => a.textContent);

describe('el pie único', () => {
  it('es el contentinfo de la página', () => {
    render(<PieSitio />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('el mapa del sitio: secciones, guardados y lo abierto', () => {
    render(<PieSitio />);
    expect(mapa()).toEqual(['Hoy', 'Licitaciones', 'Precios', 'Mercados', 'Guías', 'Guardados', 'API y MCP']);
  });

  it('con REPOSITORIO_URL, también «Código»', () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    render(<PieSitio />);
    expect(mapa()).toContain('Código');
    expect(screen.getByRole('link', { name: 'Código' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('la cita de la fuente una sola vez, los legales y el costo', () => {
    render(<PieSitio />);
    expect(screen.getAllByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: /documentos legales/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cuánto cuesta' })).toHaveAttribute('href', '/apoyar#costos');
  });

  it('licencias, contacto y que no es un sitio del gobierno', () => {
    render(<PieSitio />);
    expect(screen.getByRole('link', { name: 'Licencias' })).toHaveAttribute('href', '/abierto#licencias');
    expect(screen.getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', 'mailto:hola@tordo.cl');
    expect(screen.getByText(/No estamos afiliados al gobierno de Chile/)).toBeInTheDocument();
  });

  it('el selector de tema vive aquí (§5.2: «el selector baja al pie»)', () => {
    render(<PieSitio />);
    expect(screen.getByRole('radiogroup', { name: 'Apariencia' })).toBeInTheDocument();
  });

  it('«Acerca», junto a las licencias y el contacto: no es una sección del mapa', () => {
    render(<PieSitio />);
    expect(screen.getByRole('link', { name: 'Acerca' })).toHaveAttribute('href', '/acerca');
    expect(mapa()).not.toContain('Acerca');
  });
});

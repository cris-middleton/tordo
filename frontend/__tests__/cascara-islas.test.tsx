/**
 * Las islas cliente de la cabecera (spec del rediseño §6.1): la marca de sección
 * activa, el contador de guardados y el marco que cierra el menú móvil. Todo lo
 * demás de la cabecera es servidor.
 */
import type { MouseEvent } from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AlmacenDePrueba, instalarAlmacenDePrueba } from './ayudas/almacenDePrueba';
import { Cabecera } from '@/components/cascara/Cabecera';
import { EnlaceGuardados, contarGuardados } from '@/components/cascara/EnlaceGuardados';
import { EnlaceSeccion } from '@/components/cascara/EnlaceSeccion';
import { CLAVE_BUSQUEDAS } from '@/hooks/useBusquedasGuardadas';
import { STORAGE_KEY } from '@/hooks/useDashboardCollections';

const navegacion = vi.hoisted(() => ({ ruta: '/licitaciones' }));
vi.mock('next/navigation', () => ({ usePathname: () => navegacion.ruta }));

// En jsdom no hay router de Next: el enlace ejecuta el onClick del componente y
// se queda en la página. `createElement` y no JSX: la fábrica se iza por encima
// de los imports del fichero.
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ onClick, ...props }: { onClick?: (e: MouseEvent<HTMLAnchorElement>) => void; [k: string]: unknown }) =>
      createElement('a', {
        ...props,
        onClick: (e: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(e);
          e.preventDefault();
        },
      }),
  };
});

const licitacion = (id: number) => ({
  id,
  codigo_externo: `E2E-${id}`,
  nombre: `Licitación ${id}`,
  storedAt: '2026-10-14T12:00:00Z',
});

// El `localStorage` de jsdom no es fiable con Node >= 22 (le falta `clear`): uno en memoria.
let almacen: AlmacenDePrueba;
beforeEach(() => {
  almacen = instalarAlmacenDePrueba();
});
afterEach(() => {
  vi.restoreAllMocks();
  navegacion.ruta = '/licitaciones';
});

describe('EnlaceSeccion', () => {
  it('marca la sección activa con aria-current, también en sus subpáginas', () => {
    navegacion.ruta = '/licitaciones/E2E-1001-LR24';
    render(<EnlaceSeccion enlace={{ nombre: 'Licitaciones', href: '/licitaciones' }} variante="barra" />);
    expect(screen.getByRole('link', { name: 'Licitaciones' })).toHaveAttribute('aria-current', 'page');
  });

  it('fuera de su sección no se marca', () => {
    navegacion.ruta = '/productos';
    render(<EnlaceSeccion enlace={{ nombre: 'Licitaciones', href: '/licitaciones' }} variante="barra" />);
    expect(screen.getByRole('link', { name: 'Licitaciones' })).not.toHaveAttribute('aria-current');
  });

  it('un enlace externo va con <a>, rel y sin marca', () => {
    render(
      <EnlaceSeccion
        enlace={{ nombre: 'Código', href: 'https://github.com/x/tordo', externo: true }}
        variante="barra"
      />,
    );
    const a = screen.getByRole('link', { name: 'Código' });
    expect(a).toHaveAttribute('href', 'https://github.com/x/tordo');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a).not.toHaveAttribute('aria-current');
  });
});

describe('MarcoCabecera: cualquier enlace de la cabecera cierra el menú móvil', () => {
  // La cáscara no se desmonta al navegar: un menú abierto seguiría abierto encima de la página nueva.
  function abrirMenu() {
    const { container } = render(<Cabecera />);
    const menu = container.querySelector('details') as HTMLDetailsElement;
    menu.open = true;
    return menu;
  }

  it.each([
    ['la marca', () => screen.getByRole('link', { name: /, inicio$/ })],
    ['el marcador de guardados', () => screen.getByRole('link', { name: /^guardados en este navegador/i })],
    ['«Apoyar»', () => screen.getByRole('link', { name: 'Apoyar' })],
    ['un enlace del menú', () =>
      within(screen.getByRole('navigation', { name: 'Menú de secciones', hidden: true })).getByRole('link', {
        name: 'Licitaciones',
        hidden: true,
      })],
  ])('pulsar %s lo cierra', (_, enlace) => {
    const menu = abrirMenu();
    expect(menu.open).toBe(true);
    fireEvent.click(enlace());
    expect(menu.open).toBe(false);
  });

  it('un clic que no cae en un enlace no lo cierra', () => {
    const menu = abrirMenu();
    fireEvent.click(screen.getByRole('banner'));
    expect(menu.open).toBe(true);
  });
});

describe('contarGuardados', () => {
  it('licitaciones distintas entre guardadas y postuladas, más las búsquedas', () => {
    const colecciones = {
      tenders: { saved: [licitacion(1), licitacion(2)], applied: [licitacion(2), licitacion(3)] },
    };
    const busquedas = [{ consulta: 'search=resma', guardadaEn: '2026-10-14T12:00:00Z' }];
    expect(contarGuardados(colecciones, busquedas)).toBe(4);
    expect(contarGuardados({ tenders: { saved: [], applied: [] } }, [])).toBe(0);
  });
});

describe('EnlaceGuardados', () => {
  it('con cosas guardadas: el número a la vista y en el nombre accesible', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tenders: { saved: [licitacion(1), licitacion(2)], applied: [licitacion(2)] } }),
    );
    window.localStorage.setItem(
      CLAVE_BUSQUEDAS,
      JSON.stringify([{ consulta: 'search=resma', guardadaEn: '2026-10-14T12:00:00Z' }]),
    );
    render(<EnlaceGuardados />);
    const enlace = screen.getByRole('link', { name: 'Guardados en este navegador: 3' });
    expect(enlace).toHaveAttribute('href', '/guardados');
    expect(enlace).toHaveTextContent('3');
  });

  it('sin nada guardado: el ícono sin número, y dice que no hay cuenta', () => {
    render(<EnlaceGuardados />);
    const enlace = screen.getByRole('link', { name: 'Guardados en este navegador' });
    expect(enlace.textContent).toBe('');
  });

  it('en /guardados se marca como página actual', () => {
    navegacion.ruta = '/guardados';
    render(<EnlaceGuardados />);
    expect(screen.getByRole('link', { name: /^guardados en este navegador/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('en el servidor (y al hidratar) no emite número aunque haya algo guardado: sin desajuste', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tenders: { saved: [licitacion(1)], applied: [] } }),
    );
    const html = renderToString(<EnlaceGuardados />);
    expect(html).toContain('Guardados en este navegador');
    // Ni número visible ni en el nombre accesible (los dígitos de las clases y del <svg> no cuentan).
    expect(html).not.toMatch(/navegador: \d|>\s*\d+\s*</);
    expect(html).not.toContain('cifra');
  });

  // EL ÚLTIMO del fichero a propósito: tras un fallo, `lib/almacenLocal.ts` sigue
  // en memoria el resto de la vida del módulo (es lo correcto en el navegador).
  it('si el navegador bloquea localStorage, se pinta sin número y no revienta', () => {
    const getItem = vi.spyOn(almacen, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    render(<EnlaceGuardados />);
    expect(getItem).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Guardados en este navegador' })).toBeInTheDocument();
  });
});

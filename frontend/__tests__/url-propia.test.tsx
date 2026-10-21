/**
 * Una URL que llega de fuera vuelve a montar la pantalla; la que escribe la
 * propia pantalla, no. Next 16 no desmonta la página cuando sólo cambia la
 * consulta: pulsar «Licitaciones» en la cabecera con un filtro puesto dejaba la
 * URL limpia y el filtro en pantalla.
 */
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useClaveDeUrlExterna } from '@/hooks/useClaveDeUrlExterna';
import { escribirUrlPropia, esUrlPropia, siguienteVista } from '@/lib/urlPropia';

let consulta = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(consulta),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('siguienteVista', () => {
  const vista = { consulta: 'search=mesa', clave: 3 };

  it('la misma consulta: la misma vista', () => {
    expect(siguienteVista(vista, 'search=mesa', false)).toBe(vista);
  });

  it('una consulta propia no cambia la clave', () => {
    expect(siguienteVista(vista, 'search=silla', true)).toEqual({ consulta: 'search=silla', clave: 3 });
  });

  it('una de fuera, sí, también si vuelve a una que ya se vio', () => {
    expect(siguienteVista(vista, '', false)).toEqual({ consulta: '', clave: 4 });
  });
});

describe('escribirUrlPropia', () => {
  it('anota la consulta y reemplaza la URL sin llenar el historial', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    escribirUrlPropia('prueba', 'search=mesa');
    expect(replaceState).toHaveBeenLastCalledWith({}, '', '?search=mesa');
    expect(esUrlPropia('prueba', 'search=mesa')).toBe(true);
    expect(esUrlPropia('prueba', '')).toBe(false);
    escribirUrlPropia('prueba', '', '/productos');
    expect(replaceState).toHaveBeenLastCalledWith({}, '', '/productos');
  });
});

function Contenido() {
  // El estado se inicia con la URL, como el catálogo: sólo un remontaje lo relee.
  const [inicial] = useState(consulta);
  return <p>{inicial || 'vacía'}</p>;
}

function Pantalla() {
  return <Contenido key={useClaveDeUrlExterna('pantalla')} />;
}

describe('useClaveDeUrlExterna', () => {
  it('remonta con la URL de fuera y no con la propia', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    consulta = 'search=mesa';
    const { rerender } = render(<Pantalla />);
    expect(screen.getByText('search=mesa')).toBeInTheDocument();

    // La pantalla reescribe su URL: no se remonta, el estado sigue.
    act(() => escribirUrlPropia('pantalla', 'search=mesa&page=2'));
    consulta = 'search=mesa&page=2';
    rerender(<Pantalla />);
    expect(screen.getByText('search=mesa')).toBeInTheDocument();

    // La cabecera lleva a la URL limpia: se remonta y lee la URL nueva.
    consulta = '';
    rerender(<Pantalla />);
    expect(screen.getByText('vacía')).toBeInTheDocument();
  });
});

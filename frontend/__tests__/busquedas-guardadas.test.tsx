/**
 * Búsquedas guardadas: abrir, borrar y copiar la URL de su RSS.
 *
 * La URL del feed tiene que ser absoluta y llevar los mismos filtros que la del
 * catálogo: es lo que el visitante pega en un lector, y no hay otra forma de
 * enterarse de que se rompió.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BusquedasGuardadas from '@/components/guardados/BusquedasGuardadas';
import { useBusquedasGuardadas } from '@/hooks/useBusquedasGuardadas';
import { escribirFiltros, leerFiltros } from '@/lib/filtrosCatalogo';

import { instalarAlmacenDePrueba } from './ayudas/almacenDePrueba';

const CLAVE = 'tordo_busquedas_v1';

beforeEach(() => {
  const almacen = instalarAlmacenDePrueba();
  almacen.setItem(
    CLAVE,
    JSON.stringify([{ consulta: 'search=zafiro&region=Regi%C3%B3n+del+Biob%C3%ADo', guardadaEn: 'x' }]),
  );
  // Que el almacén (de módulo) relea el valor nuevo.
  window.dispatchEvent(new StorageEvent('storage', { key: CLAVE }));
});

describe('búsquedas guardadas', () => {
  it('se abren en el catálogo con sus filtros', () => {
    render(<BusquedasGuardadas />);
    const enlace = screen.getByRole('link', { name: /zafiro/ });
    expect(enlace).toHaveAttribute(
      'href',
      '/licitaciones?search=zafiro&region=Regi%C3%B3n+del+Biob%C3%ADo',
    );
    expect(enlace).toHaveTextContent('«zafiro», Biobío');
  });

  it('copian la URL absoluta de su RSS', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<BusquedasGuardadas />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar url de rss/i }));
    });
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/rss/licitaciones?search=zafiro&region=Regi%C3%B3n+del+Biob%C3%ADo`,
    );
    await waitFor(() => expect(screen.getByText('URL copiada')).toBeInTheDocument());
  });

  it('se borran', () => {
    render(<BusquedasGuardadas />);
    fireEvent.click(screen.getByRole('button', { name: /borrar la búsqueda/i }));
    expect(screen.getByText(/todavía no guardas ninguna búsqueda/i)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CLAVE) ?? 'null')).toEqual([]);
  });
});

describe('búsquedas guardadas antes de normalizar los mecanismos', () => {
  const LEGADA = 'tipo_convocatoria=trato_directo%2Clicitacion&abiertas=true';
  const GEMELA = 'tipo_convocatoria=licitacion%2Ctrato_directo&abiertas=1';

  beforeEach(() => {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify([
        { consulta: LEGADA, guardadaEn: 'nueva' },
        { consulta: GEMELA, guardadaEn: 'vieja' },
      ]),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: CLAVE }));
  });

  // Lo que hace la página: leer la URL y volver a escribirla.
  const claveDeLaPagina = escribirFiltros(
    leerFiltros(new URLSearchParams('tipo_convocatoria=trato_directo,licitacion&abiertas=1')),
  ).toString();

  it('se reconocen como guardadas y las gemelas se funden en una', () => {
    const { result } = renderHook(() => useBusquedasGuardadas());
    expect(result.current.busquedas).toHaveLength(1);
    expect(result.current.busquedas[0].guardadaEn).toBe('nueva');
    expect(result.current.estaGuardada(claveDeLaPagina)).toBe(true);
    expect(result.current.estaGuardada(LEGADA)).toBe(true);
  });

  it('guardarla otra vez no añade una gemela', () => {
    const { result } = renderHook(() => useBusquedasGuardadas());
    act(() => result.current.guardar(claveDeLaPagina));
    expect(result.current.busquedas).toHaveLength(1);
  });

  it('borrarla, con cualquiera de sus formas, la quita', () => {
    const { result } = renderHook(() => useBusquedasGuardadas());
    act(() => result.current.borrar(claveDeLaPagina));
    expect(result.current.busquedas).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem(CLAVE) ?? 'null')).toEqual([]);
  });
});

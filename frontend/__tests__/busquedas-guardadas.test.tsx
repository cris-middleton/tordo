/**
 * Búsquedas guardadas: abrir, borrar y copiar la URL de su RSS.
 *
 * La URL del feed tiene que ser absoluta y llevar los mismos filtros que la del
 * catálogo: es lo que el visitante pega en un lector, y no hay otra forma de
 * enterarse de que se rompió.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BusquedasGuardadas from '@/components/guardados/BusquedasGuardadas';

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
    expect(enlace).toHaveTextContent('«zafiro» · Biobío');
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

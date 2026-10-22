/**
 * `useSugerencia` (`lib/queries.ts`): «¿Quisiste decir…?» en las búsquedas del
 * navegador. Sólo se pide cuando la pantalla ya sabe que no hubo resultados; si
 * la API falla —o todavía no tiene `/publico/sugerencia`—, no hay sugerencia.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api';
import { useSugerencia } from '@/lib/queries';

function envoltorio() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Envoltorio({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  }
  return Envoltorio;
}

afterEach(() => vi.restoreAllMocks());

describe('useSugerencia', () => {
  it('devuelve la búsqueda corregida', async () => {
    vi.spyOn(apiClient, 'getSugerencia').mockResolvedValue('computador');
    const { result } = renderHook(() => useSugerencia('computdor', true), { wrapper: envoltorio() });
    await waitFor(() => expect(result.current).toBe('computador'));
  });

  it('sin habilitar no pide nada', () => {
    const pedir = vi.spyOn(apiClient, 'getSugerencia').mockResolvedValue('computador');
    const { result } = renderHook(() => useSugerencia('computdor', false), { wrapper: envoltorio() });
    expect(result.current).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });

  it('nunca propone lo mismo que se buscó', async () => {
    const pedir = vi.spyOn(apiClient, 'getSugerencia').mockResolvedValue('Silla');
    const { result } = renderHook(() => useSugerencia('silla', true), { wrapper: envoltorio() });
    await waitFor(() => expect(pedir).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('con la API caída o sin la ruta, no hay sugerencia', async () => {
    const pedir = vi.spyOn(apiClient, 'getSugerencia').mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useSugerencia('computdor', true), { wrapper: envoltorio() });
    await waitFor(() => expect(pedir).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});

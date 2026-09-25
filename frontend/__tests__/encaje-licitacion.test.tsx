/**
 * El encaje de una licitación sólo se pide cuando el plan lo incluye.
 *
 * La llamada iba a una ruta que no existe y el 404 se lo tragaba un `.catch`,
 * así que el widget no salió nunca. Al arreglar la ruta aparece el otro lado:
 * es capacidad Pro, el backend responde 402 a los demás y el interceptor
 * convierte cada 402 en el aviso de mejora — un usuario Free lo recibiría al
 * abrir CUALQUIER ficha, sin haber pedido nada. Por eso la consulta depende del
 * plan, y la página enseña el candado en su lugar.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api';
import { useEncajeLicitacion } from '@/lib/queries';

function envoltorio() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Envoltorio({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  };
}

describe('useEncajeLicitacion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sin el plan que lo incluye, no pide nada', async () => {
    const pedir = vi.spyOn(apiClient, 'getBILicitacionMatch');

    renderHook(() => useEncajeLicitacion('812261-72-LP26', 'emp-1', 'Servicio de aseo', false), {
      wrapper: envoltorio(),
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(pedir).not.toHaveBeenCalled();
  });

  it('con el plan, pide el encaje a la ruta que existe', async () => {
    const get = vi
      .spyOn((apiClient as unknown as { client: { get: (...a: unknown[]) => unknown } }).client, 'get')
      .mockResolvedValue({ data: { disponible: true, nivel: 'alto', score_encaje: 0.8 } });

    const { result } = renderHook(
      () => useEncajeLicitacion('812261-72-LP26', 'emp-1', 'Servicio de aseo', true),
      { wrapper: envoltorio() },
    );

    await waitFor(() => expect(result.current.data?.nivel).toBe('alto'));
    expect(get).toHaveBeenCalledWith(
      expect.stringMatching(/\/bi\/licitacion-match\/812261-72-LP26$/),
      { params: { empresa_id: 'emp-1', texto: 'Servicio de aseo' } },
    );
  });
});

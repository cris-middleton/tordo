/**
 * El plan que ve la UI es el de la EMPRESA, y el efectivo.
 *
 * Desde F3 el plan es de la empresa (ADR 0002) y `/auth/me` dejó de traerlo,
 * pero siete pantallas seguían leyendo `user.plan_tier`. Valía `undefined`, así
 * que la barra decía «Plan Free» y las bandas de precio y los competidores
 * quedaban con candado **también para quien pagaba Pro** — y para todo el que
 * estaba en los 14 días de prueba, que es justo cuando se decide comprar.
 *
 * El compilador ya no deja volver a leerlo (`User` no declara esos campos).
 * Esto fija el otro lado: de dónde sale el plan y que el trial cuenta como Pro.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api';
import { incluyePro } from '@/lib/plan';
import { usePlanActual } from '@/lib/queries';
import type { PlanResumen } from '@/types/cuenta';

// La empresa elegida vive en localStorage; aquí se controla directamente.
const activa = vi.hoisted(() => ({ id: null as string | null }));
vi.mock('@/lib/empresaActive', () => ({ useEmpresaActiva: () => activa.id }));

const EN_TRIAL: PlanResumen = {
  tier: 'pro',
  etiqueta: 'Pro',
  en_trial: true,
  trial_termina: '2026-10-08T21:43:54Z',
  tier_contratado: 'basico',
  siguiente_tier: null,
  limites: { max_usuarios: 5, max_docs: 200, max_docs_mb: null, bi_queries_per_day: null, max_active_alerts: null },
  uso: { usuarios: 1, consultas_bi_hoy: 0 },
};

function envoltorio() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Envoltorio({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  activa.id = null;
});

describe('usePlanActual', () => {
  it('sin empresa elegida, lee el plan de la primera', async () => {
    vi.spyOn(apiClient, 'getEmpresas').mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    const plan = vi.spyOn(apiClient, 'getPlanEmpresa').mockResolvedValue(EN_TRIAL);

    const { result } = renderHook(() => usePlanActual(), { wrapper: envoltorio() });

    await waitFor(() => expect(result.current.data?.tier).toBe('pro'));
    expect(plan).toHaveBeenCalledWith('e1');
  });

  it('con empresa elegida, lee el plan de ésa', async () => {
    activa.id = 'e2';
    vi.spyOn(apiClient, 'getEmpresas').mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    const plan = vi.spyOn(apiClient, 'getPlanEmpresa').mockResolvedValue(EN_TRIAL);

    const { result } = renderHook(() => usePlanActual(), { wrapper: envoltorio() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(plan).toHaveBeenCalledWith('e2');
  });
});

describe('incluyePro', () => {
  it('el trial, que paga basico y tiene pro, cuenta como Pro', () => {
    // Se le pasa el tier EFECTIVO. Con el contratado, el trial saldría Free.
    expect(incluyePro(EN_TRIAL.tier)).toBe(true);
    expect(incluyePro(EN_TRIAL.tier_contratado)).toBe(false);
  });

  it('sin plan cargado todavía, no concede nada', () => {
    expect(incluyePro(undefined)).toBe(false);
  });
});

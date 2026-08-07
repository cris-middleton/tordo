'use client';

import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { useEmpresaActiva } from '@/lib/empresaActive';
import type { DashboardHomeResponse } from '@/types/dashboardHome';

import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { UrgencyZone } from '@/components/dashboard/UrgencyZone';
import { MatchesZone } from '@/components/dashboard/MatchesZone';
import { PipelineZone } from '@/components/dashboard/PipelineZone';
import { TrendWidget } from '@/components/dashboard/TrendWidget';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RadarWidget } from '@/components/dashboard/RadarWidget';
import { usePanel } from '@/lib/queries';

/**
 * Traduce el error de la API a algo que el usuario pueda leer.
 *
 * Estaba dentro del `.catch()`. Se saca para que la pantalla no tenga que
 * manejar el ciclo de vida de la petición, sólo su resultado.
 */
function mensajeDeError(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { detail?: string } };
    message?: string;
  };
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  console.error('[Dashboard] getDashboardHome failed:', { status, detail, err });
  if (status === 500 && detail) return `Error del servidor: ${detail}`;
  if (detail) return detail;
  if (e?.message) {
    return `No pudimos cargar el dashboard — ${e.message}. Reintenta en un momento.`;
  }
  return 'No pudimos cargar el dashboard. Reintenta en un momento.';
}

export default function DashboardPage() {
  const { user } = useAuth();
  // El panel es estado de servidor: lo maneja TanStack Query. La empresa activa
  // vive en localStorage y se lee con `useEmpresaActiva`, que además es reactivo
  // — antes se leía en un efecto que sólo corría al montar, así que cambiar de
  // empresa en el selector no actualizaba esta pantalla hasta recargar.
  const empresaId = useEmpresaActiva() ?? undefined;
  const { data, error: errorConsulta, refetch } = usePanel(empresaId);

  const error = errorConsulta ? mensajeDeError(errorConsulta) : null;

  const firstName = (user?.full_name || user?.username || 'hola').split(' ')[0];

  if (!data && !error) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 rounded-xl bg-surface border border-border" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="h-72 rounded-xl bg-surface border border-border" />
          <div className="h-72 rounded-xl bg-surface border border-border" />
        </div>
        <div className="h-32 rounded-xl bg-surface border border-border" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="alert-error">
        <span>{error}</span>
        <button onClick={() => refetch()} className="ml-3 underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <DashboardHeader data={data} firstName={firstName} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <UrgencyZone items={data.urgencias} empresaPresent={data.empresa !== null} />
        <MatchesZone
          matches={data.matches}
          totalDisponibles={data.matches_total_disponibles}
          cachedAt={data.matches_cached_at}
          plan={data.plan}
        />
      </div>

      <PipelineZone pipeline={data.pipeline} />

      <RadarWidget empresaId={data.empresa?.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <TrendWidget trend={data.trend} />
        </div>
        <div className={data.trend.disponible ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

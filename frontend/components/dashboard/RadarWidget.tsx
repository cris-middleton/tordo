'use client';

import Link from 'next/link';
import { Radar, Loader2, Target, Building2, Zap } from 'lucide-react';
import { useRadarSemanal } from '@/lib/queries';
import type { RadarResponse, RadarMovimiento } from '@/types/dashboardHome';

interface RadarWidgetProps {
  empresaId: string | null | undefined;
}

const TIPO_ICON: Record<RadarMovimiento['tipo'], React.ComponentType<{ className?: string }>> = {
  nueva_licitacion: Zap,
  oportunidad_top: Target,
  comprador_activo: Building2,
};

const TIPO_COLOR: Record<RadarMovimiento['tipo'], string> = {
  nueva_licitacion: 'text-primary bg-primary/10',
  oportunidad_top: 'text-accent bg-accent/10',
  comprador_activo: 'text-gold bg-gold/10',
};

export function RadarWidget({ empresaId }: RadarWidgetProps) {
  // `enabled` dentro del hook cubre el caso sin empresa, así que desaparece el
  // `if (!empresaId) return` que había dentro del efecto.
  const { data: respuesta, isFetching } = useRadarSemanal(empresaId ?? undefined);
  const data = (respuesta ?? null) as RadarResponse | null;

  // Loading state — keep card structure stable
  if (isFetching && !data) {
    return (
      <section className="card flex items-center gap-3 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted">Buscando movimientos de la semana...</p>
      </section>
    );
  }

  // Sin radar para mostrar — ocultar la card por completo (no genera ruido)
  if (!data || !data.disponible || !data.movimientos || data.movimientos.length === 0) {
    return null;
  }

  return (
    <section className="card border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-primary" />
          <div>
            <h2 className="section-title">Radar de la semana</h2>
            <p className="text-xs text-muted mt-0.5">
              Movimientos relevantes en tus rubros
              {data.semana_inicio && (
                <> &middot; semana del {new Date(data.semana_inicio).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</>
              )}
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-2.5">
        {data.movimientos.map((m, i) => {
          const Icon = TIPO_ICON[m.tipo] ?? Zap;
          const colorClass = TIPO_COLOR[m.tipo] ?? 'text-muted bg-surface';
          const content = (
            <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface hover:border-primary/30 transition-colors">
              <div className={`rounded-full p-2 shrink-0 ${colorClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text">{m.titulo}</p>
                <p className="text-xs text-muted mt-0.5 line-clamp-2">{m.detalle}</p>
              </div>
              {m.accion_url && (
                <span className="text-xs text-primary shrink-0 self-center">&rarr;</span>
              )}
            </div>
          );

          return (
            <li key={i}>
              {m.accion_url ? (
                <Link href={m.accion_url} className="block">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

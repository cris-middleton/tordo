'use client';

import type { TrendStats } from '@/types/dashboardHome';

export function TrendWidget({ trend }: { trend: TrendStats }) {
  if (!trend.disponible) return null;
  const max = Math.max(1, ...trend.postulaciones_semana);
  const last = trend.postulaciones_semana[trend.postulaciones_semana.length - 1] ?? 0;
  return (
    <div className="card hidden sm:block">
      <h2 className="section-title mb-3">Tu mes</h2>
      <div className="flex items-end gap-1 h-12 mb-2">
        {trend.postulaciones_semana.map((n, i) => (
          <div
            key={i}
            className="flex-1 bg-primary/40 rounded-t-sm"
            style={{ height: `${(n / max) * 100}%`, minHeight: '4px' }}
            title={`${n} esta semana`}
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="font-semibold text-text">{last}</span> postulaciones esta semana
        {trend.delta_enviadas_pp != null && trend.delta_enviadas_pp !== 0 && (
          <span className={trend.delta_enviadas_pp > 0 ? 'text-accent ml-1' : 'text-danger ml-1'}>
            ({trend.delta_enviadas_pp > 0 ? '+' : ''}{trend.delta_enviadas_pp} vs anterior)
          </span>
        )}
      </p>
      {trend.tasa_adjudicacion_actual != null && (
        <p className="text-xs text-muted mt-1">
          <span className="font-semibold text-text">{Math.round(trend.tasa_adjudicacion_actual * 100)}%</span> tasa de adjudicación
          {trend.tasa_adjudicacion_anterior != null && (
            <span className="text-muted ml-1">
              ({Math.round((trend.tasa_adjudicacion_actual - trend.tasa_adjudicacion_anterior) * 100) >= 0 ? '+' : ''}
              {Math.round((trend.tasa_adjudicacion_actual - trend.tasa_adjudicacion_anterior) * 100)}pp vs mes prev.)
            </span>
          )}
        </p>
      )}
    </div>
  );
}

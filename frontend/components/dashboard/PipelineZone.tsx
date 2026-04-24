'use client';

import Link from 'next/link';
import type { PipelineCounts } from '@/types/dashboardHome';

const STAGES: Array<{ key: keyof Pick<PipelineCounts, 'en_seguimiento' | 'en_preparacion' | 'enviada' | 'adjudicada' | 'no_adjudicada'>; label: string; tone: string }> = [
  { key: 'en_seguimiento', label: 'Seguimiento', tone: 'bg-muted/40' },
  { key: 'en_preparacion', label: 'Preparación', tone: 'bg-muted/40' },
  { key: 'enviada', label: 'Enviada', tone: 'bg-info/40' },
  { key: 'adjudicada', label: 'Adjudicada', tone: 'bg-accent/40' },
  { key: 'no_adjudicada', label: 'No adjudicada', tone: 'bg-danger/40' },
];

export function PipelineZone({ pipeline }: { pipeline: PipelineCounts }) {
  const max = Math.max(1, ...STAGES.map((s) => pipeline[s.key]));
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Tu pipeline — últimos 90 días</h2>
        <Link href="/dashboard/postulaciones" className="text-xs text-muted hover:text-text">
          Ver todas ›
        </Link>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((s) => {
          const count = pipeline[s.key];
          const widthPct = (count / max) * 100;
          return (
            <Link
              key={s.key}
              href={`/dashboard/postulaciones?estado=${s.key}`}
              className="flex flex-col items-center gap-1.5 hover:opacity-80"
            >
              <div className="text-xs text-muted">{s.label}</div>
              <div className="text-lg font-bold text-text">{count}</div>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full ${s.tone}`} style={{ width: `${widthPct}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      {pipeline.tasa_adjudicacion_90d != null && pipeline.decididas_90d >= 3 && (
        <p className="text-xs text-muted mt-3">
          Tasa de adjudicación últimos 90 días:{' '}
          <span className="font-semibold text-text">
            {Math.round(pipeline.tasa_adjudicacion_90d * 100)}%
          </span>{' '}
          ({pipeline.adjudicada} de {pipeline.decididas_90d} decididas)
        </p>
      )}
    </div>
  );
}

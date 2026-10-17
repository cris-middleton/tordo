'use client';

import { format } from 'date-fns';
import es from 'date-fns/locale/es';

export default function OpportunityTimeline({
  fechaPublicacion,
  fechaCierre,
}: {
  fechaPublicacion?: string;
  fechaCierre?: string;
}) {
  const fmt = (d?: string) => {
    if (!d) return null;
    try { return format(new Date(d), 'd MMM yyyy', { locale: es }); } catch { return null; }
  };

  const steps = [
    { label: 'Publicación', date: fmt(fechaPublicacion), done: !!fechaPublicacion },
    { label: 'Cierre', date: fmt(fechaCierre), done: false, highlight: true },
    { label: 'Adjudicación', date: null, done: false },
  ];

  return (
    <div className="card">
      <p className="mb-3 text-sm font-semibold text-text">Hitos</p>
      <div className="flex items-start gap-0">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-3 w-3 shrink-0 rounded-full border-2 ${step.highlight ? 'border-primary bg-primary' : step.done ? 'border-accent bg-accent' : 'border-border bg-background'}`} />
              {i < steps.length - 1 && <div className="h-0.5 flex-1 bg-border" />}
            </div>
            <p className="mt-1.5 text-center text-xs font-medium text-text leading-tight">{step.label}</p>
            {step.date && <p className="text-xs text-muted text-center leading-tight">{step.date}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

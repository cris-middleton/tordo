'use client';

import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import type { UrgenciaItem } from '@/types/dashboardHome';

const SEVERITY_DOT: Record<string, string> = {
  rojo: 'bg-danger',
  naranja: 'bg-orange-500',
  amarillo: 'bg-yellow-500',
};

interface Props {
  items: UrgenciaItem[];
  empresaPresent: boolean;
}

export function UrgencyZone({ items, empresaPresent }: Props) {
  if (!empresaPresent) {
    return (
      <div className="card">
        <h2 className="section-title mb-3">Para hoy</h2>
        <div className="text-center py-6 text-sm text-muted space-y-2">
          <p>Aún no hay nada tuyo cargado. Partamos por acá:</p>
          <div className="flex flex-col gap-1 text-primary text-sm">
            <Link href="/onboarding" className="hover:underline">→ Registra tu empresa</Link>
            <Link href="/dashboard/documentos" className="hover:underline">→ Sube los documentos que te van a pedir</Link>
            <Link href="/dashboard/alerts" className="hover:underline">→ Dinos qué vendes para avisarte</Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card bg-accent/5 border-accent/20">
        <h2 className="section-title mb-3">Para hoy</h2>
        <div className="flex items-start gap-3 py-2">
          <CheckCircle2 size={20} className="text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text">Estás al día: nada cierra en las próximas 72 horas.</p>
            <p className="text-xs text-muted mt-1">Tu empresa está hábil y no se te vence ningún documento.</p>
            <Link href="/dashboard/postulaciones" className="text-xs text-primary hover:underline mt-2 inline-block">
              Ver mis postulaciones →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="section-title">Para hoy</h2>
        <Link href="/dashboard/alerts" className="text-xs text-muted hover:text-text">
          Ver todas ›
        </Link>
      </div>
      <div className="divide-y divide-border">
        {items.map((u) => (
          <Link
            key={u.id}
            href={u.cta_href}
            className="flex items-start gap-3 px-4 py-3 hover:bg-primary/5 transition-colors"
          >
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[u.severidad] || 'bg-muted'}`} />
            <span className="w-10 shrink-0 text-xs font-mono text-muted pt-0.5">{u.tiempo_label}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{u.titulo}</p>
              <p className="text-xs text-muted truncate mt-0.5">{u.subtitulo}</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary">
              {u.cta_label} <ArrowRight size={12} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

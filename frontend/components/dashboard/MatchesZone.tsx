'use client';

import Link from 'next/link';
import { Bookmark, ArrowRight, Lock } from 'lucide-react';
import type { MatchItem, PlanInfo } from '@/types/dashboardHome';

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-accent';
  if (score >= 60) return 'bg-info';
  return 'bg-muted';
}

function formatMonto(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B ${currency}`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M ${currency}`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K ${currency}`;
  return `$${amount.toFixed(0)} ${currency}`;
}

function daysUntil(iso: string | null): string {
  if (!iso) return '';
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  return `Cierre en ${days}d`;
}

interface Props {
  matches: MatchItem[];
  totalDisponibles: number;
  cachedAt: string | null;
  plan: PlanInfo;
}

export function MatchesZone({ matches, totalDisponibles, cachedAt, plan }: Props) {
  if (matches.length === 0) {
    return (
      <div className="card">
        <h2 className="section-title mb-2">Oportunidades para ti</h2>
        <div className="text-center py-6 space-y-2">
          <p className="text-sm text-muted">
            Aún no tenemos datos suficientes para darte matches. Tordo necesita 5–10 postulaciones
            o compras históricas para aprender tu perfil.
          </p>
          <Link href="/dashboard/empresa" className="text-xs text-primary hover:underline">
            Completar perfil manualmente →
          </Link>
        </div>
      </div>
    );
  }

  const isFree = plan.tier === 'free';
  const visibleCount = isFree ? 1 : matches.length;
  const lockedCount = isFree ? Math.max(2, matches.length - 1) : 0;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <h2 className="section-title">Oportunidades para ti</h2>
        <Link href="/dashboard/tenders?source=matches" className="text-xs text-muted hover:text-text">
          Ver {totalDisponibles} más ›
        </Link>
      </div>
      {cachedAt && (
        <p className="text-[11px] text-subtle px-4 mb-3">
          Actualizado {new Date(cachedAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
      <div className="space-y-2 px-4 pb-4">
        {matches.slice(0, visibleCount).map((m) => (
          <div key={m.codigo_externo} className="rounded-lg border border-border p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full ${scoreColor(m.score)}`} style={{ width: `${m.score}%` }} />
              </div>
              <span className="text-sm font-bold text-text w-8 text-right">{m.score}</span>
            </div>
            <p className="text-sm font-medium text-text truncate">{m.nombre}</p>
            <p className="text-xs text-muted mt-0.5 truncate">
              {m.organismo} · {formatMonto(m.monto_estimado, m.moneda)}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted">{daysUntil(m.fecha_cierre)}</span>
              <div className="flex items-center gap-2">
                <button className="text-xs text-muted hover:text-text inline-flex items-center gap-1">
                  <Bookmark size={12} /> Guardar
                </button>
                <Link href={m.href} className="text-xs font-medium text-primary inline-flex items-center gap-1">
                  Ver <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        ))}
        {lockedCount > 0 &&
          Array.from({ length: lockedCount }).map((_, i) => (
            <div key={`locked-${i}`} className="rounded-lg border border-border p-3 relative">
              <div className="filter blur-sm pointer-events-none">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="flex-1 h-1.5 bg-border rounded-full" />
                  <span className="text-sm font-bold text-text w-8 text-right">??</span>
                </div>
                <p className="text-sm font-medium text-text">Licitación bloqueada</p>
                <p className="text-xs text-muted mt-0.5">Organismo · Monto</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Link
                  href="/dashboard/billing"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90"
                >
                  <Lock size={12} /> Desbloquea con PYME+
                </Link>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

'use client';

import { User, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { MiPosicion, PlanTier, isPaidPlan } from '../types';

interface MyPositionCardProps {
  posicion: MiPosicion | null;
  plan: PlanTier | undefined;
  loading?: boolean;
}

export function MyPositionCard({ posicion, plan, loading }: MyPositionCardProps) {
  // Loading — mantener la estructura para no causar layout shift
  if (loading) {
    return (
      <section className="card border-border/50 bg-surface/50 py-6">
        <p className="text-sm text-muted text-center">Calculando tu posición...</p>
      </section>
    );
  }

  if (!posicion) return null;

  const paid = isPaidPlan(plan);

  // ── Estado: sin historial de ventas en este rubro ─────────────────────────
  if (posicion.disponible && !posicion.tiene_historial) {
    return (
      <section className="card border-border/60 bg-surface/60">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-surface border border-border p-2 shrink-0">
            <User className="h-4 w-4 text-muted" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-text mb-1">Tu posición</p>
            <p className="text-muted">
              Aún no tienes historial de ventas a Mercado Público en este rubro.
              Esta card cobrará vida cuando completes tu primera orden de compra.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Si el backend dice no-disponible (por ej. empresa sin RUT), no renderear
  if (!posicion.disponible) return null;

  // ── Estado: teaser para plan básico ────────────────────────────────────────
  if (!paid) {
    return (
      <section className="card border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3 mb-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-sm space-y-1.5">
            <p className="font-semibold text-text">Tu posición</p>
            {posicion.participacion_pct != null && (
              <p className="text-text">
                Tu participación en este mercado: <b>{posicion.participacion_pct.toFixed(1)}%</b>
              </p>
            )}
            {posicion.top_organismo_empresa?.porcentaje_oc != null && (
              <p className="text-text">
                Tu dependencia en un solo comprador: <b>{Math.round(posicion.top_organismo_empresa.porcentaje_oc)}%</b>
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface/70 p-3 flex items-center gap-3">
          <p className="flex-1 text-xs text-muted">
            Ver tu ranking completo, diversificación y alertas
          </p>
          <Link href="/dashboard/billing" className="btn-primary text-xs shrink-0">
            Plan PYME →
          </Link>
        </div>
      </section>
    );
  }

  // ── Estado: versión completa PYME+ ─────────────────────────────────────────
  return (
    <section className="card border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/15 p-2 shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <p className="font-semibold text-text">Tu posición</p>

          {posicion.participacion_pct != null && posicion.rank != null && posicion.total_proveedores != null && (
            <p className="text-text">
              📊 Participación: <b>{posicion.participacion_pct.toFixed(1)}%</b>
              {' · '}
              puesto <b>{posicion.rank}</b> de <b>{posicion.total_proveedores.toLocaleString('es-CL')}</b>
            </p>
          )}

          {posicion.n_organismos_atendidos != null && (
            <p className="text-text">
              🏛️ Vendes a <b>{posicion.n_organismos_atendidos}</b> compradores
              {posicion.n_organismos_promedio_sector != null && (
                <span className="text-muted"> (promedio del sector: {posicion.n_organismos_promedio_sector})</span>
              )}
            </p>
          )}

          {posicion.alerta_dependencia && posicion.top_organismo_empresa?.porcentaje_oc != null && (
            <p className="flex items-start gap-1.5 text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <b>{Math.round(posicion.top_organismo_empresa.porcentaje_oc)}%</b> de tus OC dependen de un solo comprador
                {posicion.top_organismo_empresa.nombre ? <> (<b>{posicion.top_organismo_empresa.nombre}</b>)</> : null}
                {' '}— alerta de concentración
              </span>
            </p>
          )}

          {posicion.diversificacion_pct != null && !posicion.alerta_dependencia && (
            <p className="text-muted text-xs">
              Diversificación: {Math.round(posicion.diversificacion_pct)}% — cartera balanceada
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

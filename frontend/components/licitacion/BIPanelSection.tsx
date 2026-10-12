'use client';

import {
  AlertTriangle,
  BadgeAlert,
  Calendar,
  Clock,
  TrendingUp,
  Users,
} from 'lucide-react';

import { BuyerProfilePanel } from '@/components/BuyerProfilePanel';
import { OpportunityScoreCard } from '@/components/OpportunityScoreCard';
import OpportunityTimeline from '@/components/licitacion/OpportunityTimeline';
import { CompetitorsList } from '@/components/CompetitorsList';
import { PriceBandChart } from '@/components/PriceBandChart';
import { fmtCLP, fmtDays, fmtPct } from '@/lib/licitacionDetalle';
import type { BIPanel, TenderDetail } from '@/types/licitacionDetalle';
import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

export default function BIPanelSection({ panel, tender }: { panel: BIPanel; tender?: TenderDetail }) {
  const { comprador, ventana, competidores, precios } = panel;

  const ventanaColor =
    ventana.disponible && ventana.alerta_ventana_corta
      ? 'border-danger/30 bg-danger/10'
      : 'border-border bg-background';

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Inteligencia pre-oferta
      </h3>

      {/* ── Score de oportunidad ── */}
      <OpportunityScoreCard panel={panel} />

      {/* ── Timeline de hitos ── */}
      {tender && (tender.fecha_publicacion || tender.fecha_cierre) && (
        <OpportunityTimeline
          fechaPublicacion={tender.fecha_publicacion}
          fechaCierre={tender.fecha_cierre}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── Perfil del comprador ── */}
        <BuyerProfilePanel comprador={comprador} />

        {/* ── Ventana de preparación ── (kept as-is) */}
        <div className={`card space-y-3 border ${ventanaColor}`}>
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Calendar className="h-4 w-4 text-primary" />
            Ventana de preparación
          </div>
          {!ventana.disponible ? (
            <p className="text-xs text-muted">{motivoParaPersona(ventana.motivo, 'Todavía no tenemos plazos históricos de este comprador.')}</p>
          ) : (
            <div className="space-y-2 text-sm">
              {ventana.alerta_ventana_corta && (
                <div className="flex items-center gap-1.5 text-danger bg-danger/10 rounded px-2 py-1 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Ventana inusualmente corta
                </div>
              )}
              {ventana.window_days != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Días disponibles</span>
                  <span className="font-semibold text-text">{ventana.window_days}</span>
                </div>
              )}
              {ventana.clasificacion_ventana && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Clasificación</span>
                  <span className="text-text capitalize">
                    {ventana.clasificacion_ventana.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {ventana.pct_del_tipico != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">% del plazo típico</span>
                  <span className="text-text">{decimal(ventana.pct_del_tipico, 0)}%</span>
                </div>
              )}
              {ventana.presion_score != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Score de presión</span>
                  <span className="text-text">{decimal(ventana.presion_score, 2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Competidores ── */}
        <CompetitorsList competidores={competidores} />

        {/* ── Referencia de precios ── */}
        <PriceBandChart precios={precios} />
      </div>
    </div>
  );
}

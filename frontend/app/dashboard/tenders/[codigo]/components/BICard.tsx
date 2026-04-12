// frontend/app/dashboard/tenders/[codigo]/components/BICard.tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, BarChart3, Loader2, AlertTriangle, Clock, Users, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { scoreBg, scoreColor, PlanTier, isPaidPlan } from '../../../bi/types';

interface BICardProps {
  codigoExterno: string;
  empresaId?: string;
  plan?: PlanTier;
}

interface BIPanelData {
  comprador: {
    disponible: boolean;
    nombre?: string;
    buyer_score?: number;
    clasificacion?: string;
    mediana_dias_pago?: number;
    tasa_adjudicacion?: number;
    n_flags?: number;
  };
  ventana: {
    disponible: boolean;
    alerta_ventana_corta?: boolean;
    presion_score?: number;
    window_days?: number;
    clasificacion_ventana?: string;
    pct_del_tipico?: number;
  };
  competidores: {
    disponible: boolean;
    hhi?: number;
    tipo_mercado?: string;
    top5?: Array<{ NombreProveedor: string }>;
    n_proveedores?: number;
  };
  precios: Array<{
    disponible: boolean;
    codigo_producto?: string;
    p50?: number;
    confianza?: string;
  }>;
}

export function BICard({ codigoExterno, empresaId, plan = 'basico' }: BICardProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BIPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const paid = isPaidPlan(plan);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await apiClient.getBIPanel(codigoExterno, empresaId);
      setData(res);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Load summary on mount
  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoExterno]);

  // buyer_score is 0-1; ×10 for display and color thresholds
  const buyerScore = data?.comprador?.buyer_score != null ? data.comprador.buyer_score * 10 : undefined;
  const ventanaClasif = data?.ventana?.clasificacion_ventana ?? '—';
  const nProveedores = data?.competidores?.n_proveedores;
  const hasAlert = data?.ventana?.alerta_ventana_corta;

  const summaryParts = [
    buyerScore != null && `Comprador: ${buyerScore.toFixed(1)}/10`,
    `Plazo: ${ventanaClasif}`,
    nProveedores != null && `${nProveedores} competidores`,
  ].filter(Boolean);
  const summaryLine = summaryParts.join(' · ');

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          if (!open) load();
          setOpen((o) => !o);
        }}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-primary/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm text-text">Inteligencia de mercado</span>
          {hasAlert && (
            <span className="flex items-center gap-1 text-xs text-gold font-medium">
              <AlertTriangle className="h-3 w-3" /> Plazo corto
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
          ) : (
            <span className="text-xs text-muted hidden sm:block">{summaryLine}</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-5 py-4">
          {!paid ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm text-muted">Análisis detallado disponible en plan PYME o superior.</p>
              <Link href="/dashboard/billing" className="btn-primary text-sm">Ver planes</Link>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : !data ? (
            <p className="text-sm text-muted py-4 text-center">No se pudo cargar el análisis.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Plazo */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Plazo de preparación</p>
                </div>
                {data.ventana.disponible ? (
                  <>
                    {data.ventana.alerta_ventana_corta && (
                      <span className="inline-flex items-center gap-1 text-xs text-gold font-medium mb-1">
                        <AlertTriangle className="h-3 w-3" /> Plazo corto
                      </span>
                    )}
                    <p className="text-sm font-semibold text-text">
                      {data.ventana.window_days != null ? `${data.ventana.window_days} días` : '—'}
                    </p>
                    {data.ventana.pct_del_tipico != null && (
                      <p className="text-xs text-muted mt-0.5">
                        {data.ventana.pct_del_tipico.toFixed(0)}% del plazo típico
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {/* Comprador */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Comprador</p>
                </div>
                {data.comprador.disponible ? (
                  <>
                    {buyerScore != null && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-base font-bold ${scoreColor(buyerScore)}`}>
                          {buyerScore.toFixed(1)}
                        </span>
                        {data.comprador.clasificacion && (
                          <span className={`text-xs rounded-full border px-2 py-0.5 ${scoreBg(buyerScore)}`}>
                            {data.comprador.clasificacion}
                          </span>
                        )}
                      </div>
                    )}
                    {data.comprador.mediana_dias_pago != null && (
                      <p className="text-xs text-muted">Pago: {Math.round(data.comprador.mediana_dias_pago)} días</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {/* Competencia */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Competencia</p>
                </div>
                {data.competidores.disponible ? (
                  <>
                    <p className="text-sm font-semibold text-text">
                      {data.competidores.n_proveedores ?? '—'} proveedores
                    </p>
                    {data.competidores.tipo_mercado && (
                      <p className="text-xs text-muted mt-0.5 capitalize">{data.competidores.tipo_mercado}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {/* Precios */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Precios de referencia</p>
                </div>
                {data.precios.length > 0 && data.precios[0].disponible ? (
                  <div className="space-y-1">
                    {data.precios.slice(0, 2).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-muted truncate max-w-[80px]">{p.codigo_producto ?? `Ítem ${i + 1}`}</span>
                        <span className="font-medium text-text">
                          {p.p50 != null ? `$${p.p50.toLocaleString('es-CL')}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

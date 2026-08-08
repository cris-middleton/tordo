'use client';

import Link from 'next/link';
import { CheckCircle2, Loader2, MinusCircle, Sparkles, XCircle } from 'lucide-react';

import type { PerfilMatchResult } from '@/types/licitacionDetalle';

// ¿Tu perfil encaja? widget
const nivelConfig: Record<string, { icon: JSX.Element; color: string; label: string; description: string }> = {
  alto: {
    icon: <CheckCircle2 className="h-5 w-5 text-accent" />,
    color: 'bg-accent/10 border-accent/30 text-accent',
    label: 'Encaje alto',
    description: 'Tu empresa tiene experiencia directa en este tipo de producto o servicio.',
  },
  medio: {
    icon: <CheckCircle2 className="h-5 w-5 text-gold" />,
    color: 'bg-gold/10 border-gold/30 text-gold',
    label: 'Encaje moderado',
    description: 'Hay similitud parcial entre tu perfil y esta licitación.',
  },
  bajo: {
    icon: <MinusCircle className="h-5 w-5 text-muted" />,
    color: 'bg-border border-borderLight text-muted',
    label: 'Encaje bajo',
    description: 'Hay poca coincidencia entre tu perfil y esta licitación.',
  },
  sin_encaje: {
    icon: <XCircle className="h-5 w-5 text-danger" />,
    color: 'bg-danger/10 border-danger/30 text-danger',
    label: 'Sin encaje detectado',
    description: 'No se detectó coincidencia semántica entre tu perfil y esta licitación.',
  },
};

export default function PerfilEncajeWidget({
  loading,
  result,
}: {
  loading: boolean;
  result: PerfilMatchResult | null;
}) {
  if (loading) {
    return (
      <div className="card flex items-center gap-3 text-sm text-muted py-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Analizando encaje con tu perfil…
      </div>
    );
  }
  if (!result) return null;
  if (!result.disponible && result.motivo?.includes('deshabilitado')) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text">
        <Sparkles className="h-4 w-4 text-primary" />
        ¿Tu perfil encaja?
      </div>

      {result.nivel === 'sin_perfil' && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-2">
          <p className="text-sm text-muted">{result.motivo}</p>
          <Link
            href="/dashboard/bi"
            className="btn-secondary text-xs inline-flex items-center gap-1"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Configurar perfil en Inteligencia BI
          </Link>
        </div>
      )}

      {!result.disponible && result.nivel !== 'sin_perfil' && (
        <p className="text-sm text-muted">{result.motivo || 'Matching no disponible.'}</p>
      )}

      {result.disponible && result.nivel && result.nivel !== 'sin_perfil' && (
        <div
          className={`rounded-lg border p-4 space-y-3 ${nivelConfig[result.nivel]?.color ?? 'bg-background border-border'}`}
        >
          <div className="flex items-center gap-3">
            {nivelConfig[result.nivel]?.icon}
            <div>
              <p className="font-semibold text-sm">{nivelConfig[result.nivel]?.label}</p>
              <p className="text-xs opacity-80">{nivelConfig[result.nivel]?.description}</p>
            </div>
            {result.score_encaje != null && (
              <div className="ml-auto text-right shrink-0">
                <p className="text-2xl font-bold">{(result.score_encaje * 100).toFixed(0)}%</p>
                <p className="text-xs opacity-70">similitud</p>
              </div>
            )}
          </div>
          {result.score_encaje != null && (
            <div className="w-full h-2 rounded-full bg-black/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-current opacity-60"
                style={{ width: `${Math.min(100, result.score_encaje * 400)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

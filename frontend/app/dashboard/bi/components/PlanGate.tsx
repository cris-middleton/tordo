// frontend/app/dashboard/bi/components/PlanGate.tsx
'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';

interface PlanGateProps {
  children: React.ReactNode;
  locked: boolean;
  label?: string; // e.g. "Análisis de competencia"
}

export function PlanGate({ children, locked, label }: PlanGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred children */}
      <div className="pointer-events-none select-none blur-sm opacity-50">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
        <div className="rounded-full bg-surface border border-border p-3">
          <Lock className="h-5 w-5 text-muted" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-text">
            {label || 'Disponible en plan PYME'}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Actualiza tu plan para desbloquear esta sección
          </p>
        </div>
        <Link href="/dashboard/billing" className="btn-primary text-sm">
          Ver planes
        </Link>
      </div>
    </div>
  );
}

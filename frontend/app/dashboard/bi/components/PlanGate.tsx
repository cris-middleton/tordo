'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

interface PlanGateProps {
  children: ReactNode;
  locked: boolean;
  label?: string;
  preview?: ReactNode;
  placeholder?: ReactNode;
}

/**
 * Gate a section behind the paid plan.
 *
 * When `locked=true`:
 *   - Children are NOT mounted (no fetches executed, no quota spent)
 *   - `preview` renders crisp, legible text/visuals above
 *   - `placeholder` renders a decorative skeleton (optional)
 *   - CTA shows "Ver planes" linking to billing
 *
 * When `locked=false`:
 *   - Children render as usual
 */
export function PlanGate({ children, locked, label, preview, placeholder }: PlanGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <section className="card space-y-4 relative overflow-hidden">
      {preview && (
        <div className="relative z-10 text-sm text-text leading-relaxed">
          {preview}
        </div>
      )}

      {placeholder && (
        <div className="pointer-events-none select-none opacity-40">
          {placeholder}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface/70 p-4 flex items-center gap-3">
        <div className="rounded-full bg-surface border border-border p-2 shrink-0">
          <Lock className="h-4 w-4 text-muted" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-text">
            {/* El plan que se nombra tiene que ser uno que se pueda comprar.
                `/billing/plans` vende exactamente dos, «Free» y «Pro»; «PYME»
                existe en la tabla de cuotas y no en el catálogo, así que este
                cartel mandaba a la página de planes a buscar algo que no está. */}
            {label || 'Esto lo ves con Pro'}
          </p>
          {/* Prometía «los primeros 14 días van incluidos». El trial arranca
              solo al crear la empresa, y sin empresa no se llega aquí: quien
              ve este cartel ya lo usó. `Candado` dice lo mismo. */}
          <p className="text-xs text-muted mt-0.5">
            Sin contrato: se cancela desde Facturación cuando quieras
          </p>
        </div>
        <Link href="/dashboard/billing" className="btn-primary text-sm shrink-0">
          Ver el plan Pro
        </Link>
      </div>
    </section>
  );
}

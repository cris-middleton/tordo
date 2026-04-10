'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Zap, ArrowRight } from 'lucide-react';

interface QuotaDetail {
  bloqueada_por_plan: boolean;
  mensaje: string;
  plan_actual: string;
  limite: number | null;
  usado: number | null;
  upgrade_sugerido: string | null;
}

const TIER_LABEL: Record<string, string> = {
  pyme: 'PYME',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export default function PlanUpgradeBanner() {
  const router = useRouter();
  const [detail, setDetail] = useState<QuotaDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<QuotaDetail>).detail;
      if (d?.bloqueada_por_plan) {
        setDetail(d);
        setTimeout(() => setDetail(null), 12_000);
      }
    };
    window.addEventListener('plan-upgrade-needed', handler);
    return () => window.removeEventListener('plan-upgrade-needed', handler);
  }, []);

  if (!detail) return null;

  const upgradeLabel = detail.upgrade_sugerido
    ? TIER_LABEL[detail.upgrade_sugerido] ?? detail.upgrade_sugerido
    : null;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-sm animate-slide-up">
      <div className="rounded-xl border border-gold/30 bg-surface shadow-card-lg overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-gold to-gold/40" />
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-goldLight">
            <Zap size={16} className="text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text leading-snug">{detail.mensaje}</p>
            {upgradeLabel && (
              <button
                onClick={() => {
                  setDetail(null);
                  router.push('/dashboard/billing');
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-gold hover:text-[#b45309] transition-colors"
              >
                Ver plan {upgradeLabel}
                <ArrowRight size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setDetail(null)}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-background hover:text-text transition-colors"
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

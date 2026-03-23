'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Zap } from 'lucide-react';

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
        // Auto-dismiss after 12 seconds
        setTimeout(() => setDetail(null), 12_000);
      }
    };
    window.addEventListener('plan-upgrade-needed', handler);
    return () => window.removeEventListener('plan-upgrade-needed', handler);
  }, []);

  if (!detail) return null;

  const upgradeLabel = detail.upgrade_sugerido ? TIER_LABEL[detail.upgrade_sugerido] ?? detail.upgrade_sugerido : null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full shadow-lg rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-4">
      <div className="flex items-start gap-3">
        <Zap className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{detail.mensaje}</p>
          {upgradeLabel && (
            <button
              onClick={() => {
                setDetail(null);
                router.push('/dashboard/billing');
              }}
              className="mt-2 text-xs font-semibold underline underline-offset-2 hover:text-amber-700"
            >
              Ver plan {upgradeLabel} →
            </button>
          )}
        </div>
        <button
          onClick={() => setDetail(null)}
          className="shrink-0 text-amber-500 hover:text-amber-700"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Star,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface Plan {
  id: string;
  nombre: string;
  descripcion: string;
  features: string[];
  precio_mensual_clp?: number | null;
  precio_anual_mensualizado_clp?: number | null;
  precio_anual_total_clp?: number | null;
}

interface BillingStatus {
  plan_tier: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_enabled: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: 'Activa', color: 'text-accent bg-accent/10' },
  trialing: { label: 'Prueba gratuita', color: 'text-info bg-info/10' },
  past_due: { label: 'Pago vencido', color: 'text-danger bg-danger/10' },
  canceled: { label: 'Cancelada', color: 'text-muted bg-surface border border-border' },
  inactive: { label: 'Gratuito', color: 'text-muted bg-surface border border-border' },
};

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      const [plansData, statusData] = await Promise.all([
        apiClient.getBillingPlans(),
        apiClient.getBillingStatus(),
      ]);
      setPlans(plansData);
      setBillingStatus(statusData);
    } catch {
      setError('No se pudo cargar la información de facturación.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!billingStatus?.billing_enabled) return;
    setCheckoutLoading(true);
    setError('');
    try {
      const origin = window.location.origin;
      const res = await apiClient.createCheckoutSession({
        plan_tier: 'pro',
        billing_period: billingPeriod,
        success_url: `${origin}/dashboard/billing?success=1`,
        cancel_url: `${origin}/dashboard/billing`,
      });
      window.location.href = res.checkout_url;
    } catch {
      setError('No se pudo iniciar el checkout.');
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await apiClient.createBillingPortal();
      window.location.href = res.portal_url;
    } catch {
      setError('No se pudo abrir el portal de facturación.');
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  const freePlan = plans.find((p) => p.id === 'free');
  const proPlan = plans.find((p) => p.id === 'pro');
  const status = billingStatus?.subscription_status ?? 'inactive';
  const statusBadge = STATUS_LABELS[status] ?? STATUS_LABELS.inactive;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Current subscription status */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
              Tu suscripción
            </p>
            <p className="mt-1 text-lg font-bold text-text">
              Plan {billingStatus?.plan_tier === 'pro' ? 'Pro' : 'Free'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
          {billingStatus?.stripe_customer_id && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-background"
            >
              {portalLoading ? <Loader2 className="animate-spin" size={14} /> : <CreditCard size={14} />}
              Gestionar suscripción
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {!billingStatus?.billing_enabled && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Lock size={16} />
          El módulo de facturación está deshabilitado en este entorno.
        </div>
      )}

      {/* Two-card grid */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Free card */}
        {freePlan && (
          <div className="flex flex-col rounded-xl border border-border bg-surface p-6">
            <h3 className="text-lg font-bold text-text">{freePlan.nombre}</h3>
            <p className="mt-1 text-xs text-muted">{freePlan.descripcion}</p>
            <p className="mt-4 text-3xl font-bold text-text">$0</p>
            <div className="mt-4 h-4" />
            <ul className="flex-1 space-y-2.5">
              {freePlan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={14} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-subtle">
              Plan actual si no activas Pro
            </div>
          </div>
        )}

        {/* Pro card — superficie siempre-oscura: la clase `dark` invierte los
            tokens dentro de la tarjeta, así el teal y el dorado se aclaran
            solos sobre el navy. `bg-primary` no sirve acá: en tema oscuro
            primary se alza y la tarjeta, que asume texto blanco, se rompía. */}
        {proPlan && (
          <div className="dark relative flex flex-col rounded-xl border border-brand-navy bg-brand-navy p-6 text-white shadow-xl">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[11px] font-bold text-onGold">
                <Star size={10} /> Más elegido
              </span>
            </div>

            <h3 className="text-lg font-bold">{proPlan.nombre}</h3>
            <p className="mt-1 text-xs text-white/70">{proPlan.descripcion}</p>

            {/* Monthly / Annual toggle */}
            <div className="mt-4 inline-flex self-start rounded-lg bg-white/10 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBillingPeriod('monthly')}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  billingPeriod === 'monthly' ? 'bg-white text-brand-navy' : 'text-white/70 hover:text-white'
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod('annual')}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  billingPeriod === 'annual' ? 'bg-white text-brand-navy' : 'text-white/70 hover:text-white'
                }`}
              >
                Anual <span className="ml-1 text-[10px] text-accent">−17%</span>
              </button>
            </div>

            <p className="mt-3 text-3xl font-bold">
              {billingPeriod === 'monthly'
                ? formatCLP(proPlan.precio_mensual_clp ?? 0)
                : formatCLP(proPlan.precio_anual_mensualizado_clp ?? 0)}
              <span className="ml-1 text-sm font-normal text-white/70">/mes</span>
            </p>
            <p className="mt-1 min-h-[1rem] text-xs text-white/60">
              {billingPeriod === 'annual' && proPlan.precio_anual_total_clp
                ? `Facturado anual · ${formatCLP(proPlan.precio_anual_total_clp)}/año`
                : ''}
            </p>

            <ul className="mt-4 flex-1 space-y-2.5">
              {proPlan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/85">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={14} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || !billingStatus?.billing_enabled}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-onAccent hover:bg-accent/90 disabled:opacity-60"
            >
              {checkoutLoading ? <Loader2 className="animate-spin" size={14} /> : null}
              {status === 'active' ? 'Ya tienes Pro' : 'Activar Pro'}
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-subtle">
        Precios en CLP. Cancela cuando quieras desde el portal de facturación.
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { useCancelarSuscripcion, useCobroEstado, useCobroPlanes, usePlanActual } from '@/lib/queries';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Star,
  AlertTriangle,
  Lock,
  X,
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
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  billing_enabled: boolean;
  // No todas las pasarelas hospedan un portal de gestión: MercadoPago no.
  tiene_portal_de_gestion: boolean;
}

// Mismos tiers que app/core/plan_limits.py. Antes se colapsaba todo lo que no
// fuera 'pro' en "Free", así que una empresa PYME o Enterprise se veía como Free.
const TIER_LABELS: Record<string, string> = {
  basico: 'Free',
  pyme: 'PYME',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

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
  // Dos consultas independientes en vez de un Promise.all: si una falla, la otra
  // sigue mostrándose. Antes un fallo en cualquiera vaciaba la pantalla entera.
  const consultaPlanes = useCobroPlanes();
  const consultaEstado = useCobroEstado();
  // El plan que se TIENE, no el que se paga: en trial se paga «basico» y se
  // tiene Pro, y el encabezado decía «Plan Free» junto a «Prueba gratuita».
  const { data: planActual } = usePlanActual();
  const plans = (consultaPlanes.data ?? []) as Plan[];
  const billingStatus = (consultaEstado.data ?? null) as BillingStatus | null;
  const loading = consultaPlanes.isPending || consultaEstado.isPending;
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const cancelar = useCancelarSuscripcion();
  const errorDeCarga =
    consultaPlanes.error || consultaEstado.error
      ? 'No pudimos cargar tus datos de facturación. Vuelve a intentar en un momento.'
      : '';


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
      setError('No pudimos abrir el pago. Inténtalo de nuevo en un momento.');
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await apiClient.createBillingPortal();
      window.location.href = res.portal_url;
    } catch {
      setError('No pudimos abrir el portal de pagos. Inténtalo de nuevo en un momento.');
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

  const freePlan = plans.find((p) => p.id === 'basico');
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
              Plan {TIER_LABELS[planActual?.tier ?? billingStatus?.plan_tier ?? ''] ?? 'Free'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
          {billingStatus?.billing_customer_id && billingStatus?.tiene_portal_de_gestion && (
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
          {billingStatus?.billing_subscription_id && !billingStatus?.tiene_portal_de_gestion && (
            <button
              onClick={() => setConfirmando(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-background"
            >
              <X size={14} />
              Cancelar suscripción
            </button>
          )}
        </div>
      </div>

      {confirmando && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5">
          <p className="text-sm font-semibold text-text">¿Cancelar la suscripción?</p>
          <p className="mt-1 text-sm text-muted">
            Sigues con Pro hasta que termine el mes que ya pagaste. Después la empresa vuelve
            al plan Free y no te cobramos de nuevo.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={async () => {
                await cancelar.mutateAsync(undefined);
                setConfirmando(false);
              }}
              disabled={cancelar.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-danger px-3 py-2 text-sm font-bold text-onDanger disabled:opacity-60"
            >
              {cancelar.isPending ? <Loader2 className="animate-spin" size={14} /> : null}
              Sí, cancelar
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-background"
            >
              Mantener mi plan
            </button>
          </div>
          {cancelar.isError && (
            <p className="mt-3 text-sm text-danger">
              No se pudo cancelar. Vuelve a intentarlo en un momento.
            </p>
          )}
        </div>
      )}

      {(error || errorDeCarga) && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} />
          {error || errorDeCarga}
        </div>
      )}

      {!billingStatus?.billing_enabled && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Lock size={16} />
          Los pagos están desactivados por ahora. Escríbenos a hola@tordo.cl y lo vemos.
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
              Aquí queda tu cuenta si no activas Pro
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
                <Star size={10} /> Todo incluido
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
            {/* «IVA incluido» pegado al precio, igual que en la landing: es
                parte de la cifra, no letra chica. El hueco ya existía con
                `min-h` y quedaba vacío en el plan mensual. */}
            <p className="mt-1 min-h-[1rem] text-xs text-white/60">
              {billingPeriod === 'annual' && proPlan.precio_anual_total_clp
                ? `IVA incluido · facturado anual, ${formatCLP(proPlan.precio_anual_total_clp)}/año`
                : 'IVA incluido'}
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
        Sin contrato. Cancelas desde aquí mismo cuando quieras.
      </p>
    </div>
  );
}

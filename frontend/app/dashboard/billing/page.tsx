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
  precio_clp: number | null;
  descripcion: string;
  features: string[];
}

interface BillingStatus {
  plan_tier: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_enabled: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Activa', color: 'text-accent bg-accent/10' },
  trialing: { label: 'Prueba gratuita', color: 'text-info bg-info/10' },
  past_due: { label: 'Pago vencido', color: 'text-danger bg-danger/10' },
  canceled: { label: 'Cancelada', color: 'text-muted bg-surface border border-border' },
  inactive: { label: 'Gratuito', color: 'text-muted bg-surface border border-border' },
};

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansData, statusData] = await Promise.all([
        apiClient.getBillingPlans(),
        apiClient.getBillingStatus(),
      ]);
      setPlans(plansData);
      setBillingStatus(statusData);
    } catch (err: any) {
      setError('No se pudo cargar la información de facturación.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (planId: string) => {
    if (!billingStatus?.billing_enabled) return;
    setCheckoutLoading(planId);
    setError('');
    try {
      const origin = window.location.origin;
      const res = await apiClient.createCheckoutSession({
        plan_tier: planId,
        success_url: `${origin}/dashboard/billing?success=1`,
        cancel_url: `${origin}/dashboard/billing`,
      });
      window.location.href = res.checkout_url;
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          'No se pudo iniciar el proceso de pago. Verifica que Stripe esté configurado.',
      );
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError('');
    try {
      const res = await apiClient.createBillingPortal();
      window.location.href = res.portal_url;
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No se pudo abrir el portal de facturación.');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  const currentPlanId = billingStatus?.plan_tier || 'basico';
  const subStatus = billingStatus?.subscription_status || 'inactive';
  const statusCfg = STATUS_LABELS[subStatus] || STATUS_LABELS.inactive;
  const hasActiveSubscription = ['active', 'trialing'].includes(subStatus);
  const billingEnabled = billingStatus?.billing_enabled ?? false;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-text">Facturación</h1>
        <p className="text-sm text-muted mt-1">Gestiona tu plan y suscripción.</p>
      </div>

      {/* Current status card */}
      <div className="card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted font-medium uppercase tracking-wide">Plan actual</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-bold text-text capitalize">{currentPlanId}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
        </div>
        {hasActiveSubscription && billingStatus?.stripe_customer_id && (
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="btn-secondary flex items-center gap-2"
          >
            {portalLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Gestionar suscripción
          </button>
        )}
      </div>

      {/* Success banner */}
      {typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('success') && (
          <div className="alert-success flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            ¡Suscripción activada correctamente! Bienvenido al plan{' '}
            <span className="font-semibold capitalize">{currentPlanId}</span>.
          </div>
        )}

      {error && (
        <div className="alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!billingEnabled && (
        <div className="alert-warning flex items-center gap-3">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            El módulo de facturación está desactivado. Actívalo con{' '}
            <code>FEATURE_BILLING=true</code> y configura las claves de Stripe.
          </span>
        </div>
      )}

      {/* Plans grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text">Planes disponibles</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isDowngrade =
              (plan.id === 'basico' && currentPlanId !== 'basico') ||
              (plan.id === 'pro' && currentPlanId === 'enterprise');

            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-xl border p-5 ${
                  isCurrent
                    ? 'border-primary bg-primary/5'
                    : plan.id === 'pro'
                      ? 'border-primary/30 shadow-sm'
                      : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-text">{plan.nombre}</span>
                  {plan.id === 'pro' && (
                    <span className="flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                      <Star className="h-3 w-3" />
                      Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                      Actual
                    </span>
                  )}
                </div>

                <p className="text-2xl font-bold text-text mb-1">
                  {plan.precio_clp ? (
                    <>
                      ${plan.precio_clp.toLocaleString('es-CL')}
                      <span className="text-sm font-normal text-muted">/mes</span>
                    </>
                  ) : (
                    'Gratis'
                  )}
                </p>
                <p className="text-xs text-muted mb-4">{plan.descripcion}</p>

                <ul className="flex-1 space-y-1.5 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                      <span className="text-muted">{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button disabled className="btn-secondary w-full opacity-60 cursor-default">
                    Plan actual
                  </button>
                ) : isDowngrade ? (
                  <button
                    onClick={handlePortal}
                    disabled={!billingEnabled || portalLoading}
                    className="btn-secondary w-full text-sm"
                  >
                    Cambiar plan
                  </button>
                ) : plan.precio_clp ? (
                  <button
                    onClick={() => handleCheckout(plan.id)}
                    disabled={!billingEnabled || checkoutLoading === plan.id}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {checkoutLoading === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        Suscribirse
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted">
        Los pagos son procesados de forma segura por Stripe. Al suscribirte aceptas nuestros
        términos de servicio. Puedes cancelar en cualquier momento desde el portal de facturación.
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';

import type { PlanResumen } from '@/types/cuenta';

/**
 * "2 de 3 asientos" junto al equipo.
 *
 * Avisar antes vale más que el 402: cuando el tope salta, quien invita ya
 * escribió el correo de un compañero y descubre ahí que no cabe. Los números
 * vienen del backend (`/api/empresas/{id}/plan`) — replicar `PLAN_QUOTAS` aquí
 * los desincroniza al primer cambio de precios y nadie se entera.
 */
export default function UsoDeAsientos({ plan }: { plan: PlanResumen }) {
  const { max_usuarios: limite } = plan.limites;
  const usados = plan.uso.usuarios;

  if (limite === null) {
    return (
      <p className="text-xs text-muted">
        {usados} {usados === 1 ? 'miembro' : 'miembros'} · asientos ilimitados en{' '}
        {plan.etiqueta}
      </p>
    );
  }

  const lleno = usados >= limite;
  // Con el plan lleno el aviso es la información principal, no un adorno.
  const tono = lleno ? 'text-gold' : 'text-muted';

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`flex items-center gap-1.5 text-xs ${tono}`}>
        <Users className="w-3.5 h-3.5" />
        <span className="cifra">
          {usados} de {limite}
        </span>{' '}
        {limite === 1 ? 'asiento' : 'asientos'} · plan {plan.etiqueta}
        {plan.en_trial && ' (prueba)'}
      </span>
      {lleno && plan.siguiente_tier && (
        <Link
          href="/dashboard/billing"
          className="text-xs font-semibold text-gold hover:underline"
        >
          Ampliar plan →
        </Link>
      )}
    </div>
  );
}

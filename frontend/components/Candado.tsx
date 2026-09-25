'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';

/**
 * Lo que tu plan no incluye, con candado y explicación — no escondido.
 *
 * **Por qué importa más aquí que en la competencia.** Lo que estaría detrás del
 * candado es el BI, que es el argumento entero de compra: esconderlo hace que el
 * producto parezca más pobre de lo que es, y quien no sabe que existe no lo
 * puede querer.
 *
 * Y el momento importa. Hoy el 402 del backend llega al `PlanUpgradeBanner`
 * **después** de intentar la acción: el usuario pulsa, espera, y recibe un
 * bloqueo. El candado lo dice antes de que pulse, que es la diferencia entre una
 * invitación y un portazo.
 *
 * Esto no sustituye al 402 — lo complementa. El límite lo sigue aplicando el
 * servidor: un candado en el cliente es una cortesía, nunca una protección.
 */

export function Candado({
  capacidad,
  children,
}: {
  /** Qué se está tapando, en las palabras del usuario. Ej: "el perfil del comprador". */
  capacidad: string;
  /** La vista real, que se pinta apagada y sin poder tocarse. */
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      {children && (
        <div
          aria-hidden="true"
          className="pointer-events-none select-none opacity-25 blur-[2px]"
        >
          {children}
        </div>
      )}

      <div
        className={`flex flex-col items-center gap-2 px-5 text-center ${
          children ? 'absolute inset-0 justify-center bg-surface/70 backdrop-blur-[1px]' : 'py-8'
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15">
          <Lock className="h-4 w-4 text-gold" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-text">Con el plan Pro ves {capacidad}</p>
        <Link href="/dashboard/billing" className="btn-primary text-xs">
          {/* No «Probar 14 días gratis»: el trial arranca al crear la empresa,
              así que quien ve un candado ya lo usó. */}
          Ver el plan Pro
        </Link>
      </div>
    </div>
  );
}

/**
 * La versión de una línea, para meterla dentro de una lista sin romper el flujo.
 */
export function CandadoEnLinea({ capacidad }: { capacidad: string }) {
  return (
    <Link
      href="/dashboard/billing"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/[0.07] px-2.5 py-1 text-xs font-medium text-text transition-colors hover:border-gold/60"
    >
      <Lock className="h-3 w-3 text-gold" aria-hidden="true" />
      {capacidad} · con Pro
    </Link>
  );
}

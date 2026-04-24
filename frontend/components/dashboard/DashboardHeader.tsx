'use client';

import { useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import type { DashboardHomeResponse } from '@/types/dashboardHome';
import { buildNarrative } from '@/lib/narrative';
import { EmpresaSwitcher } from './EmpresaSwitcher';

interface Props {
  data: DashboardHomeResponse;
  firstName: string;
  onEmpresaSwitch: (id: string) => void;
}

export function DashboardHeader({ data, firstName, onEmpresaSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const lines = buildNarrative({ data, firstName, now: new Date() });

  return (
    <>
      <div className="card p-4 sm:p-5">
        {data.empresa && (
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Building2 size={13} />
            <span>
              Actuando como <span className="font-semibold text-text">{data.empresa.nombre}</span>
              {' · '}
              <span>{data.empresa.rut}</span>
            </span>
            <button
              onClick={() => setOpen(true)}
              className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Cambiar <ChevronDown size={12} />
            </button>
          </div>
        )}
        <div className="space-y-1">
          {lines.map((l, i) => (
            <p
              key={i}
              className={i === 0 ? 'text-base sm:text-lg font-semibold text-text' : 'text-sm text-muted'}
            >
              {l}
            </p>
          ))}
        </div>
      </div>
      <EmpresaSwitcher open={open} onClose={() => setOpen(false)} onSwitch={onEmpresaSwitch} />
    </>
  );
}

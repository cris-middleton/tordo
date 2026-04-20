'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react';

type Tab = 'matching' | 'precio' | 'descuento' | 'forecast';

interface HerramientasAvanzadasProps {
  rubro: string;
}

const TABS: Array<[Tab, string]> = [
  ['matching', 'Buscador semántico'],
  ['precio', 'Precio histórico'],
  ['descuento', 'Descuentos'],
  ['forecast', 'Competencia esperada'],
];

export function HerramientasAvanzadas({ rubro }: HerramientasAvanzadasProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('matching');

  return (
    <section className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <div>
            <h2 className="section-title">Herramientas avanzadas</h2>
            <p className="text-xs text-muted mt-0.5">
              Buscador semántico, calculadora de precio, descuentos y pronóstico de competencia.
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted shrink-0" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-[120px]">
            {tab === 'matching' && <p className="text-sm text-muted">Próximamente — Task 3.2 agrega el buscador semántico.</p>}
            {tab === 'precio' && <p className="text-sm text-muted">Próximamente — Task 3.3 agrega la calculadora de precio histórico.</p>}
            {tab === 'descuento' && <p className="text-sm text-muted">Próximamente — Task 3.4 agrega la tabla narrativa de descuentos.</p>}
            {tab === 'forecast' && <p className="text-sm text-muted">Próximamente — Task 3.5 agrega el pronóstico de competencia.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

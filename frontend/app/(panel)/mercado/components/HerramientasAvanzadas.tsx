'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react';

import type { OrganismoConNombre } from '../types';
import type { HerramientasAvanzadasProps, Tab } from './herramientas/comun';
import TabDescuento from './herramientas/TabDescuento';
import TabForecast from './herramientas/TabForecast';
import TabPrecio from './herramientas/TabPrecio';
import TabSimulador from './herramientas/TabSimulador';

/**
 * El conmutador de las cuatro herramientas avanzadas.
 *
 * Cada pestaña vive en su propio fichero: juntas pasaban de las 900 líneas y no
 * comparten nada salvo el mensaje de error y un par de tipos, que están en
 * `herramientas/comun.ts`.
 *
 * Sólo se monta la pestaña activa, así que las otras tres no piden datos.
 *
 * «Quién vende esto» (texto libre → proveedores) se retiró en el paso 8 del
 * pivote público: lo calculaba un modelo TF-IDF cargado en la API, y un texto
 * arbitrario no se puede precalcular. Quién vende en un rubro lo responde el
 * panorama; a un comprador concreto, su panel de competidores.
 */

const TABS: Array<[Tab, string]> = [
  ['precio', 'Precio histórico'],
  ['descuento', 'Descuentos'],
  ['forecast', 'Competencia esperada'],
  ['simular', '🎯 Simulador pre-bid'],
];

export function HerramientasAvanzadas({ rubro, topOrganismos, allRubros = [] }: HerramientasAvanzadasProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('precio');

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
              A qué precio, con qué descuento y contra cuánta competencia.
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
            {tab === 'precio' && <TabPrecio organismosConNombre={topOrganismos} />}
            {tab === 'descuento' && <TabDescuento rubro={rubro} />}
            {tab === 'forecast' && <TabForecast rubro={rubro} />}
            {tab === 'simular' && <TabSimulador rubroInicial={rubro} organismosConNombre={topOrganismos} allRubros={allRubros} />}
          </div>
        </div>
      )}
    </section>
  );
}

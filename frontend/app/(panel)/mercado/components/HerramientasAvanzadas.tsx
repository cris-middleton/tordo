'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  ['precio', 'Precio de un producto'],
  ['descuento', 'Descuentos'],
  ['forecast', 'Cuántos postulan'],
  ['simular', 'Simular una licitación'],
];

export function HerramientasAvanzadas({ rubro, topOrganismos, allRubros = [] }: HerramientasAvanzadasProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('precio');

  return (
    <section className="border-t border-border pt-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="section-title">Cálculos para postular</h2>
          <p className="mt-1 text-sm text-muted">
            A qué precio se compró un producto, cuánto bajo el presupuesto se adjudica y cuántos suelen postular.
          </p>
        </div>
        {open ? <ChevronUp className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" /> : <ChevronDown className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
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

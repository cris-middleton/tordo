// frontend/app/(panel)/mercado/components/EstacionalidadSection.tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Columnas } from '@/components/graficos/Columnas';
import { EstacionalidadMes, MESES, OrganismoConNombre } from '../types';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { useEstacionalidad } from '@/lib/queries';
import { decimal } from '@/lib/formato';
import { normalizeText } from '@/lib/nombresChile';

interface EstacionalidadSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
  focused?: boolean; // when true, hide the organismo dropdown (filter is shown in filter bar chip)
  focusedNombre?: string; // NEW: display name of the focused organismo
}

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «enero, febrero y octubre». */
const enLista = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

export function EstacionalidadSection({ topOrganismos, rubro, focusedOrganismo, focused, focusedNombre }: EstacionalidadSectionProps) {
  // El organismo mostrado se DERIVA, no se sincroniza con dos efectos: manda el
  // enfocado si lo hay, si no el que el usuario haya elegido, y si no el primero
  // de la lista. Los efectos que hacían eso competían entre sí — uno reponía el
  // primero justo después de que el otro pusiera el enfocado.
  const [orgElegido, setSelectedOrg] = useState('');
  const selectedOrg = focusedOrganismo?.codigo || orgElegido || topOrganismos[0]?.codigo || '';

  // Combine topOrganismos with focusedOrganismo if it's not already in the list
  const optionsOrganismos = focusedOrganismo && !topOrganismos.find((o) => o.codigo === focusedOrganismo.codigo)
    ? [focusedOrganismo, ...topOrganismos]
    : topOrganismos;

  const selectedOrgNombre = optionsOrganismos.find((o) => o.codigo === selectedOrg)?.nombre
    || selectedOrg;

  const consulta = useEstacionalidad(selectedOrg || undefined, rubro);
  const { data: res, isFetching } = consulta;
  const patrones = ((res?.disponible ? res.patrones : []) ?? []) as EstacionalidadMes[];
  const loading = Boolean(selectedOrg) && isFetching;

  const meses = Array.from({ length: 12 }, (_, i) => {
    const found = patrones.find((p) => p.mes === i + 1);
    return {
      mes: i + 1,
      etiqueta: MESES[i].toLowerCase(),
      prob: found?.prob_mes ?? 0,
      pico: found?.es_pico_estacional ?? false,
    };
  });
  const picoMeses = meses.filter((m) => m.pico).map((m) => MESES_LARGOS[m.mes - 1]);
  const conclusion =
    picoMeses.length > 0
      ? `Compra sobre todo en ${enLista(picoMeses)}.`
      : 'No tiene meses en que compre más que en el resto.';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-lg font-semibold text-text">En qué meses compra</h3>
          <p className="mt-1 text-sm text-muted">
            {focused && focusedNombre ? (
              <>
                <span className="font-medium text-text">{focusedNombre}</span>: qué parte de sus compras del rubro cae en cada
                mes.
              </>
            ) : (
              'Qué parte de sus compras del rubro cae en cada mes.'
            )}
          </p>
        </div>

        {!focused && optionsOrganismos.length > 1 && (
          <select
            aria-label="Organismo"
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            disabled={!!focusedOrganismo}
            className="h-11 min-w-0 max-w-full rounded-lg border border-borderInput bg-surface px-3 text-base text-text disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {optionsOrganismos.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {normalizeText(o.nombre.length > 40 ? `${o.nombre.slice(0, 40)}…` : o.nombre)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* El error va antes que el spinner: durante un «Reintentar» `isFetching` es
          true y `isError` también, y no debe volver a girar sin decir qué pasó. */}
      {consulta.isError ? (
        <ErrorDeCarga
          titulo="No pudimos cargar los meses de compra"
          error={consulta.error}
          onReintentar={() => void consulta.refetch()}
          reintentando={consulta.isFetching}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      ) : patrones.length === 0 ? (
        <p className="py-6 text-sm text-muted">Este organismo no tiene compras del rubro en los años con datos.</p>
      ) : (
        <div className="max-w-3xl">
          <p className="font-semibold text-text">{conclusion}</p>
          <div className="mt-4">
            <Columnas
              etiqueta="Parte de sus compras del rubro en cada mes"
              columnas={meses.map((m) => ({
                clave: String(m.mes),
                etiqueta: m.etiqueta,
                valor: m.prob,
                texto: `${decimal(m.prob * 100, 0)}%`,
                destacada: m.pico,
              }))}
            />
          </div>
          {picoMeses.length > 0 && (
            <p className="mt-3 text-sm text-muted">
              En color, los meses en que compra más que en el resto, año tras año.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

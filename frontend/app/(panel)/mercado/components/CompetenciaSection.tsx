// frontend/app/(panel)/mercado/components/CompetenciaSection.tsx
'use client';

import { Loader2 } from 'lucide-react';

import { BarrasHorizontales } from '@/components/graficos/BarrasHorizontales';
import { CompetidorItem, ConcentracionItem, OrganismoConNombre } from '../types';
import { textoPeriodo } from '@/lib/periodo';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { useCompetidores } from '@/lib/queries';
import { InfoTooltip } from '@/components/bi/InfoTooltip';
import { decimal } from '@/lib/formato';
import { normalizeText } from '@/lib/nombresChile';

interface CompetenciaSectionProps {
  topOrganismos: OrganismoConNombre[];
  selectedOrganismo: string;
  onOrganismoChange: (o: string) => void;
  rubro: string;
  disabled?: boolean;
  focused?: boolean; // when true, hide the organismo dropdown (filter is shown in filter bar chip)
  focusedNombre?: string; // NEW: display name of the focused organismo
}

export function CompetenciaSection({
  topOrganismos,
  selectedOrganismo,
  onOrganismoChange,
  rubro,
  disabled,
  focused,
  focusedNombre,
}: CompetenciaSectionProps) {
  const consulta = useCompetidores(selectedOrganismo || undefined, rubro);
  const { data: res, isPending } = consulta;
  // Se conserva la regla anterior: si el backend dice `disponible: false`, se
  // trata como si no hubiera datos, no como un error.
  const competidores = ((res?.disponible ? res.competidores : []) ?? []) as CompetidorItem[];
  const concentracion = ((res?.disponible ? res.concentracion : []) ?? []) as ConcentracionItem[];
  const loading = Boolean(selectedOrganismo) && isPending;
  // Una cuota sin periodo se lee como «de siempre»: son los últimos 36 meses.
  const periodo = res?.disponible ? textoPeriodo(res.periodo) : null;

  const tipoMercado = concentracion[0]?.tipo_mercado;
  const nProveedores = concentracion[0]?.n_proveedores;

  // Normaliza tipo_mercado del backend a una sola palabra capitalizada
  function tipoLabelCorto(tipo: string | null | undefined): string {
    if (!tipo) return '';
    const lower = tipo.toLowerCase().trim();
    const known: Record<string, string> = {
      concentrado: 'Concentrado',
      moderado: 'Moderado',
      fragmentado: 'Fragmentado',
      // Nombre anterior del mismo tramo; sigue llegando hasta la próxima
      // materialización semanal de analytics.
      competitivo: 'Fragmentado',
    };
    if (known[lower]) return known[lower];
    // Fallback: capitaliza primera letra del string raw del backend
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-lg font-semibold text-text">Quién le vende</h3>
          <p className="mt-1 text-sm text-muted">
            {focused && focusedNombre ? (
              <>
                Los proveedores de <span className="font-medium text-text">{focusedNombre}</span> en este rubro, por su
                parte de lo que compra.
              </>
            ) : (
              'Los proveedores de este organismo en el rubro, por su parte de lo que compra.'
            )}
          </p>
        </div>

        {!focused && topOrganismos.length > 1 && (
          <select
            aria-label="Organismo"
            value={selectedOrganismo}
            onChange={(e) => onOrganismoChange(e.target.value)}
            disabled={disabled}
            className="h-11 min-w-0 max-w-full rounded-lg border border-borderInput bg-surface px-3 text-base text-text disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {topOrganismos.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {normalizeText(o.nombre.length > 40 ? `${o.nombre.slice(0, 40)}…` : o.nombre)}
              </option>
            ))}
          </select>
        )}
      </div>

      {tipoMercado && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-text">
            {nProveedores != null ? `${nProveedores.toLocaleString('es-CL')} ${nProveedores === 1 ? 'proveedor' : 'proveedores'}.` : ''}
          </span>
          <span className="text-muted">
            Mercado{' '}
            <InfoTooltip
              content={
                /* Había una cuarta entrada, «Competitivo: alta rotación entre
                   proveedores», y sobraba por dos motivos.

                   Uno: `tipoLabelCorto` mapea `competitivo` a «Fragmentado»
                   —es el nombre viejo del mismo tramo—, así que esa etiqueta no
                   se puede pintar nunca. El usuario abría la ayuda para
                   entender qué significa lo que está leyendo y se encontraba
                   una categoría fantasma.

                   Dos: la definición era falsa. Lo que mide este índice es
                   CONCENTRACIÓN, no rotación; «competitivo» además se lee al
                   revés de lo que significa, que es justo por lo que se
                   renombró el tramo.

                   Los textos se alinean con los de `PanoramaRubro`, que ya
                   decían qué implica cada tramo para quien va a postular en vez
                   de describir el índice. */
                <div className="space-y-1.5">
                  <p><b>Concentrado:</b> pocos proveedores se llevan casi todo. Entrar cuesta más.</p>
                  <p><b>Moderado:</b> hay competidores fuertes, pero el mercado no está cerrado.</p>
                  <p><b>Fragmentado:</b> muchos proveedores se reparten el mercado. Hay espacio.</p>
                </div>
              }
            >
              <span className="font-medium text-text">{tipoLabelCorto(tipoMercado)}</span>
            </InfoTooltip>
          </span>
        </div>
      )}

      {periodo && <p className="text-sm text-muted">Participación de {periodo}.</p>}

      {consulta.isError ? (
        <ErrorDeCarga
          titulo="No pudimos cargar la competencia"
          error={consulta.error}
          onReintentar={() => void consulta.refetch()}
          reintentando={consulta.isFetching}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : competidores.length === 0 ? (
        <p className="py-6 text-sm text-muted">Este organismo no tiene órdenes de compra en el rubro.</p>
      ) : (
        <div className="max-w-3xl">
        <BarrasHorizontales
          etiqueta="Participación de cada proveedor en lo que compra este organismo"
          filas={competidores.slice(0, 10).map((c) => ({
            clave: c.CodigoProveedor,
            etiqueta: c.NombreProveedor,
            valor: c.market_share_pct,
            texto: `${decimal(c.market_share_pct, 1)} %`,
            detalle: `${c.n_oc.toLocaleString('es-CL')} ${c.n_oc === 1 ? 'orden' : 'órdenes'} de compra; tasa de adjudicación ${decimal(c.win_rate_pct, 0)} %`,
          }))}
        />
        </div>
      )}
    </section>
  );
}

'use client';

import { Loader2 } from 'lucide-react';

import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { decimal } from '@/lib/formato';
import { normalizeText } from '@/lib/nombresChile';
import { useComprador } from '@/lib/queries';

import { CompradorResult, OrganismoConNombre } from '../types';

interface CompradorSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
  focusedNombre?: string;
}

function pctOpc(v?: number | null): string {
  return v == null ? '—' : `${decimal(v * 100, 0)}\u00a0%`;
}

/** Las señales del historial, en palabras y sin alarma: lo que el dato dice, no un juicio. */
function senales(f: CompradorResult['risk_flags']): string[] {
  if (!f || f.n_flags === 0) return [];
  return [
    f.aceptacion_lenta && 'sus órdenes tardan en aceptarse',
    f.aceptacion_impredecible && 'el plazo de aceptación varía mucho',
    f.cancelaciones && 'cancela seguido',
    f.licitaciones_fallidas && 'declara desierto seguido',
    f.baja_calificacion && 'los proveedores lo califican bajo',
    f.compras_irregulares && 'compra de forma irregular en el año',
  ].filter(Boolean) as string[];
}

/**
 * Un comprador en una fila: su nota de 0 a 10 y los tres números de los que
 * sale lo que importa para decidir —cuánto adjudica de lo que llama, cuánto
 * cancela, cuántas órdenes le aceptan—, y sus señales en palabras.
 *
 * Antes era un acordeón con la nota en un color de semáforo y una insignia
 * «excelente» que se leía como recomendación, bajo la pregunta «¿Son confiables
 * los organismos que más compran?», que el dato no responde.
 */
function FilaComprador({ organismoId }: { organismoId: string }) {
  const consulta = useComprador(organismoId);
  const { data: respuesta, isPending: loading } = consulta;
  const data = (respuesta ?? null) as CompradorResult | null;

  if (loading) {
    return (
      <li className="flex items-center gap-2 py-4 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando el comprador
      </li>
    );
  }
  // Un error NO es «sin datos»: decir que el organismo no tiene datos cuando la
  // API no respondió es una conclusión de negocio falsa.
  if (consulta.isError) {
    return (
      <li className="py-4">
        <ErrorDeCarga
          titulo="No pudimos cargar este comprador"
          error={consulta.error}
          onReintentar={() => void consulta.refetch()}
          reintentando={consulta.isFetching}
        />
      </li>
    );
  }
  if (!data?.disponible) {
    return <li className="py-4 text-sm text-muted">Todavía no tenemos historia del comprador {organismoId}.</li>;
  }

  const nota = data.buyer_score != null ? data.buyer_score * 10 : null;
  const cifras = [
    { etiqueta: 'Nota como comprador', valor: nota != null ? `${decimal(nota, 1)} de 10` : '—' },
    { etiqueta: 'Adjudica', valor: pctOpc(data.tramitacion?.tasa_adjudicacion), detalle: 'de lo que licita' },
    { etiqueta: 'Cancela', valor: pctOpc(data.tramitacion?.tasa_cancelacion), detalle: 'de sus órdenes' },
    { etiqueta: 'Aceptadas', valor: pctOpc(data.tramitacion?.tasa_aceptacion), detalle: 'por el proveedor' },
  ];
  const lista = senales(data.risk_flags);

  return (
    <li className="py-4">
      <p className="font-semibold text-text">{normalizeText(data.nombre ?? organismoId)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {cifras.map((c) => (
          <div key={c.etiqueta}>
            <dt className="text-sm text-muted">{c.etiqueta}</dt>
            <dd className="cifra font-semibold text-text">{c.valor}</dd>
            {c.detalle && <dd className="text-sm text-muted">{c.detalle}</dd>}
          </div>
        ))}
      </dl>
      {lista.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          A tener en cuenta: {lista.join(', ')}.
        </p>
      )}
    </li>
  );
}

export function CompradoresSection({ topOrganismos, focusedOrganismo }: CompradorSectionProps) {
  const orgsAMostrar = focusedOrganismo ? [focusedOrganismo] : topOrganismos.slice(0, 3);
  // Los de `topOrganismos` son los primeros por PUNTAJE, no por volumen: el título
  // decía «los que más compran».
  const titulo = focusedOrganismo || orgsAMostrar.length === 1 ? 'Cómo compra' : 'Cómo compran los primeros de la lista';

  return (
    <section className="space-y-2">
      <div>
        <h3 className="font-sans text-lg font-semibold text-text">{titulo}</h3>
        <p className="mt-1 max-w-[65ch] text-sm text-muted">
          Qué parte de lo que licita adjudica, cuántas órdenes cancela y cuántas le aceptan los proveedores.
          La nota como comprador, de 0 a 10, mide cómo compra en todos sus rubros: junta esos tres datos y
          cuatro más de su historia. Por eso no coincide con la oportunidad de la tabla de arriba, que es la
          de este rubro.
        </p>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {orgsAMostrar.map((org) => (
          <FilaComprador key={org.codigo} organismoId={org.codigo} />
        ))}
      </ul>
    </section>
  );
}

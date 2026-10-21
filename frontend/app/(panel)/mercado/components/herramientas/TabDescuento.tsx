'use client';

import { Info, Loader2 } from 'lucide-react';

import { useDescuento } from '@/lib/queries';
import { extractErrorMessage, type DescuentoItem } from './comun';
import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

export default function TabDescuento({ rubro }: { rubro: string }) {
  const consulta = useDescuento(rubro || undefined);
  const res = consulta.data as { disponible?: boolean; descuentos?: DescuentoItem[]; motivo?: string } | undefined;
  const data: DescuentoItem[] = res?.disponible ? (res.descuentos ?? []) : [];
  const loading = Boolean(rubro) && consulta.isFetching;
  // Se conservan los dos tipos de mensaje: el del backend cuando dice que no hay
  // datos, y el traducido cuando la petición falla (límite de consultas, módulo
  // apagado…). Perder esa distinción dejaría "no hay datos" ante un 429.
  const error = consulta.error
    ? extractErrorMessage(consulta.error)
    : res && !res.disponible
      ? motivoParaPersona(res.motivo, 'Sin datos de descuentos en este rubro.')
      : '';

  if (!rubro) {
    return (
      <p className="text-xs text-muted">
        Elige un rubro arriba para ver cuánto se descuenta.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Cargando descuentos…
      </div>
    );
  }

  if (error) {
    const isMissingParquet = error.toLowerCase().includes('parquet') || error.toLowerCase().includes('sin datos');
    return (
      <div className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
        isMissingParquet ? 'border-border bg-surface/60 text-muted' : 'border-danger/30 bg-danger/5 text-danger'
      }`}>
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          {isMissingParquet ? (
            <>
              <p className="font-medium text-text">Todavía no calculamos los descuentos de este rubro</p>
              <p className="text-xs mt-0.5">
                Si lo necesitas, escríbenos a hola@tordo.cl.
              </p>
            </>
          ) : error}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-xs text-muted">Sin datos de descuentos en este rubro.</p>;
  }

  // Ordenar por rango de oferentes para mostrar progresión competitiva
  const sortOrder: Record<string, number> = { '1': 1, '2-3': 2, '4-5': 3, '4+': 4, '5+': 5, '6+': 6 };
  const ordered = [...data].sort((a, b) => {
    const oa = sortOrder[a.n_oferentes_rango || ''] ?? 99;
    const ob = sortOrder[b.n_oferentes_rango || ''] ?? 99;
    return oa - ob;
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Cuánto bajo el presupuesto del comprador se adjudicó, según cuántos postularon. La mitad de las
        licitaciones bajó al menos lo que dice cada fila.
      </p>
      <ul className="space-y-2 text-sm">
        {ordered.slice(0, 6).map((d, i) => (
          <li key={`${d.n_oferentes_rango}-${i}`} className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium shrink-0">
              {d.n_oferentes_rango} postulante{d.n_oferentes_rango !== '1' ? 's' : ''}
            </span>
            <span className="text-text">
              <b>{d.p50 != null ? `${decimal(d.p50, 1)} %` : '—'}</b> bajo el presupuesto
              {d.p90 != null && (
                <span className="text-muted">; 1 de cada 10, {decimal(d.p90, 0)} % o más</span>
              )}
              {d.n != null && (
                <span className="text-xs text-subtle">. {d.n.toLocaleString('es-CL')} adjudicaciones</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

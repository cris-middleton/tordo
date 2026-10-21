'use client';

import type { UseQueryResult } from '@tanstack/react-query';

import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { useBILibre } from '@/lib/queries';
import { Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { OportunidadItem, ResumenMercado } from '../types';
import { decimal, monto } from '@/lib/formato';

interface CompareModeProps {
  rubroA: string;
  rubroB: string;
  allRubros: string[];
  onChangeRubroA: (r: string) => void;
  onChangeRubroB: (r: string) => void;
  onClose: () => void;
}

interface DatosRubro {
  resumen: ResumenMercado | null;
  oportunidades: OportunidadItem[];
}

/**
 * Lo que la columna de un rubro necesita, en dos llamadas.
 *
 * **Si una falla, falla la columna**: con `Promise.allSettled` un error se
 * tragaba y la columna enseñaba «0 oportunidades» y cifras vacías como si el
 * rubro no tuviera nada. Ahora la consulta queda en error y la columna lo dice,
 * con «Reintentar». Un `disponible: false` sí es «no hay datos».
 *
 * Ya no se pide `/bi/tendencia`: sólo servía de respaldo del crecimiento, y su
 * fila es la de UN organismo en el rubro, con el CAGR como fracción (un 25 %
 * salía «+0,3 %»). El crecimiento del rubro es `cagr_pct` del resumen.
 */
async function loadRubroData(rubro: string): Promise<DatosRubro> {
  const [resumen, op] = await Promise.all([
    apiClient.getBIResumen(rubro),
    apiClient.getBIOportunidades({ rubro, min_score: 4, limit: 10 }),
  ]);
  return {
    resumen: resumen ?? null,
    oportunidades: op?.disponible ? (op.oportunidades ?? []) : [],
  };
}

const formatCLPShort = (v: number): string => monto(v);

function RubroColumn({ rubro, consulta }: { rubro: string; consulta: UseQueryResult<DatosRubro> }) {
  // El error antes que el spinner: durante un «Reintentar» las dos cosas son
  // ciertas, y no debe volver a girar sin decir qué pasó.
  if (consulta.isError) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text truncate" title={rubro}>{rubro}</h3>
        <ErrorDeCarga
          titulo="No pudimos cargar este rubro"
          error={consulta.error}
          onReintentar={() => void consulta.refetch()}
          reintentando={consulta.isFetching}
        />
      </div>
    );
  }
  if (!consulta.data) {
    return (
      <div className="card flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }
  const data = consulta.data;

  const maxScore = data.oportunidades.length > 0
    ? Math.max(...data.oportunidades.map((o) => o.opportunity_score))
    : 0;
  const avgCompetencia = data.oportunidades.length > 0
    ? data.oportunidades.reduce((s, o) => s + o.n_proveedores, 0) / data.oportunidades.length
    : 0;
  const cagr = data.resumen?.cagr_pct ?? null;
  const topComprador = data.resumen?.top_comprador?.nombre;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text truncate" title={rubro}>{rubro}</h3>

      <div className="card space-y-2.5 text-sm">
        {data.resumen?.monto_anual_clp != null && (
          <div>
            <p className="text-xs text-muted">Monto anual</p>
            <p className="cifra font-semibold text-text">{formatCLPShort(data.resumen.monto_anual_clp)}</p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted">Oportunidades encontradas</p>
          <p className="cifra font-semibold text-text">{data.oportunidades.length}</p>
        </div>

        {maxScore > 0 && (
          <div>
            <p className="text-xs text-muted">Mejor score</p>
            <p className="cifra font-semibold text-text">{decimal(maxScore, 1)}</p>
          </div>
        )}

        {cagr != null && (
          <div>
            <p className="text-xs text-muted">Crecimiento anual</p>
            <p className={`cifra font-semibold ${cagr >= 0 ? 'text-accent' : 'text-danger'}`}>
              {cagr > 0 ? '+' : ''}{decimal(cagr, 1)}%
            </p>
          </div>
        )}

        {data.resumen?.n_proveedores_actual != null && (
          <div>
            <p className="text-xs text-muted">Proveedores activos</p>
            <p className="cifra font-semibold text-text">
              {data.resumen.n_proveedores_actual.toLocaleString('es-CL')}
            </p>
          </div>
        )}

        {avgCompetencia > 0 && (
          <div>
            <p className="text-xs text-muted">Competencia promedio por oportunidad</p>
            <p className="font-semibold text-text">{Math.round(avgCompetencia)} proveedores</p>
          </div>
        )}

        {topComprador && (
          <div>
            <p className="text-xs text-muted">Quién más compra</p>
            <p className="font-semibold text-text text-sm" title={topComprador}>
              {topComprador.length > 35 ? `${topComprador.slice(0, 35)}\u2026` : topComprador}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function CompareMode({ rubroA, rubroB, allRubros, onChangeRubroA, onChangeRubroB, onClose }: CompareModeProps) {
  // Una consulta por rubro. Antes eran dos efectos casi idénticos que hacían
  // `setState` con el resultado; con la clave por rubro, cambiar de rubro cambia
  // la clave y el resultado llega solo — y comparar A con B ya no puede mezclar
  // respuestas si una tarda más que la otra.
  const consultaA = useBILibre('comparar-rubro', rubroA, () => loadRubroData(rubroA), Boolean(rubroA));
  const consultaB = useBILibre('comparar-rubro', rubroB, () => loadRubroData(rubroB), Boolean(rubroB));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-text">Comparando:</span>
        <select
          aria-label="Primer rubro"
          value={rubroA}
          onChange={(e) => onChangeRubroA(e.target.value)}
          className="input-field max-w-xs"
        >
          {allRubros.filter((r) => r !== rubroB).map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <span className="text-muted text-xs">vs.</span>
        <select
          aria-label="Segundo rubro"
          value={rubroB}
          onChange={(e) => onChangeRubroB(e.target.value)}
          className="input-field max-w-xs"
        >
          <option value="">Selecciona rubro para comparar</option>
          {allRubros.filter((r) => r !== rubroA).map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={onClose}
          className="ml-auto text-muted hover:text-danger transition-colors flex items-center gap-1"
          aria-label="Cerrar modo comparar"
        >
          <X className="h-4 w-4" />
          <span className="text-xs">Cerrar</span>
        </button>
      </div>

      {!rubroB ? (
        <div className="card text-sm text-muted text-center py-8">
          Selecciona el segundo rubro para ver la comparación.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RubroColumn rubro={rubroA} consulta={consultaA} />
          <RubroColumn rubro={rubroB} consulta={consultaB} />
        </div>
      )}
    </div>
  );
}

'use client';

import { useBILibre } from '@/lib/queries';
import { Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { OportunidadItem, ResumenMercado, TendenciaItem } from '../types';
import { decimal } from '@/lib/formato';

interface CompareModeProps {
  rubroA: string;
  rubroB: string;
  allRubros: string[];
  onChangeRubroA: (r: string) => void;
  onChangeRubroB: (r: string) => void;
  onClose: () => void;
}

interface RubroData {
  resumen: ResumenMercado | null;
  oportunidades: OportunidadItem[];
  tendencia: TendenciaItem | null;
  loading: boolean;
}

async function loadRubroData(rubro: string): Promise<Omit<RubroData, 'loading'>> {
  const [resumenRes, opRes, tendRes] = await Promise.allSettled([
    apiClient.getBIResumen(rubro),
    apiClient.getBIOportunidades({ rubro, min_score: 4, limit: 10 }),
    apiClient.getBITendencia({ rubro, limit: 5 }),
  ]);
  return {
    resumen: resumenRes.status === 'fulfilled' ? resumenRes.value : null,
    oportunidades:
      opRes.status === 'fulfilled' && opRes.value?.disponible
        ? (opRes.value.oportunidades ?? [])
        : [],
    tendencia:
      tendRes.status === 'fulfilled' && tendRes.value?.disponible
        ? (tendRes.value.tendencias?.find((t: TendenciaItem) => t.RubroN2 === rubro) ?? tendRes.value.tendencias?.[0] ?? null)
        : null,
  };
}

function formatCLPShort(v: number): string {
  if (v >= 1e12) return `CLP ${decimal(v / 1e12, 1)}B`;
  if (v >= 1e9) return `CLP ${decimal(v / 1e9, 1)} mil M`;
  if (v >= 1e6) return `CLP ${decimal(v / 1e6, 0)} M`;
  return `CLP ${v.toLocaleString('es-CL')}`;
}

function RubroColumn({ rubro, data }: { rubro: string; data: RubroData }) {
  if (data.loading) {
    return (
      <div className="card flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const maxScore = data.oportunidades.length > 0
    ? Math.max(...data.oportunidades.map((o) => o.opportunity_score))
    : 0;
  const avgCompetencia = data.oportunidades.length > 0
    ? data.oportunidades.reduce((s, o) => s + o.n_proveedores, 0) / data.oportunidades.length
    : 0;
  const cagr = data.resumen?.cagr_pct ?? data.tendencia?.cagr ?? null;
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

  const vacio: RubroData = { resumen: null, oportunidades: [], tendencia: null, loading: false };
  const dataA: RubroData = consultaA.data
    ? { ...(consultaA.data as RubroData), loading: false }
    : { ...vacio, loading: Boolean(rubroA) };
  const dataB: RubroData = consultaB.data
    ? { ...(consultaB.data as RubroData), loading: false }
    : { ...vacio, loading: Boolean(rubroB) };

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
          <RubroColumn rubro={rubroA} data={dataA} />
          <RubroColumn rubro={rubroB} data={dataB} />
        </div>
      )}
    </div>
  );
}

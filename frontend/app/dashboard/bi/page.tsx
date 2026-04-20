// frontend/app/dashboard/bi/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  OportunidadItem,
  OrganismoConNombre,
  ResumenMercado,
  SerieAnualPunto,
  TendenciaItem,
  TendenciaApiResponse,
  TFIDFPerfilData,
  PlanTier,
  isPaidPlan,
} from './types';
import { MarketSummaryCard } from './components/MarketSummaryCard';
import { RubroFilter } from './components/RubroFilter';
import { PlanGate } from './components/PlanGate';
import { OportunidadesSection } from './components/OportunidadesSection';
import { TendenciasSection } from './components/TendenciasSection';
import { CompetenciaSection } from './components/CompetenciaSection';
import { CompradoresSection } from './components/CompradoresSection';
import { EstacionalidadSection } from './components/EstacionalidadSection';
import { SectorOverview } from './components/SectorOverview';
import { CompradorCacheProvider } from './hooks/useCompradorCache';

function BIDisabledBanner() {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center">
      <div className="rounded-full bg-gold/15 p-4">
        <BarChart3 className="h-10 w-10 text-gold" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text">Módulo BI desactivado</h2>
        <p className="mt-2 text-sm text-muted max-w-md">
          La inteligencia de negocios requiere que el pipeline ETL de analytics haya generado
          los parquets de datos históricos (<code>etl/data/analytics/</code>) y que el flag{' '}
          <code>FEATURE_ANALYTICS=true</code> esté activo.
        </p>
      </div>
    </div>
  );
}

export default function BIPage() {
  const { user } = useAuth();
  const plan = (user?.plan_tier ?? 'basico') as PlanTier;
  const paid = isPaidPlan(plan);

  // ── Init state ─────────────────────────────────────────────────────────────
  const [biEnabled, setBiEnabled] = useState<boolean | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);

  // ── Empresa / perfil state ─────────────────────────────────────────────────
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<TFIDFPerfilData | null>(null);
  const [allRubros, setAllRubros] = useState<string[]>([]);

  // ── Rubro state ────────────────────────────────────────────────────────────
  const [availableRubros, setAvailableRubros] = useState<string[]>([]);
  const [selectedRubro, setSelectedRubro] = useState('');

  // ── Section data ───────────────────────────────────────────────────────────
  const [oportunidades, setOportunidades] = useState<OportunidadItem[]>([]);
  const [loadingOp, setLoadingOp] = useState(false);
  const [tendencias, setTendencias] = useState<TendenciaItem[]>([]);
  const [emergentes, setEmergentes] = useState<TendenciaItem[]>([]);
  const [serieAnual, setSerieAnual] = useState<SerieAnualPunto[] | null>(null);
  const [cagrRubro, setCagrRubro] = useState<number | null>(null);
  const [loadingTend, setLoadingTend] = useState(false);

  // ── Resumen state ──────────────────────────────────────────────────────────
  const [resumen, setResumen] = useState<ResumenMercado | null>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);

  // Derived: top 3 unique organismos con nombre resuelto
  // useMemo gives a stable reference so children don't get unnecessary new prop arrays
  const topOrganismos = useMemo<OrganismoConNombre[]>(() => {
    const seen = new Set<string>();
    const out: OrganismoConNombre[] = [];
    // Sample up to 10 items to ensure we find 3 distinct organismos even with duplicates
    for (const o of oportunidades.slice(0, 10)) {
      if (seen.has(o.CodigoOrganismoPublico)) continue;
      seen.add(o.CodigoOrganismoPublico);
      out.push({
        codigo: o.CodigoOrganismoPublico,
        nombre: o.NombreOrganismo || o.CodigoOrganismoPublico,
      });
      if (out.length >= 3) break;
    }
    return out;
  }, [oportunidades]);

  const [selectedCompOrg, setSelectedCompOrg] = useState('');
  useEffect(() => {
    if (topOrganismos.length > 0 && !selectedCompOrg) {
      setSelectedCompOrg(topOrganismos[0].codigo);
    }
  }, [topOrganismos, selectedCompOrg]);

  // ── Load oportunidades ─────────────────────────────────────────────────────
  const loadOportunidades = useCallback(async (rubro: string) => {
    setLoadingOp(true);
    try {
      const res = await apiClient.getBIOportunidades({
        rubro: rubro || undefined,
        min_score: 4,
        limit: 50,
      });
      if (res.disponible) setOportunidades(res.oportunidades ?? []);
      else setOportunidades([]);
    } catch {
      setOportunidades([]);
    } finally {
      setLoadingOp(false);
    }
  }, []);

  // ── Load tendencias ────────────────────────────────────────────────────────
  const loadTendencias = useCallback(async (rubro: string) => {
    setLoadingTend(true);
    try {
      const res: TendenciaApiResponse = await apiClient.getBITendencia({
        rubro: rubro || undefined,
        limit: 15,
      });
      if (res.disponible) {
        setTendencias(res.tendencias ?? []);
        setEmergentes(res.emergentes ?? []);
        setSerieAnual(res.serie_anual ?? null);
        setCagrRubro(res.cagr_rubro ?? null);
      } else {
        setTendencias([]);
        setEmergentes([]);
        setSerieAnual(null);
        setCagrRubro(null);
      }
    } catch {
      setTendencias([]);
      setEmergentes([]);
      setSerieAnual(null);
      setCagrRubro(null);
    } finally {
      setLoadingTend(false);
    }
  }, []);

  // ── Load resumen ───────────────────────────────────────────────────────────
  const loadResumen = useCallback(async (rubro: string) => {
    if (!rubro) { setResumen(null); return; }
    setLoadingResumen(true);
    try {
      const res = await apiClient.getBIResumen(rubro);
      setResumen(res);
    } catch {
      setResumen(null);
    } finally {
      setLoadingResumen(false);
    }
  }, []);

  // ── Rubro change handler ───────────────────────────────────────────────────
  const handleRubroChange = useCallback((rubro: string) => {
    setSelectedRubro(rubro);
    setOportunidades([]);
    setTendencias([]);
    setEmergentes([]);
    setSerieAnual(null);
    setCagrRubro(null);
    setSelectedCompOrg('');
    setResumen(null);
    loadOportunidades(rubro);
    loadTendencias(rubro);
    loadResumen(rubro);
  }, [loadOportunidades, loadTendencias, loadResumen]);

  // ── Init: load empresa + probe BI + seed rubros ────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoadingInit(true);
      try {
        // Load empresa context + standardized rubros list in parallel
        let empresaRubros: string[] = [];
        let perfilRubros: string[] = [];

        const [empresasRes, rubrosRes] = await Promise.allSettled([
          apiClient.getEmpresas(),
          apiClient.getBIRubros(),
        ]);

        if (!cancelled) {
          // Empresa context
          if (empresasRes.status === 'fulfilled' && empresasRes.value.length > 0) {
            const emp = empresasRes.value[0];
            setFirstEmpresaId(emp.id);
            if (emp.rubros_cpv?.length) empresaRubros = emp.rubros_cpv;

            // Load TF-IDF perfil non-blocking
            apiClient.getTFIDFPerfil(emp.id)
              .then((p: TFIDFPerfilData) => {
                if (cancelled) return;
                setPerfil(p);
                perfilRubros = p.rubros_usados ?? [];
              })
              .catch(() => {});
          }

          // Standardized rubros — A-Z, no NA
          if (rubrosRes.status === 'fulfilled' && rubrosRes.value.disponible) {
            const sorted = [...(rubrosRes.value.rubros ?? [])].sort((a: string, b: string) =>
              a.localeCompare(b, 'es')
            );
            setAllRubros(sorted);
            // Use as the main dropdown source too
            setAvailableRubros(sorted);
          }
        }
        if (cancelled) return;

        // Probe BI + load initial oportunidades
        // Default rubro: empresa > perfil > none (shows all)
        const firstRubro = empresaRubros[0] ?? perfilRubros[0] ?? '';
        const res = await apiClient.getBIOportunidades({
          rubro: firstRubro || undefined,
          min_score: 4,
          limit: 50,
        });
        if (cancelled) return;

        const enabled = res.disponible !== false;
        setBiEnabled(enabled);

        if (enabled) {
          const opData: OportunidadItem[] = res.oportunidades ?? [];
          setOportunidades(opData);
          setSelectedRubro(firstRubro);

          // Load tendencias and resumen in parallel
          loadTendencias(firstRubro);
          if (firstRubro) {
            loadResumen(firstRubro);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          setBiEnabled(status === 503 ? false : null);
        }
      } finally {
        if (!cancelled) {
          setLoadingInit(false);
          setInitialized(true);
        }
      }
    };

    init();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save perfil handler ────────────────────────────────────────────────────
  const handleSavePerfil = async (rubros: string[]) => {
    if (!firstEmpresaId) return;
    const updated = await apiClient.updateTFIDFPerfil(firstEmpresaId, { rubros_usados: rubros });
    setPerfil(updated);
    // availableRubros stays as the full standardized A-Z list — no change needed
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // ── Previews para el paywall de secciones gated ─────────────────────────
  const previewCompetencia = resumen?.teaser_competencia && resumen.teaser_competencia.lider_nombre ? (
    <p>
      {resumen.n_proveedores_actual != null && (
        <>
          En este mercado compites contra <b>{resumen.n_proveedores_actual.toLocaleString('es-CL')}</b> proveedores.{' '}
        </>
      )}
      {resumen.teaser_competencia.lider_share_pct != null && (
        <>
          El líder, <b>{resumen.teaser_competencia.lider_nombre}</b>, captura el{' '}
          <b>{resumen.teaser_competencia.lider_share_pct.toFixed(0)}%</b>.{' '}
        </>
      )}
      {resumen.teaser_competencia.tipo_mercado && (
        <>Mercado <b>{resumen.teaser_competencia.tipo_mercado}</b>.</>
      )}
    </p>
  ) : null;

  const previewCompradores = resumen?.top_comprador?.nombre ? (
    <p>
      El comprador más activo es <b>{resumen.top_comprador.nombre}</b>
      {resumen.top_comprador.pago_mediana_dias != null && (
        <>
          , que paga en promedio en <b>{resumen.top_comprador.pago_mediana_dias} día
          {resumen.top_comprador.pago_mediana_dias === 1 ? '' : 's'}</b>
          {resumen.top_comprador.clasificacion_pago && (
            <> ({resumen.top_comprador.clasificacion_pago})</>
          )}
        </>
      )}.
      {resumen.n_organismos != null && (
        <> Este mercado atiende a <b>{resumen.n_organismos.toLocaleString('es-CL')}</b> compradores en total.</>
      )}
    </p>
  ) : null;

  const previewEstacionalidad = resumen?.teaser_estacionalidad?.mes_pico_mayor ? (
    <p>
      El pico de compras suele ser en <b>{resumen.teaser_estacionalidad.mes_pico_mayor}</b>.
      {resumen.teaser_estacionalidad.consistencia_avg_pct != null && (
        <> Consistencia promedio del patrón: <b>{resumen.teaser_estacionalidad.consistencia_avg_pct}%</b>.</>
      )}
    </p>
  ) : null;

  if (loadingInit || !initialized) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (biEnabled === false) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Inteligencia de Mercado
        </h1>
        <BIDisabledBanner />
      </div>
    );
  }

  return (
    <CompradorCacheProvider>
    <div className="flex flex-col min-h-screen">
      {/* Sticky filter bar */}
      <RubroFilter
        rubros={availableRubros}
        selectedRubro={selectedRubro}
        onRubroChange={handleRubroChange}
        plan={plan}
        allRubros={allRubros}
        perfil={perfil}
        empresaId={firstEmpresaId}
        onSavePerfil={handleSavePerfil}
      />

      <div className="flex-1 space-y-6 p-4 pb-12">
        <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Inteligencia de Mercado
        </h1>

        {/* Sector overview banner — dismissible once per day */}
        <SectorOverview />

        {/* Narrative market summary */}
        <MarketSummaryCard resumen={resumen} loading={loadingResumen} />

        {/* § 1 — Always visible */}
        <OportunidadesSection oportunidades={oportunidades} loading={loadingOp} />

        {/* § 2 — Always visible */}
        <TendenciasSection tendencias={tendencias} emergentes={emergentes} loading={loadingTend} selectedRubro={selectedRubro} serieAnual={serieAnual} cagrRubro={cagrRubro} />

        {/* § 3 — Locked for basico */}
        <PlanGate
          locked={!paid}
          label="Análisis de competencia — plan PYME o superior"
          preview={previewCompetencia}
        >
          <CompetenciaSection
            topOrganismos={topOrganismos}
            selectedOrganismo={selectedCompOrg}
            onOrganismoChange={setSelectedCompOrg}
            rubro={selectedRubro}
          />
        </PlanGate>

        {/* § 4 — Locked for basico */}
        <PlanGate
          locked={!paid}
          label="Perfil de compradores — plan PYME o superior"
          preview={previewCompradores}
        >
          {topOrganismos.length > 0 && (
            <CompradoresSection topOrganismos={topOrganismos} rubro={selectedRubro} />
          )}
        </PlanGate>

        {/* § 5 — Locked for basico */}
        <PlanGate
          locked={!paid}
          label="Estacionalidad — plan PYME o superior"
          preview={previewEstacionalidad}
        >
          {topOrganismos.length > 0 && (
            <EstacionalidadSection topOrganismos={topOrganismos} rubro={selectedRubro} />
          )}
        </PlanGate>
      </div>
    </div>
    </CompradorCacheProvider>
  );
}

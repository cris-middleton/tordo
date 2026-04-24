// frontend/app/dashboard/bi/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, BarChart3, Target, Columns } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  OportunidadItem,
  OrganismoConNombre,
  ResumenMercado,
  MiPosicion,
  SerieAnualPunto,
  TendenciaItem,
  TendenciaApiResponse,
  TFIDFPerfilData,
  PlanTier,
  isPaidPlan,
} from './types';
import { BIOnboarding } from './components/BIOnboarding';
import { MarketSummaryCard } from './components/MarketSummaryCard';
import { MyPositionCard } from './components/MyPositionCard';
import { RubroFilter } from './components/RubroFilter';
import { PlanGate } from './components/PlanGate';
import { OportunidadesSection } from './components/OportunidadesSection';
import { TendenciasSection } from './components/TendenciasSection';
import { CompetenciaSection } from './components/CompetenciaSection';
import { CompradoresSection } from './components/CompradoresSection';
import { EstacionalidadSection } from './components/EstacionalidadSection';
import { HerramientasAvanzadas } from './components/HerramientasAvanzadas';
import { SectorOverview } from './components/SectorOverview';
import { CompradorCacheProvider } from './hooks/useCompradorCache';
import { CompareMode } from './components/CompareMode';

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

  // ── Mi posición state ──────────────────────────────────────────────────────
  const [miPosicion, setMiPosicion] = useState<MiPosicion | null>(null);
  const [loadingMiPosicion, setLoadingMiPosicion] = useState(false);

  // ── Compare mode ───────────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [rubroB, setRubroB] = useState('');

  // ── Focused organismo (cross-link §1 → §3/§4/§5) ──────────────────────────
  const [focusedOrganismo, setFocusedOrganismo] = useState<OrganismoConNombre | null>(null);

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

  // ── Load mi posición ───────────────────────────────────────────────────────
  const loadMiPosicion = useCallback(async (empresaId: string, rubro: string) => {
    if (!empresaId || !rubro) { setMiPosicion(null); return; }
    setLoadingMiPosicion(true);
    try {
      const res = await apiClient.getBIMiPosicion({ empresa_id: empresaId, rubro });
      setMiPosicion(res);
    } catch {
      setMiPosicion(null);
    } finally {
      setLoadingMiPosicion(false);
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
    setCompareMode(false);
    setRubroB('');
    setSelectedRubro(rubro);
    setOportunidades([]);
    setTendencias([]);
    setEmergentes([]);
    setSerieAnual(null);
    setCagrRubro(null);
    setSelectedCompOrg('');
    setResumen(null);
    setMiPosicion(null);
    setFocusedOrganismo(null);
    // loadOportunidades and loadTendencias work with rubro='' (no filter / show all)
    loadOportunidades(rubro);
    loadTendencias(rubro);
    // resumen and miPosicion require a specific rubro — skip if empty
    if (rubro) {
      loadResumen(rubro);
      if (firstEmpresaId) loadMiPosicion(firstEmpresaId, rubro);
    }
  }, [loadOportunidades, loadTendencias, loadResumen, loadMiPosicion, firstEmpresaId]);

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

  // ── Fire mi_posicion when firstEmpresaId or selectedRubro becomes available ─
  useEffect(() => {
    if (firstEmpresaId && selectedRubro) {
      loadMiPosicion(firstEmpresaId, selectedRubro);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEmpresaId, selectedRubro]);

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

  // Determine if user needs onboarding: new user with no rubros configured
  // - If empresa has rubros_cpv: selectedRubro is seeded from empresaRubros[0] → false → no onboarding (correct)
  // - If empresa has no rubros_cpv AND perfil.rubros_usados is empty → true → show onboarding (correct)
  // - If selectedRubro is '' but user chose "Todos los rubros": perfil.rubros_usados will still be populated
  //   from a prior save, so necesitaOnboarding stays false (correct)
  const necesitaOnboarding =
    initialized &&
    biEnabled !== false &&
    !perfil?.rubros_usados?.length &&
    !selectedRubro;

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
        focusedOrganismo={focusedOrganismo}
        onClearFocus={() => setFocusedOrganismo(null)}
      />

      <div className="flex-1 space-y-6 p-4 pb-12">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Inteligencia de Mercado
          </h1>
          {!compareMode && selectedRubro && (
            <button
              onClick={() => setCompareMode(true)}
              className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-primary hover:text-primary transition-colors"
            >
              <Columns className="h-4 w-4" />
              Comparar con otro rubro
            </button>
          )}
        </div>

        {compareMode ? (
          <CompareMode
            rubroA={selectedRubro}
            rubroB={rubroB}
            allRubros={allRubros}
            onChangeRubroA={(r) => setSelectedRubro(r)}
            onChangeRubroB={setRubroB}
            onClose={() => { setCompareMode(false); setRubroB(''); }}
          />
        ) : (
          <>
            {necesitaOnboarding ? (
              <BIOnboarding
                onConfigurarRubros={() => {
                  window.dispatchEvent(new CustomEvent('bi:open-rubros-modal'));
                }}
                onExplorarSinConfigurar={() => {
                  const primer = allRubros[0];
                  if (primer) handleRubroChange(primer);
                }}
              />
            ) : (
              <>
                {/* Sector overview banner — dismissible once per day */}
                <SectorOverview />

                {/* Narrative market summary + MyPositionCard en grid 2-col */}
                {(() => {
                  // showMyPosition: true si hay respuesta del backend (con o sin historial)
                  // miPosicion será null solo si el fetch aún no corrió o falló
                  const showMyPosition = !!miPosicion;
                  if (showMyPosition) {
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <MarketSummaryCard resumen={resumen} loading={loadingResumen} />
                        <MyPositionCard posicion={miPosicion} plan={plan} loading={loadingMiPosicion} />
                      </div>
                    );
                  }
                  // Solo MarketSummary — full width (fetch pendiente o falló)
                  return <MarketSummaryCard resumen={resumen} loading={loadingResumen} />;
                })()}

                {/* Focused organismo banner — single prominent banner between narrative and data */}
                {focusedOrganismo && (
                  <div className="rounded-xl border-l-4 border-accent bg-accent/10 px-4 py-3 flex items-center gap-3">
                    <Target className="h-5 w-5 text-accent shrink-0" />
                    <div className="flex-1 text-sm">
                      <p className="text-text">
                        <span className="text-muted">Filtrando análisis a:</span>{' '}
                        <span className="font-semibold">{focusedOrganismo.nombre}</span>
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        Las secciones de Competencia, Compradores y Estacionalidad muestran datos de este comprador.
                      </p>
                    </div>
                    <button
                      onClick={() => setFocusedOrganismo(null)}
                      className="text-xs text-muted hover:text-danger transition-colors font-medium shrink-0"
                    >
                      Quitar filtro
                    </button>
                  </div>
                )}

                {/* § 1 — Always visible */}
                <OportunidadesSection
                  oportunidades={oportunidades}
                  loading={loadingOp}
                  onFocusOrganismo={(o) => {
                    setFocusedOrganismo(o);
                    setTimeout(() => {
                      const el = document.querySelector('[data-section="competencia"]') as HTMLElement | null;
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                />

                {/* § 2 — Always visible */}
                <TendenciasSection tendencias={tendencias} emergentes={emergentes} loading={loadingTend} selectedRubro={selectedRubro} serieAnual={serieAnual} cagrRubro={cagrRubro} />

                {/* § 3 — Locked for basico */}
                <div data-section="competencia">
                  <PlanGate
                    locked={!paid}
                    label="Análisis de competencia — plan PYME o superior"
                    preview={previewCompetencia}
                  >
                    <CompetenciaSection
                      topOrganismos={topOrganismos}
                      selectedOrganismo={focusedOrganismo?.codigo || selectedCompOrg}
                      onOrganismoChange={setSelectedCompOrg}
                      rubro={selectedRubro}
                      disabled={!!focusedOrganismo}
                      focused={!!focusedOrganismo}
                      focusedNombre={focusedOrganismo?.nombre}
                    />
                  </PlanGate>
                </div>

                {/* § 4 — Locked for basico */}
                <PlanGate
                  locked={!paid}
                  label="Perfil de compradores — plan PYME o superior"
                  preview={previewCompradores}
                >
                  {(topOrganismos.length > 0 || focusedOrganismo) && (
                    <CompradoresSection
                      topOrganismos={topOrganismos}
                      rubro={selectedRubro}
                      focusedOrganismo={focusedOrganismo}
                      focusedNombre={focusedOrganismo?.nombre}
                    />
                  )}
                </PlanGate>

                {/* § 5 — Locked for basico */}
                <PlanGate
                  locked={!paid}
                  label="Estacionalidad — plan PYME o superior"
                  preview={previewEstacionalidad}
                >
                  {(topOrganismos.length > 0 || focusedOrganismo) && (
                    <EstacionalidadSection
                      topOrganismos={topOrganismos}
                      rubro={selectedRubro}
                      focusedOrganismo={focusedOrganismo}
                      focused={!!focusedOrganismo}
                      focusedNombre={focusedOrganismo?.nombre}
                    />
                  )}
                </PlanGate>

                {/* Herramientas avanzadas — colapsible al pie */}
                <HerramientasAvanzadas rubro={selectedRubro} topOrganismos={topOrganismos} />
              </>
            )}
          </>
        )}
      </div>
    </div>
    </CompradorCacheProvider>
  );
}

// frontend/app/dashboard/bi/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  OportunidadItem,
  TendenciaItem,
  ClusterItem,
  TFIDFPerfilData,
  PlanTier,
  isPaidPlan,
} from './types';
import { RubroFilter } from './components/RubroFilter';
import { PlanGate } from './components/PlanGate';
import { OportunidadesSection } from './components/OportunidadesSection';
import { TendenciasSection } from './components/TendenciasSection';
import { CompetenciaSection } from './components/CompetenciaSection';
import { CompradoresSection } from './components/CompradoresSection';
import { EstacionalidadSection } from './components/EstacionalidadSection';

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
  const [clusters, setClusters] = useState<ClusterItem[]>([]);

  // ── Rubro state ────────────────────────────────────────────────────────────
  const [availableRubros, setAvailableRubros] = useState<string[]>([]);
  const [selectedRubro, setSelectedRubro] = useState('');

  // ── Section data ───────────────────────────────────────────────────────────
  const [oportunidades, setOportunidades] = useState<OportunidadItem[]>([]);
  const [loadingOp, setLoadingOp] = useState(false);
  const [tendencias, setTendencias] = useState<TendenciaItem[]>([]);
  const [emergentes, setEmergentes] = useState<TendenciaItem[]>([]);
  const [loadingTend, setLoadingTend] = useState(false);

  // Derived: top 3 unique organismos from oportunidades
  const topOrganismos = [
    ...new Set(oportunidades.slice(0, 5).map((o) => o.CodigoOrganismoPublico)),
  ].slice(0, 3);

  const [selectedCompOrg, setSelectedCompOrg] = useState('');
  useEffect(() => {
    if (topOrganismos.length > 0 && !selectedCompOrg) {
      setSelectedCompOrg(topOrganismos[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topOrganismos.join(',')]);

  // ── Load oportunidades ─────────────────────────────────────────────────────
  const loadOportunidades = useCallback(async (rubro: string) => {
    setLoadingOp(true);
    try {
      const res = await apiClient.getBIOportunidades({
        rubro: rubro || undefined,
        min_score: 4,
        limit: 20,
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
      const res = await apiClient.getBITendencia({
        rubro: rubro || undefined,
        limit: 15,
      });
      if (res.disponible) {
        setTendencias(res.tendencias ?? []);
        setEmergentes(res.emergentes ?? []);
      } else {
        setTendencias([]);
        setEmergentes([]);
      }
    } catch {
      setTendencias([]);
      setEmergentes([]);
    } finally {
      setLoadingTend(false);
    }
  }, []);

  // ── Rubro change handler ───────────────────────────────────────────────────
  const handleRubroChange = useCallback((rubro: string) => {
    setSelectedRubro(rubro);
    setOportunidades([]);
    setTendencias([]);
    setEmergentes([]);
    setSelectedCompOrg('');
    loadOportunidades(rubro);
    loadTendencias(rubro);
  }, [loadOportunidades, loadTendencias]);

  // ── Init: load empresa + probe BI + seed rubros ────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoadingInit(true);
      try {
        // Load empresa context
        let empresaRubros: string[] = [];
        try {
          const empresas = await apiClient.getEmpresas();
          if (!cancelled && empresas.length > 0) {
            const emp = empresas[0];
            setFirstEmpresaId(emp.id);
            if (emp.rubros_cpv?.length) empresaRubros = emp.rubros_cpv;

            // Load TF-IDF perfil non-blocking
            apiClient.getTFIDFPerfil(emp.id)
              .then((p: TFIDFPerfilData) => {
                if (cancelled) return;
                setPerfil(p);
                if (empresaRubros.length === 0 && p.rubros_usados?.length) {
                  empresaRubros = p.rubros_usados;
                }
              })
              .catch(() => {});
          }
        } catch { /* no empresa */ }

        // Probe BI + load initial oportunidades in one call
        const firstRubro = empresaRubros[0] ?? '';
        const res = await apiClient.getBIOportunidades({
          rubro: firstRubro || undefined,
          min_score: 4,
          limit: 20,
        });
        if (cancelled) return;

        const enabled = res.disponible !== false;
        setBiEnabled(enabled);

        if (enabled) {
          const opData: OportunidadItem[] = res.oportunidades ?? [];
          setOportunidades(opData);

          // Build available rubros: empresa rubros + top rubros from results
          const dataRubros = [...new Set(opData.map((o) => o.RubroN2))].slice(0, 8);
          const merged = [...new Set([...empresaRubros, ...dataRubros])].slice(0, 15);
          setAvailableRubros(merged.length > 0 ? merged : dataRubros);
          setSelectedRubro(firstRubro || merged[0] || '');

          // Load tendencias in parallel
          loadTendencias(firstRubro);
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

    // Load clusters for edit modal non-blocking
    apiClient.getBIClusters(100)
      .then((res: any) => { if (res.disponible) setClusters(res.clusters ?? []); })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save perfil handler ────────────────────────────────────────────────────
  const handleSavePerfil = async (rubros: string[]) => {
    if (!firstEmpresaId) return;
    const updated = await apiClient.updateTFIDFPerfil(firstEmpresaId, { rubros_usados: rubros });
    setPerfil(updated);
    const merged = [...new Set([...rubros, ...availableRubros])].slice(0, 15);
    setAvailableRubros(merged);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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
    <div className="flex flex-col min-h-screen">
      {/* Sticky filter bar */}
      <RubroFilter
        rubros={availableRubros}
        selectedRubro={selectedRubro}
        onRubroChange={handleRubroChange}
        plan={plan}
        clusters={clusters}
        perfil={perfil}
        empresaId={firstEmpresaId}
        onSavePerfil={handleSavePerfil}
      />

      <div className="flex-1 space-y-6 p-4 pb-12">
        <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Inteligencia de Mercado
        </h1>

        {/* § 1 — Always visible */}
        <OportunidadesSection oportunidades={oportunidades} loading={loadingOp} />

        {/* § 2 — Always visible */}
        <TendenciasSection tendencias={tendencias} emergentes={emergentes} loading={loadingTend} />

        {/* § 3 — Locked for basico */}
        <PlanGate locked={!paid} label="Análisis de competencia — plan PYME o superior">
          <CompetenciaSection
            topOrganismos={topOrganismos}
            selectedOrganismo={selectedCompOrg}
            onOrganismoChange={setSelectedCompOrg}
            rubro={selectedRubro}
          />
        </PlanGate>

        {/* § 4 — Locked for basico */}
        <PlanGate locked={!paid} label="Perfil de compradores — plan PYME o superior">
          {topOrganismos.length > 0 && (
            <CompradoresSection topOrganismos={topOrganismos} rubro={selectedRubro} />
          )}
        </PlanGate>

        {/* § 5 — Locked for basico */}
        <PlanGate locked={!paid} label="Estacionalidad — plan PYME o superior">
          {topOrganismos.length > 0 && (
            <EstacionalidadSection topOrganismos={topOrganismos} rubro={selectedRubro} />
          )}
        </PlanGate>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FilePlus,
  Info,
  Loader2,
  MapPin,
} from 'lucide-react';

import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import BIPanelSection from '@/components/licitacion/BIPanelSection';
import EstadoHabilBadge from '@/components/licitacion/EstadoHabilBadge';
import PerfilEncajeWidget from '@/components/licitacion/PerfilEncajeWidget';
import { fmtCLP, normalizeTenderDetail } from '@/lib/licitacionDetalle';
import type { BIPanel, PerfilMatchResult, TenderDetail } from '@/types/licitacionDetalle';
import { BICard } from './components/BICard';
import type { PlanTier } from '../../bi/types';

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * El código viene de `useParams()` y NO de la prop `params`.
 *
 * Desde Next 16 `params` es una **Promesa**: leer `params.codigo` directamente
 * da `undefined`, la petición sale como `/api/tenders/codigo/undefined` y la
 * pantalla queda en "no pudimos cargar la información". Llevaba así desde la
 * actualización desde Next 14, y no lo vio nadie porque compila igual.
 *
 * `useParams()` es la forma correcta en un componente cliente; `use(params)` lo
 * sería si esto fuera un componente de servidor.
 */
export default function TenderDetailPage() {
  const router = useRouter();
  const codigoRuta = decodeURIComponent(String(useParams().codigo ?? ''));
  const { user } = useAuth();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BI panel
  const [biPanel, setBiPanel] = useState<BIPanel | null>(null);
  const [biLoading, setBiLoading] = useState(false);

  // TF-IDF encaje
  const [perfilMatch, setPerfilMatch] = useState<PerfilMatchResult | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);

  // Postulación
  const [creatingPost, setCreatingPost] = useState(false);
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);

  useEffect(() => {
    const loadTender = async () => {
      const codigo = codigoRuta;
      try {
        const response = await apiClient.getTenderByCode(codigo);
        setTender(response);
      } catch {
        setError('No pudimos cargar la información de la licitación seleccionada.');
      } finally {
        setLoading(false);
      }
    };
    loadTender();
  }, [codigoRuta]);

  // Load BI panel + encaje after tender is ready
  useEffect(() => {
    if (!tender) return;
    let active = true;
    const codigo = codigoRuta;

    // Get first empresa for per-empresa BI data and encaje check
    apiClient.getEmpresas().then((empresas: any[]) => {
      if (!active) return;
      const empresaId: string | undefined = empresas?.[0]?.id;
      if (empresaId) setFirstEmpresaId(empresaId);

      // BI panel
      const cod = tender?.codigo_externo ?? codigo
      if (!cod) return
      setBiLoading(true);
      apiClient
        .getBIPanel(cod, empresaId)
        .then((data: BIPanel) => { if (active) setBiPanel(data) })
        .catch(() => { if (active) setBiPanel(null) })   // 503 = feature disabled — fail silently
        .finally(() => { if (active) setBiLoading(false) });

      // Encaje
      const textoLicitacion = tender.nombre || '';
      if (textoLicitacion && empresaId) {
        setLoadingMatch(true);
        apiClient
          .getBILicitacionMatch(codigo, { empresa_id: empresaId, texto: textoLicitacion })
          .then((res: PerfilMatchResult) => { if (active) setPerfilMatch(res) })
          .catch(() => {/* TF-IDF not enabled — skip */})
          .finally(() => { if (active) setLoadingMatch(false) });
      }
    }).catch(() => {/* no empresas — skip */});

    return () => { active = false };
  }, [tender, codigoRuta]);

  const handleIniciarPostulacion = async () => {
    if (!tender || !firstEmpresaId) return;

    // If already tracked, go to postulaciones list
    if (biPanel?.postulacion_id) {
      router.push('/dashboard/postulaciones');
      return;
    }

    setCreatingPost(true);
    try {
      await apiClient.createPostulacion({
        empresa_id: firstEmpresaId,
        licitacion_id: tender.id,
      });
      router.push('/dashboard/postulaciones');
    } catch (err: any) {
      // Duplicate — already tracked
      if (err?.response?.status === 409) {
        router.push('/dashboard/postulaciones');
      }
    } finally {
      setCreatingPost(false);
    }
  };

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (amount === undefined || amount === null || Number.isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const tenderData = useMemo(() => {
    if (!tender) return null;
    return normalizeTenderDetail(tender);
  }, [tender]);

  const tenderCurrency =
    tenderData?.moneda && typeof tenderData.moneda === 'string' && tenderData.moneda.length
      ? tenderData.moneda
      : 'CLP';

  const isTracked = Boolean(biPanel?.postulacion_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="btn-secondary flex items-center gap-2"
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="page-title">Detalle Licitación</h1>
      </div>

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error}
        </div>
      ) : !tenderData ? (
        <div className="card p-6 text-muted">No se encontró la licitación solicitada.</div>
      ) : (
        <div className="space-y-6">
          {/* ── Header card ─────────────────────────────────────── */}
          <div className="card space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted">Código externo</p>
                <h2 className="text-2xl font-semibold text-text">{tenderData.codigo_externo}</h2>
                {/* Estado hábil badge from BI panel */}
                <EstadoHabilBadge estado={biPanel?.estado_habil} />
              </div>

              <div className="flex flex-col gap-2 sm:items-end sm:shrink-0">
                {tenderData.url_licitacion && (
                  <Link
                    href={tenderData.url_licitacion}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir en Mercado Público
                  </Link>
                )}

                {/* Postulación button — only shown when empresa exists */}
                {firstEmpresaId && (
                  <button
                    type="button"
                    onClick={handleIniciarPostulacion}
                    disabled={creatingPost}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isTracked
                        ? 'btn-secondary'
                        : 'bg-primary text-onPrimary hover:bg-primaryDark'
                    }`}
                  >
                    {creatingPost ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isTracked ? (
                      <FileCheck2 className="h-4 w-4" />
                    ) : (
                      <FilePlus className="h-4 w-4" />
                    )}
                    {isTracked ? 'Ver postulación' : 'Iniciar postulación'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm text-muted">Nombre</p>
              <p className="text-lg font-medium text-text">{tenderData.nombre}</p>
            </div>

            {tenderData.descripcion && (
              <div>
                <p className="text-sm text-muted">Descripción</p>
                <p className="text-sm leading-6 text-text">{tenderData.descripcion}</p>
              </div>
            )}
          </div>

          {/* ── Info cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <Calendar className="h-4 w-4 text-primary" />
                Fechas
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Publicación: </span>
                  {tenderData.fecha_publicacion
                    ? format(new Date(tenderData.fecha_publicacion), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Cierre: </span>
                  {tenderData.fecha_cierre
                    ? format(new Date(tenderData.fecha_cierre), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                {typeof tenderData.dias_publicacion === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días publicada: </span>
                    {tenderData.dias_publicacion}
                  </p>
                )}
                {typeof tenderData.dias_cierre === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días hasta cierre: </span>
                    {tenderData.dias_cierre}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <DollarSign className="h-4 w-4 text-primary" />
                Monto y clasificación
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Monto estimado: </span>
                  {formatCurrency(tenderData.monto_estimado, tenderCurrency)}
                </p>
                {tenderData.categoria && (
                  <p>
                    <span className="font-medium text-text">Categoría: </span>
                    {tenderData.categoria}
                  </p>
                )}
                {tenderData.tipo_licitacion && (
                  <p>
                    <span className="font-medium text-text">Tipo: </span>
                    {tenderData.tipo_licitacion}
                  </p>
                )}
                {tenderData.moneda && (
                  <p>
                    <span className="font-medium text-text">Moneda: </span>
                    {tenderData.moneda}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <MapPin className="h-4 w-4 text-primaryDark" />
                Ubicación y organismo
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Región: </span>
                  {tenderData.region || 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Comuna: </span>
                  {tenderData.comuna || 'Sin información'}
                </p>
                {tenderData.nombre_organismo && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Organismo público</p>
                      <p className="text-sm text-text">{tenderData.nombre_organismo}</p>
                      {tenderData.codigo_organismo && (
                        <p className="text-xs text-muted">Código: {tenderData.codigo_organismo}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Información adicional ────────────────────────────── */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Info className="h-4 w-4 text-primary" />
              Información adicional
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm text-muted sm:grid-cols-2">
              <div>
                <p className="font-medium text-text">Estado</p>
                <p>{tenderData.estado || 'Sin información'}</p>
              </div>
              <div>
                <p className="font-medium text-text">ID interno</p>
                <p>{tenderData.id}</p>
              </div>
            </div>
          </div>

          {/* ── BI Panel ─────────────────────────────────────────── */}
          <div className="mt-6">
            <h2 className="text-base font-semibold text-text mb-3">Análisis de Mercado</h2>
            {biLoading && (
              <div className="animate-pulse bg-border rounded-xl h-48 flex items-center justify-center">
                <span className="text-muted text-sm">Cargando análisis de mercado…</span>
              </div>
            )}
            {!biLoading && biPanel && (
              <BIPanelSection panel={biPanel} tender={tender ?? undefined} />
            )}
            {!biLoading && !biPanel && (
              <p className="text-sm text-muted italic bg-background rounded-xl px-4 py-3">
                Panel BI no disponible para esta licitación.
              </p>
            )}
          </div>

          {/* ── ¿Tu perfil encaja? ──────────────────────────────── */}
          <PerfilEncajeWidget loading={loadingMatch} result={perfilMatch} />

          {/* ── Inteligencia de mercado (collapsible summary) ─── */}
          <BICard
            codigoExterno={tenderData.codigo_externo}
            empresaId={firstEmpresaId ?? undefined}
            plan={(user?.plan_tier ?? 'basico') as PlanTier}
          />
        </div>
      )}
    </div>
  );
}

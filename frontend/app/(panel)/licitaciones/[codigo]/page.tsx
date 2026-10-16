'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
} from 'lucide-react';

import { useLicitacion, usePanelLicitacion } from '@/lib/queries';
import BIPanelSection from '@/components/licitacion/BIPanelSection';
import { normalizeTenderDetail } from '@/lib/licitacionDetalle';
import type { BIPanel, TenderDetail } from '@/types/licitacionDetalle';
import { BICard } from './components/BICard';

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

  // La licitación y su panel de BI salen de TanStack Query, como el resto del
  // estado de servidor. El panel comparte clave con `BICard`, así que las dos
  // piezas de la ficha hacen una sola petición. Un 503 (analítica apagada) o
  // un 404 dejan `panel` vacío y la sección lo dice.
  const consultaLicitacion = useLicitacion(codigoRuta || undefined);
  const tender = (consultaLicitacion.data ?? null) as TenderDetail | null;
  const loading = consultaLicitacion.isPending && Boolean(codigoRuta);
  const error = consultaLicitacion.isError
    ? 'No pudimos cargar la información de la licitación seleccionada.'
    : null;

  const consultaPanel = usePanelLicitacion(tender?.codigo_externo ?? undefined);
  const biPanel = (consultaPanel.data ?? null) as BIPanel | null;
  const biLoading = consultaPanel.isLoading;

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
                <h2 className="font-mono text-2xl font-medium text-text">{tenderData.codigo_externo}</h2>
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
                    ? format(new Date(tenderData.fecha_publicacion), 'd MMM yyyy', { locale: es })
                    : 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Cierre: </span>
                  {tenderData.fecha_cierre
                    ? format(new Date(tenderData.fecha_cierre), 'd MMM yyyy', { locale: es })
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
                        <p className="text-xs text-muted">
                          Código: <span className="font-mono">{tenderData.codigo_organismo}</span>
                        </p>
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
            <h2 className="text-base text-text mb-3">Análisis de Mercado</h2>
            {biLoading && (
              <div className="animate-pulse bg-border rounded-xl h-48 flex items-center justify-center">
                <span className="text-muted text-sm">Cargando análisis de mercado…</span>
              </div>
            )}
            {!biLoading && biPanel && (
              <BIPanelSection panel={biPanel} tender={tender ?? undefined} />
            )}
            {!biLoading && !biPanel && (
              <p className="text-sm text-muted italic bg-surface-elevated rounded-xl px-4 py-3">
                Panel BI no disponible para esta licitación.
              </p>
            )}
          </div>

          {/* ── Mercado (resumen plegable) ─── */}
          <BICard codigoExterno={tenderData.codigo_externo} />
        </div>
      )}
    </div>
  );
}

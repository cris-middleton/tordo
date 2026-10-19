'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Send,
} from 'lucide-react';

import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import { cierreEnPalabras, normalizeText, shortRegion } from '@/lib/licitacionEstado';

import { useLicitacion, usePanelLicitacion } from '@/lib/queries';
import BIPanelSection from '@/components/licitacion/BIPanelSection';
import { normalizeTenderDetail } from '@/lib/licitacionDetalle';
import type { BIPanel, TenderDetail } from '@/types/licitacionDetalle';

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
  const { hydrated, isTenderStored, toggleTender } = useDashboardCollections();
  const codigoRuta = decodeURIComponent(String(useParams().codigo ?? ''));

  // La licitación y su panel de BI salen de TanStack Query, como el resto del
  // estado de servidor. Un 503 (analítica apagada) o
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

  const nombre = tenderData ? normalizeText(tenderData.nombre) : null;
  const cierre = cierreEnPalabras(tenderData?.fecha_cierre);
  const fechaLarga = (iso?: string) =>
    iso ? format(new Date(iso), "d 'de' MMMM yyyy, HH:mm", { locale: es }) : null;
  const datosClave: { etiqueta: string; valor: string; detalle?: string | null; destacado?: boolean }[] = tenderData
    ? [
        {
          etiqueta: 'Cierre',
          valor: cierre?.texto ?? 'Sin fecha',
          detalle: fechaLarga(tenderData.fecha_cierre),
          destacado: cierre?.urgente,
        },
        {
          etiqueta: 'Monto estimado',
          valor:
            tenderData.monto_estimado != null && !Number.isNaN(tenderData.monto_estimado)
              ? formatCurrency(tenderData.monto_estimado, tenderCurrency)
              : 'No lo informa',
          detalle: tenderCurrency !== 'CLP' ? `En ${tenderCurrency}` : null,
        },
        {
          etiqueta: 'Publicada',
          valor: tenderData.fecha_publicacion
            ? format(new Date(tenderData.fecha_publicacion), "d 'de' MMMM yyyy", { locale: es })
            : 'Sin fecha',
          detalle: tenderData.estado && !/^publicada$/i.test(tenderData.estado) ? `Estado: ${tenderData.estado}` : null,
        },
        {
          etiqueta: 'Lugar',
          valor: shortRegion(tenderData.region) || 'Sin región',
          detalle: tenderData.comuna ? normalizeText(tenderData.comuna) : null,
        },
      ]
    : [];
  const comprador = tenderData?.nombre_organismo ? normalizeText(tenderData.nombre_organismo) : '';
  const guardada = Boolean(tenderData) && hydrated && isTenderStored('saved', tenderData!.id);
  const postulada = Boolean(tenderData) && hydrated && isTenderStored('applied', tenderData!.id);

  // Sin «Volver» antes del título (spec PORTADA_V7 §4: nada va antes del h1):
  // el navegador ya vuelve, y el botón con `router.back()` sacaba del sitio a
  // quien llegaba por un enlace compartido.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title break-words">{nombre ?? 'Licitación'}</h1>
        {tenderData && (
          <>
            {comprador && <p className="mt-2 text-muted">{comprador}</p>}
            <p className="mt-1 font-mono text-sm text-subtle">{tenderData.codigo_externo}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hydrated}
                aria-pressed={guardada}
                onClick={() => toggleTender('saved', tenderData)}
                className="btn-secondary flex h-11 items-center gap-2 disabled:opacity-50"
              >
                {guardada ? (
                  <BookmarkCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : (
                  <Bookmark className="h-4 w-4" aria-hidden="true" />
                )}
                {guardada ? 'Guardada' : 'Guardar'}
              </button>
              <button
                type="button"
                disabled={!hydrated}
                aria-pressed={postulada}
                onClick={() => toggleTender('applied', tenderData)}
                className="btn-secondary flex h-11 items-center gap-2 disabled:opacity-50"
              >
                {postulada ? (
                  <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {postulada ? 'Postulé' : 'Marcar que postulé'}
              </button>
              {tenderData.url_licitacion && (
                <a
                  href={tenderData.url_licitacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex h-11 items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Abrir en Mercado Público
                </a>
              )}
            </div>
          </>
        )}
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
        <div className="space-y-8 lg:space-y-12">
          {/* Los datos con que se decide, antes de la descripción: como Find a
              Tender o TED, el cierre y el monto van bajo el título. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 lg:grid-cols-4 lg:gap-x-8">
            {datosClave.map(({ etiqueta, valor, detalle, destacado }) => (
              <div key={etiqueta} className="min-w-0">
                <dt className="text-sm text-muted">{etiqueta}</dt>
                <dd className={`mt-1 font-semibold ${destacado ? 'text-danger' : 'text-text'}`}>{valor}</dd>
                {detalle && <dd className="text-sm text-muted">{detalle}</dd>}
              </div>
            ))}
          </dl>

          {tenderData.descripcion && (
            <section aria-labelledby="descripcion-titulo">
              <h2 id="descripcion-titulo" className="section-title">
                Qué se compra
              </h2>
              <p className="lectura mt-3 text-text">{tenderData.descripcion}</p>
            </section>
          )}

          {/* ── BI Panel ─────────────────────────────────────────── */}
          <div className="mt-6">
            <h2 className="section-title mb-3">El mercado de esta licitación</h2>
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
                El análisis de este comprador no está disponible ahora.
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

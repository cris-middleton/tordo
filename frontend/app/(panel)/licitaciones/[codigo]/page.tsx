'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Send,
} from 'lucide-react';

import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { FueraDelCatalogo } from '@/components/licitacion/FueraDelCatalogo';
import { fechaLargaDeChile } from '@/lib/horaChile';
import { urlMercadoPublico } from '@/lib/compraAgil';
import { urlDeMercadoPublico } from '@/lib/enlacesExternos';
import { cierreEnPalabras, normalizeText, shortRegion } from '@/lib/licitacionEstado';

import { useLicitacion, usePanelLicitacion } from '@/lib/queries';
import BIPanelSection from '@/components/licitacion/BIPanelSection';
import { esNoEncontrada, montoConMoneda, normalizeTenderDetail } from '@/lib/licitacionDetalle';
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
  // Un 404 es una licitación que ya salió del catálogo (o un código mal
  // escrito), no una caída: se dice por qué y dónde buscarla. El servidor ya
  // responde 404 en ese caso (`layout.tsx`); esto cubre lo que cambie después.
  const noEncontrada = consultaLicitacion.isError && esNoEncontrada(consultaLicitacion.error);
  const fallo = consultaLicitacion.isError && !noEncontrada;

  const consultaPanel = usePanelLicitacion(tender?.codigo_externo ?? undefined);
  const biPanel = (consultaPanel.data ?? null) as BIPanel | null;
  const biLoading = consultaPanel.isLoading;

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
  // En hora de Chile, como el resto del sitio: con `date-fns` salía en la del
  // navegador, y la misma ficha mezclaba los dos husos.
  const datosClave: { etiqueta: string; valor: string; detalle?: string | null; destacado?: boolean }[] = tenderData
    ? [
        {
          etiqueta: 'Cierre',
          valor: cierre?.texto ?? 'Sin fecha',
          detalle: fechaLargaDeChile(tenderData.fecha_cierre, true),
          destacado: cierre?.urgente,
        },
        {
          etiqueta: 'Monto estimado',
          valor: montoConMoneda(tenderData.monto_estimado, tenderCurrency) ?? 'No lo informa',
        },
        {
          etiqueta: 'Publicada',
          valor: fechaLargaDeChile(tenderData.fecha_publicacion) ?? 'Sin fecha',
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
  // La Compra Ágil no trae URL en el dato: se arma la del buscador público por código
  // (`urlMercadoPublico`). Sin esto su ficha no tenía cómo ir a cotizar.
  const esCompraAgil =
    tenderData?.tipo_convocatoria === 'compra_agil' || /-COT\d+$/i.test(tenderData?.codigo_externo ?? '');
  // `url_licitacion` viene del dato: se enlaza sólo si es de Mercado Público (`lib/enlacesExternos.ts`).
  const urlFicha = tenderData
    ? urlDeMercadoPublico(tenderData.url_licitacion) ??
      (esCompraAgil ? urlMercadoPublico(tenderData.codigo_externo) : null)
    : null;
  const guardada = Boolean(tenderData) && hydrated && isTenderStored('saved', tenderData!.id);
  const postulada = Boolean(tenderData) && hydrated && isTenderStored('applied', tenderData!.id);

  // Sin «Volver» antes del título (spec PORTADA_V7 §4: nada va antes del h1):
  // el navegador ya vuelve, y el botón con `router.back()` sacaba del sitio a
  // quien llegaba por un enlace compartido.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title break-words">
          {noEncontrada ? 'No tenemos esta licitación' : (nombre ?? 'Licitación')}
        </h1>
        {tenderData && (
          <>
            {comprador && <p className="mt-2 text-muted">{comprador}</p>}
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-subtle">
              <span className="font-mono">{tenderData.codigo_externo}</span>
              {esCompraAgil && <span>Compra Ágil</span>}
            </p>
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
              {urlFicha && (
                <a
                  href={urlFicha}
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
      ) : noEncontrada ? (
        <FueraDelCatalogo codigo={codigoRuta || null} />
      ) : fallo ? (
        <ErrorDeCarga
          titulo="No pudimos cargar esta licitación"
          error={consultaLicitacion.error}
          onReintentar={() => void consultaLicitacion.refetch()}
          reintentando={consultaLicitacion.isFetching}
        />
      ) : !tenderData ? (
        <div className="card p-6 text-muted">No encontramos esta licitación.</div>
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
            <h2 className="section-title mb-3">Lo que sabemos de este comprador</h2>
            {biLoading && (
              <div className="animate-pulse bg-border rounded-xl h-48 flex items-center justify-center">
                <span className="text-muted text-sm">Buscando sus compras anteriores…</span>
              </div>
            )}
            {!biLoading && biPanel && (
              <BIPanelSection panel={biPanel} tender={tender ?? undefined} />
            )}
            {!biLoading && !biPanel && (
              <p className="text-sm text-muted italic bg-surface-elevated rounded-xl px-4 py-3">
                Las compras anteriores de este comprador no están disponibles ahora.
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLicitaciones, usePanelLicitacion } from '@/lib/queries';
import SelectField from '@/components/SelectField';
import {
  Search,
  Loader2,
  BookmarkPlus,
  BookmarkCheck,
  X,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import { consultaDe, useBusquedasGuardadas } from '@/hooks/useBusquedasGuardadas';
import TarjetaLicitacion from '@/components/licitacion/TarjetaLicitacion';
import { ESTADOS_LICITACION, REGIONES_CHILE, TIPOS_CONVOCATORIA } from '@/lib/constantesChile';
import {
  type FiltrosCatalogo,
  type Orden,
  TIPOS_SIN_COMPRA_AGIL,
  escribirFiltros,
  leerFiltros,
  paramsDeApi,
} from '@/lib/filtrosCatalogo';
import { normalizeText } from '@/lib/licitacionEstado';
import type { BIPanel, Tender } from '@/types/licitacion';
import { decimal } from '@/lib/formato';

type CampoFiltro = 'estado' | 'tipo_convocatoria' | 'region' | 'min_amount' | 'max_amount';

/**
 * El catálogo de licitaciones.
 *
 * **Los filtros viven en la URL** (`lib/filtrosCatalogo.ts`): se leen una vez
 * al montar, con `useSearchParams` en un inicializador perezoso, y se escriben
 * con `replaceState` — el mismo patrón que la pantalla de analítica. Antes
 * vivían sólo en `useState`: recargar los perdía y una búsqueda no se podía
 * compartir, guardar ni seguir por RSS. `abiertas=1` incluido: es el enlace de
 * las cifras de la portada.
 */
function CatalogoContenido() {
  const urlInicial = useSearchParams();
  const [filtros, setFiltros] = useState<FiltrosCatalogo>(() => leerFiltros(urlInicial));
  const [searchInput, setSearchInput] = useState('');
  const { hydrated, isTenderStored, toggleTender } = useDashboardCollections();
  const busquedas = useBusquedasGuardadas();

  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);

  const { page, limit, terminos: keywords, sort_by: sortBy, sort_order: sortOrder } = filtros;

  // ── Sincronizar la URL ───────────────────────────────────────────────────
  // No toca estado de React: escribe fuera. `replaceState` para no llenar el
  // historial con cada tecla.
  const consultaUrl = escribirFiltros(filtros).toString();
  useEffect(() => {
    window.history.replaceState({}, '', consultaUrl ? `?${consultaUrl}` : window.location.pathname);
  }, [consultaUrl]);

  // Lo que identifica la búsqueda guardada: sólo los filtros, sin orden ni página.
  const consultaGuardable = consultaDe(new URLSearchParams(consultaUrl));
  const busquedaGuardada = busquedas.estaGuardada(consultaGuardable);

  // La cancelación con `active` y el vaciado al cambiar de licitación los hace
  // la clave de la consulta: otra licitación, otra clave, otro resultado.
  const consultaPanel = usePanelLicitacion(selectedTender?.codigo_externo);
  const biPanel = (consultaPanel.data ?? null) as BIPanel | null;
  const biLoading = Boolean(selectedTender) && consultaPanel.isFetching;
  const biError = Boolean(consultaPanel.error);

  // Los parámetros SON la clave: cambiar un filtro cambia la clave y se pide de
  // nuevo. `placeholderData` mantiene la tabla anterior mientras llega la nueva,
  // así que ya no parpadea en cada tecleo del buscador.
  const { data: respuesta, isFetching: loading } = useLicitaciones(paramsDeApi(filtros));
  const tenders: Tender[] = respuesta?.items ?? [];
  const total: number = respuesta?.total ?? 0;
  // Las páginas las calcula el backend. Antes había un `useState` que nadie
  // actualizaba, y la paginación no aparecía nunca.
  const pages: number = respuesta?.pages ?? 1;

  /** Cambia filtros y vuelve a la primera página, salvo que se cambie la página. */
  const cambiar = useCallback((cambios: Partial<FiltrosCatalogo>) => {
    setFiltros((prev) => ({ ...prev, page: 1, ...cambios }));
  }, []);

  const handleFilterChange = (key: CampoFiltro, value: string) => cambiar({ [key]: value });

  const addKeyword = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setFiltros((prev) => {
      if (prev.terminos.some((k) => k.toLowerCase() === normalized.toLowerCase())) return prev;
      return {
        ...prev,
        // Un término con espacios son varios para el backend; en la URL
        // también, así que se parten aquí para que el chip y la URL coincidan.
        terminos: [...prev.terminos, ...normalized.split(/\s+/)],
        // Con el primer término, relevancia si el usuario seguía en el orden
        // por defecto. Puede cambiarlo luego en el desplegable.
        sort_by: prev.sort_by === 'fecha_publicacion' ? 'relevance' : prev.sort_by,
        page: 1,
      };
    });
    setSearchInput('');
  }, []);

  const handleKeywordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addKeyword(searchInput);
    } else if (event.key === 'Backspace' && searchInput === '' && keywords.length) {
      event.preventDefault();
      const lastKeyword = keywords[keywords.length - 1];
      cambiar({ terminos: keywords.slice(0, -1) });
      setSearchInput(lastKeyword);
    }
  };

  const removeKeyword = useCallback((value: string) => {
    setFiltros((prev) => {
      const terminos = prev.terminos.filter((k) => k.toLowerCase() !== value.toLowerCase());
      return {
        ...prev,
        terminos,
        sort_by: !terminos.length && prev.sort_by === 'relevance' ? 'fecha_publicacion' : prev.sort_by,
        page: 1,
      };
    });
  }, []);

  const setPage = (actualizar: (p: number) => number) =>
    setFiltros((prev) => ({ ...prev, page: actualizar(prev.page) }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Licitaciones</h1>
          <p className="text-sm text-muted mt-0.5">Busca y explora licitaciones públicas</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="card space-y-3 py-3 px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Nombre, organismo o descripción — Enter para buscar"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            className="input-field pl-9 text-sm"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SelectField
            value={filtros.tipo_convocatoria}
            onChange={(v) => handleFilterChange('tipo_convocatoria', v)}
            options={[
              { value: '', label: 'Todos los mecanismos' },
              ...TIPOS_CONVOCATORIA.map((t) => ({ value: t.value, label: t.label })),
              // Lo que enlazan las cifras de la portada: sin esta opción el filtro
              // funcionaría pero la pantalla diría «Todos los mecanismos».
              { value: TIPOS_SIN_COMPRA_AGIL, label: 'Todo menos Compra Ágil' },
            ]}
          />
          <SelectField
            value={filtros.estado}
            onChange={(v) => handleFilterChange('estado', v)}
            options={[
              { value: '', label: 'Todos los estados' },
              ...ESTADOS_LICITACION.map((e) => ({ value: e, label: e })),
            ]}
          />
          <SelectField
            value={filtros.region}
            onChange={(v) => handleFilterChange('region', v)}
            options={[
              { value: '', label: 'Todas las regiones' },
              ...REGIONES_CHILE.map((r) => ({ value: r, label: r.replace('Región ', '').replace('Región de ', '') })),
            ]}
          />
          <input
            type="number"
            placeholder="Monto mínimo"
            value={filtros.min_amount}
            onChange={(e) => handleFilterChange('min_amount', e.target.value)}
            className="input-field text-sm"
          />
          <input
            type="number"
            placeholder="Monto máximo"
            value={filtros.max_amount}
            onChange={(e) => handleFilterChange('max_amount', e.target.value)}
            className="input-field text-sm"
          />
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={filtros.abiertas}
            onChange={(e) => cambiar({ abiertas: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Sólo las que se pueden postular ahora
        </label>
        {keywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {keywords.map((keyword) => (
              <span key={keyword} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                {keyword}
                <button type="button" onClick={() => removeKeyword(keyword)} className="ml-0.5 text-primary/60 hover:text-primary">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() =>
                cambiar({
                  terminos: [],
                  sort_by: sortBy === 'relevance' ? 'fecha_publicacion' : sortBy,
                })
              }
              className="text-xs text-muted hover:text-danger transition-colors"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Sort bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-1.5">
        <p className="text-xs text-muted">
          <span className="font-semibold text-text">{total.toLocaleString()}</span> resultado{total !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1.5">
          {busquedaGuardada ? (
            <Link
              href="/guardados"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
            >
              <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Búsqueda guardada
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => busquedas.guardar(consultaGuardable)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted hover:bg-primary/5 hover:text-primary"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Guardar esta búsqueda
            </button>
          )}
          <select
            value={sortBy}
            onChange={(e) => cambiar({ sort_by: e.target.value as Orden })}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
          >
            {keywords.length > 0 && <option value="relevance">Relevancia</option>}
            <option value="fecha_publicacion">Publicación</option>
            <option value="fecha_cierre">Cierre</option>
            <option value="monto_estimado">Monto</option>
            <option value="nombre">Nombre</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => cambiar({ sort_order: e.target.value as 'asc' | 'desc' })}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
          >
            <option value="desc">↓ Mayor</option>
            <option value="asc">↑ Menor</option>
          </select>
          <select
            value={String(limit)}
            onChange={(e) => cambiar({ limit: Number(e.target.value) })}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface overflow-hidden animate-pulse">
              <div className="flex">
                <div className="w-1 bg-border shrink-0" />
                <div className="flex-1 p-4 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-20 rounded-full bg-border" />
                    <div className="h-3.5 w-16 rounded bg-border" />
                  </div>
                  <div className="h-4 w-full rounded bg-border" />
                  <div className="h-4 w-4/5 rounded bg-border" />
                  <div className="h-3 w-2/5 rounded bg-border" />
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <div className="h-5 w-24 rounded bg-border" />
                    <div className="flex gap-1">
                      <div className="h-7 w-7 rounded-lg bg-border" />
                      <div className="h-7 w-7 rounded-lg bg-border" />
                      <div className="h-7 w-7 rounded-lg bg-border" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tenders.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
            <Search className="h-7 w-7 text-muted" />
          </div>
          <p className="font-medium text-text">No se encontraron licitaciones</p>
          <p className="text-sm text-muted mt-1">Ajusta tus filtros o términos de búsqueda</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tenders.map((tender) => (
              <TarjetaLicitacion
                key={tender.id}
                tender={tender}
                seleccionada={selectedTender?.id === tender.id}
                onSeleccionar={() => setSelectedTender(tender)}
                hydrated={hydrated}
                estaGuardada={isTenderStored}
                alternar={toggleTender}
              />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-3 text-xs text-muted">
                {page} / {pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {/* BI Panel */}
      {selectedTender && (
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text line-clamp-1 leading-snug">
                {normalizeText(selectedTender.nombre)}
              </p>
              <p className="text-xs text-muted mt-0.5 truncate">
                {selectedTender.nombre_organismo ?? (
                  <span className="font-mono">{selectedTender.codigo_externo}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTender(null)}
              className="shrink-0 rounded p-0.5 text-muted hover:text-text transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {biLoading && (
            <div className="animate-pulse grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
              <div className="h-16 rounded-lg bg-border" />
              <div className="h-16 rounded-lg bg-border" />
              <div className="h-16 rounded-lg bg-border" />
            </div>
          )}

          {!biLoading && biError && (
            <p className="text-xs text-muted italic">Análisis BI no disponible para esta licitación.</p>
          )}

          {!biLoading && !biError && biPanel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Comprador</p>
                {biPanel.comprador.disponible ? (
                  <>
                    {biPanel.comprador.buyer_score != null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Score</span>
                        <span className="font-semibold text-text">{decimal(biPanel.comprador.buyer_score, 1)}/10</span>
                      </div>
                    )}
                    {biPanel.comprador.tasa_adjudicacion != null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Adjudica</span>
                        <span className="text-text">
                          {Math.round(biPanel.comprador.tasa_adjudicacion * 100)}%
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {biPanel.precios.length > 0 && biPanel.precios[0].disponible && biPanel.precios[0].p50 != null && (
                <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Precio referencia</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">P50</span>
                    <span className="font-semibold text-primary">
                      {biPanel.precios[0].p50 >= 1_000_000
                        ? `CLP ${decimal(biPanel.precios[0].p50 / 1_000_000, 1)}M`
                        : `CLP ${decimal(biPanel.precios[0].p50 / 1_000, 0)}K`}
                    </span>
                  </div>
                  {biPanel.precios[0].p25 != null && biPanel.precios[0].p75 != null && (
                    <p className="text-[10px] text-muted">
                      Rango: {biPanel.precios[0].p25 >= 1_000_000 ? `${decimal(biPanel.precios[0].p25/1_000_000, 1)}M` : `${decimal(biPanel.precios[0].p25/1_000, 0)}K`}
                      {' – '}
                      {biPanel.precios[0].p75 >= 1_000_000 ? `${decimal(biPanel.precios[0].p75/1_000_000, 1)}M` : `${decimal(biPanel.precios[0].p75/1_000, 0)}K`}
                    </p>
                  )}
                </div>
              )}

              {biPanel.competidores.disponible && (biPanel.competidores.top5?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">
                    Competidores {biPanel.competidores.tipo_mercado ? `· ${biPanel.competidores.tipo_mercado}` : ''}
                  </p>
                  {biPanel.competidores.top5!.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-text truncate max-w-[200px]">{i + 1}. {c.NombreProveedor ?? '—'}</span>
                      <span className="text-muted shrink-0 ml-1">
                        {c.market_share_pct != null ? `${decimal(c.market_share_pct, 0)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {biPanel.ventana.disponible && biPanel.ventana.alerta_ventana_corta && (
                <div className="flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Ventana corta: {biPanel.ventana.window_days} días
                </div>
              )}
            </div>
          )}

          <Link
            href={`/licitaciones/${encodeURIComponent(selectedTender.codigo_externo)}`}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5"
            onClick={(e) => e.stopPropagation()}
          >
            Ver análisis completo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * `useSearchParams` obliga a una frontera de Suspense: sin ella el build
 * estático falla en esta ruta.
 */
export default function TendersPage() {
  return (
    <Suspense
      fallback={
        // El título va también en el respaldo: es lo que sirve el servidor, y
        // sin él el HTML del catálogo no tenía <h1>.
        <div className="space-y-5">
          <h1 className="page-title">Licitaciones</h1>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        </div>
      }
    >
      <CatalogoContenido />
    </Suspense>
  );
}

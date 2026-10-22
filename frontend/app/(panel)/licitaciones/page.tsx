'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLicitaciones } from '@/lib/queries';
import SelectField from '@/components/SelectField';
import { Search, Loader2, BookmarkPlus, BookmarkCheck, X } from 'lucide-react';

import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import { consultaDe, useBusquedasGuardadas } from '@/hooks/useBusquedasGuardadas';
import { useClaveDeUrlExterna } from '@/hooks/useClaveDeUrlExterna';
import { useValorRetardado } from '@/hooks/useValorRetardado';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import FilaLicitacion from '@/components/licitacion/FilaLicitacion';
import { ESTADOS_LICITACION, REGIONES_CHILE, TIPOS_CONVOCATORIA } from '@/lib/constantesChile';
import {
  type FiltrosCatalogo,
  OPCIONES_ORDEN,
  SUBTITULO_CATALOGO,
  TIPOS_SIN_COMPRA_AGIL,
  agregarTerminos,
  claveOrden,
  ordenDeClave,
  escribirFiltros,
  filtrosIniciales,
  montoDeEntrada,
  montoParaMostrar,
  paginaMaxima,
  paramsDeApi,
} from '@/lib/filtrosCatalogo';
import { MAXIMO_CARACTERES_BUSCAR, MAXIMO_TERMINOS_BUSCAR } from '@/lib/buscar';
import { shortRegion } from '@/lib/nombresChile';
import { escribirUrlPropia } from '@/lib/urlPropia';
import type { Tender } from '@/types/licitacion';

type CampoFiltro = 'estado' | 'tipo_convocatoria' | 'region' | 'min_amount' | 'max_amount';

/** Cuánto se espera a que un monto deje de cambiar antes de pedirlo. */
const RETARDO_MONTO_MS = 400;

/**
 * El catálogo de licitaciones.
 *
 * **Los filtros viven en la URL** (`lib/filtrosCatalogo.ts`): se leen al
 * montar, con `useSearchParams` en un inicializador perezoso, y se escriben
 * con `replaceState` — el mismo patrón que la pantalla de analítica. Una URL
 * que llega de fuera (la cabecera, una búsqueda guardada) vuelve a montar el
 * contenido con su clave (`useClaveDeUrlExterna`): Next 16 no desmonta la
 * página cuando sólo cambia la consulta. Antes
 * vivían sólo en `useState`: recargar los perdía y una búsqueda no se podía
 * compartir, guardar ni seguir por RSS. `abiertas=1` incluido: es el enlace de
 * las cifras de la portada.
 */
function CatalogoContenido() {
  const urlInicial = useSearchParams();
  const [filtros, setFiltros] = useState<FiltrosCatalogo>(() => filtrosIniciales(urlInicial));
  const [searchInput, setSearchInput] = useState('');
  // Se dice al cortar: un término que desaparece sin aviso parece un fallo.
  const [terminosRecortados, setTerminosRecortados] = useState(false);
  const { hydrated, isTenderStored, toggleTender } = useDashboardCollections();
  const busquedas = useBusquedasGuardadas();

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Una sola hora para todas las filas: «Cierra mañana» se cuenta desde aquí.
  const [ahora] = useState(() => new Date());

  const { page, terminos: keywords, sort_by: sortBy } = filtros;

  // ── Sincronizar la URL ───────────────────────────────────────────────────
  // No toca estado de React: escribe fuera. `replaceState` para no llenar el
  // historial con cada tecla.
  // Sin ningún filtro la URL quedaría vacía, y una URL vacía abre en «Sólo
  // abiertas» (`filtrosIniciales`): quien las apagó lo dice con `abiertas=0`,
  // o recargar se las volvería a encender.
  const consultaUrl = escribirFiltros(filtros).toString() || (filtros.abiertas ? '' : 'abiertas=0');
  useEffect(() => {
    escribirUrlPropia('licitaciones', consultaUrl);
  }, [consultaUrl]);

  // Lo que identifica la búsqueda guardada: sólo los filtros, sin orden ni página.
  const consultaGuardable = consultaDe(new URLSearchParams(consultaUrl));
  const busquedaGuardada = busquedas.estaGuardada(consultaGuardable);

  // Los parámetros SON la clave: cambiar un filtro cambia la clave y se pide de
  // nuevo. `placeholderData` mantiene la tabla anterior mientras llega la nueva,
  // así que ya no parpadea en cada tecleo del buscador.
  //
  // Los montos se piden cuando dejan de cambiar: cada tecla era una consulta, y
  // escribir «10.000.000» y «500.000.000» gastaba media cuota del límite por IP
  // (60 por minuto; cada consulta cuenta dos por la redirección de la barra
  // final). Con dos montos y unas páginas, el catálogo respondía «espera un momento».
  const minimoPedido = useValorRetardado(filtros.min_amount, RETARDO_MONTO_MS);
  const maximoPedido = useValorRetardado(filtros.max_amount, RETARDO_MONTO_MS);
  const consulta = useLicitaciones(
    paramsDeApi({ ...filtros, min_amount: minimoPedido, max_amount: maximoPedido }),
  );
  const { data: respuesta, isFetching: loading } = consulta;
  const tenders: Tender[] = respuesta?.items ?? [];
  const total: number = respuesta?.total ?? 0;
  // Las páginas las calcula el backend. Antes había un `useState` que nadie
  // actualizaba, y la paginación no aparecía nunca. Más allá de
  // `paginaMaxima` el backend responde 422: «Siguiente» se apaga ahí.
  const pages: number = Math.min(respuesta?.pages ?? 1, paginaMaxima(filtros.limit));
  // Un error de la API no es «0 resultados»: se dice y se ofrece reintentar.
  const fallo = Boolean(consulta.isError);

  /** Cambia filtros y vuelve a la primera página, salvo que se cambie la página. */
  const cambiar = useCallback((cambios: Partial<FiltrosCatalogo>) => {
    setFiltros((prev) => ({ ...prev, page: 1, ...cambios }));
  }, []);

  const handleFilterChange = (key: CampoFiltro, value: string) => cambiar({ [key]: value });

  const addKeyword = (value: string) => {
    if (!value.trim()) return;
    // Sin repetidos y dentro de las cotas de la API (`agregarTerminos`): con
    // más de ocho palabras o cien letras el backend responde 422.
    const { terminos, recortados } = agregarTerminos(filtros.terminos, value);
    setTerminosRecortados(recortados);
    setSearchInput('');
    if (terminos.length === filtros.terminos.length) return;
    setFiltros((prev) => ({
      ...prev,
      terminos,
      // Con el primer término, relevancia si el usuario seguía en el orden
      // por defecto. Puede cambiarlo luego en el desplegable.
      sort_by: prev.sort_by === 'fecha_publicacion' ? 'relevance' : prev.sort_by,
      page: 1,
    }));
  };

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
    setTerminosRecortados(false);
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

  // Al cambiar de página se vuelve al principio de la lista: «Siguiente» está al
  // final, y la página nueva se veía por su última fila.
  const inicioLista = useRef<HTMLDivElement>(null);
  const setPage = (actualizar: (p: number) => number) => {
    setFiltros((prev) => ({ ...prev, page: actualizar(prev.page) }));
    const inicio = inicioLista.current;
    if (inicio && inicio.getBoundingClientRect().top < 0) inicio.scrollIntoView?.({ block: 'start' });
  };

  /** Quita la búsqueda y los filtros; «Sólo abiertas» y el orden se quedan. */
  const borrarFiltros = () => {
    setTerminosRecortados(false);
    cambiar({
      terminos: [],
      estado: '',
      tipo_convocatoria: '',
      region: '',
      min_amount: '',
      max_amount: '',
      sort_by: sortBy === 'relevance' ? 'fecha_publicacion' : sortBy,
    });
  };

  const filtrosActivos = [
    filtros.tipo_convocatoria,
    filtros.estado,
    filtros.region,
    filtros.min_amount,
    filtros.max_amount,
  ].filter(Boolean).length;

  return (
    <div>
      <h1 className="page-title">Licitaciones y Compras Ágiles</h1>
      <p className="mt-2 text-muted">{SUBTITULO_CATALOGO}</p>

      <div className="mt-6 space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Buscar licitaciones"
            placeholder="Producto o comprador"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            enterKeyHint="search"
            maxLength={MAXIMO_CARACTERES_BUSCAR}
            className="input-field h-12 pl-11"
            autoComplete="off"
          />
        </div>
        {terminosRecortados && (
          <p className="text-sm text-muted" role="status">
            La búsqueda admite hasta {MAXIMO_TERMINOS_BUSCAR} palabras y {MAXIMO_CARACTERES_BUSCAR} letras.
            Dejamos las primeras.
          </p>
        )}
        {(keywords.length > 0 || filtrosActivos > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 py-1 pl-3 pr-1 text-sm font-medium text-primary"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  aria-label={`Quitar «${keyword}»`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-primary/70 hover:text-primary"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={borrarFiltros}
              className="px-2 py-1 text-sm text-muted hover:text-danger"
            >
              Borrar filtros
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filtros.abiertas}
            onClick={() => cambiar({ abiertas: !filtros.abiertas })}
            className={`h-11 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              filtros.abiertas
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-surface text-text hover:border-accent/50'
            }`}
          >
            Sólo abiertas
          </button>
          <button
            type="button"
            aria-expanded={filtrosAbiertos}
            aria-controls="filtros-catalogo"
            onClick={() => setFiltrosAbiertos((v) => !v)}
            className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-text sm:hidden ${
              filtrosAbiertos ? 'border-primary bg-surface-elevated' : 'border-border bg-surface'
            }`}
          >
            Filtros
            {filtrosActivos > 0 && (
              <span className="cifra flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-onPrimary">
                {filtrosActivos}
              </span>
            )}
          </button>
          {busquedaGuardada ? (
            <Link
              href="/guardados"
              className="ml-auto flex h-11 items-center gap-1.5 px-2 text-sm font-medium text-primary hover:text-accent"
            >
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              Búsqueda guardada
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => busquedas.guardar(consultaGuardable)}
              className="ml-auto flex h-11 items-center gap-1.5 px-2 text-sm font-medium text-muted hover:text-primary"
            >
              <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              Guardar búsqueda
            </button>
          )}
        </div>

        <div
          id="filtros-catalogo"
          className={`${filtrosAbiertos ? 'grid' : 'hidden'} grid-cols-1 gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-5`}
        >
          <SelectField
            etiqueta="Tipo de compra"
            value={filtros.tipo_convocatoria}
            onChange={(v) => handleFilterChange('tipo_convocatoria', v)}
            options={[
              { value: '', label: 'Todos los tipos' },
              ...TIPOS_CONVOCATORIA.map((t) => ({ value: t.value, label: t.label })),
              // Lo que enlazan las cifras de la portada: sin esta opción el filtro
              // funcionaría pero la pantalla diría «Todos los tipos».
              { value: TIPOS_SIN_COMPRA_AGIL, label: 'Todo menos Compra Ágil' },
            ]}
          />
          <SelectField
            etiqueta="Estado"
            value={filtros.estado}
            onChange={(v) => handleFilterChange('estado', v)}
            options={[
              { value: '', label: 'Todos los estados' },
              ...ESTADOS_LICITACION.map((e) => ({ value: e, label: e })),
            ]}
          />
          <SelectField
            etiqueta="Región"
            value={filtros.region}
            onChange={(v) => handleFilterChange('region', v)}
            options={[
              { value: '', label: 'Todas las regiones' },
              ...REGIONES_CHILE.map((r) => ({ value: r, label: shortRegion(r) })),
            ]}
          />
          {/* Texto y no `type="number"`: «5.000.000» dejaba el campo vacío y
              «5.000» eran cinco pesos. Se escribe como se lee en Chile y la URL
              guarda sólo las cifras (`montoDeEntrada`). */}
          <input
            type="text"
            inputMode="numeric"
            aria-label="Monto mínimo, en pesos"
            placeholder="Monto mínimo"
            value={montoParaMostrar(filtros.min_amount)}
            onChange={(e) => handleFilterChange('min_amount', montoDeEntrada(e.target.value))}
            className="input-field"
            autoComplete="off"
          />
          <input
            type="text"
            inputMode="numeric"
            aria-label="Monto máximo, en pesos"
            placeholder="Monto máximo"
            value={montoParaMostrar(filtros.max_amount)}
            onChange={(e) => handleFilterChange('max_amount', montoDeEntrada(e.target.value))}
            className="input-field"
            autoComplete="off"
          />
        </div>
      </div>

      <div ref={inicioLista} className="mt-6 flex items-center justify-between gap-4 border-b border-border pb-3">
        <p className="text-muted" aria-live="polite">
          {!fallo && (
            <>
              <span className="cifra font-semibold text-text">{total.toLocaleString('es-CL')}</span>{' '}
              {filtros.abiertas ? (total === 1 ? 'abierta' : 'abiertas') : total === 1 ? 'resultado' : 'resultados'}
            </>
          )}
        </p>
        <select
            aria-label="Ordenar por"
            value={claveOrden(filtros)}
            onChange={(e) => cambiar(ordenDeClave(e.target.value))}
            className="h-11 max-w-full rounded-lg border border-border bg-surface px-3 text-base font-semibold text-text focus:border-primary/50 focus:outline-none sm:text-sm"
          >
          {OPCIONES_ORDEN.filter((o) => o.sort_by !== 'relevance' || keywords.length > 0).map((o) => (
              <option key={claveOrden(o)} value={claveOrden(o)}>
                {o.etiqueta}
              </option>
            ))}
          </select>
      </div>

      {fallo ? (
        <div className="mt-6">
          <ErrorDeCarga
            titulo="No pudimos cargar las licitaciones"
            error={consulta.error}
            onReintentar={() => void consulta.refetch()}
            reintentando={loading}
          />
        </div>
      ) : loading && tenders.length === 0 ? (
        <ul aria-hidden="true" className="divide-y divide-border">
          {[...Array(6)].map((_, i) => (
            <li key={i} className="flex animate-pulse gap-3 py-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-4/5 rounded bg-border" />
                <div className="h-3.5 w-2/5 rounded bg-border" />
                <div className="h-3.5 w-1/3 rounded bg-border" />
              </div>
              <div className="h-4 w-16 rounded bg-border" />
            </li>
          ))}
        </ul>
      ) : tenders.length === 0 && total > 0 && page > 1 ? (
        // Una página que ya no existe (un enlace viejo, o el catálogo encogió):
        // sin esto decía «N resultados» sobre una lista vacía y sin paginación.
        <div className="py-12">
          <p className="font-semibold text-text">Esta página ya no tiene licitaciones</p>
          <button type="button" onClick={() => setPage(() => 1)} className="btn-secondary mt-3 h-11">
            Ir a la página 1
          </button>
        </div>
      ) : tenders.length === 0 ? (
        <div className="py-12">
          <p className="font-semibold text-text">Ninguna licitación con estos filtros</p>
          <p className="mt-1 text-muted">Quita un filtro o prueba con otra palabra.</p>
        </div>
      ) : (
        <>
          <ul aria-label="Licitaciones" className={`divide-y divide-border border-b border-border ${loading ? 'opacity-60' : ''}`}>
            {tenders.map((tender) => (
              <li key={tender.id}>
                <FilaLicitacion
                  tender={tender}
                  ahora={ahora}
                  hydrated={hydrated}
                  estaGuardada={isTenderStored}
                  alternar={toggleTender}
                />
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-2 pt-6">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary h-11 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="cifra px-3 text-sm text-muted">
                Página {page} de {pages.toLocaleString('es-CL')}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="btn-secondary h-11 disabled:opacity-40"
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/** Vuelve a montar el catálogo cuando la URL llega de fuera: ver `lib/urlPropia.ts`. */
function CatalogoDeLaUrl() {
  const clave = useClaveDeUrlExterna('licitaciones');
  return <CatalogoContenido key={clave} />;
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
        <div>
          <h1 className="page-title">Licitaciones y Compras Ágiles</h1>
          <p className="mt-2 text-muted">{SUBTITULO_CATALOGO}</p>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        </div>
      }
    >
      <CatalogoDeLaUrl />
    </Suspense>
  );
}

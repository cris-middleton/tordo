'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, Loader2 } from 'lucide-react';

import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { useClaveDeUrlExterna } from '@/hooks/useClaveDeUrlExterna';
import { MESES_ANALISIS } from '@/lib/periodo';
import { escribirUrlPropia } from '@/lib/urlPropia';
import {
  useBIOportunidades,
  useBIPanorama,
  useBIResumen,
  useBIRubros,
  useBITendencia,
} from '@/lib/queries';

import {
  OportunidadItem,
  OrganismoConNombre,
  Panorama,
  ResumenMercado,
  TendenciaApiResponse,
} from './types';
import { CompareMode } from './components/CompareMode';
import { CompetenciaSection } from './components/CompetenciaSection';
import { CompradoresSection } from './components/CompradoresSection';
import { EstacionalidadSection } from './components/EstacionalidadSection';
import { HerramientasAvanzadas } from './components/HerramientasAvanzadas';
import { MarketSummaryCard } from './components/MarketSummaryCard';
import { OportunidadesSection } from './components/OportunidadesSection';
import { PanoramaRubro } from '@/components/bi/PanoramaRubro';
import { RubroFilter } from './components/RubroFilter';
import { RubroMostrado } from './components/ShareMenu';
import { SectorOverview } from './components/SectorOverview';
import { TendenciasSection } from './components/TendenciasSection';

/**
 * Mercados: la analítica por rubro.
 *
 * **El estado de servidor vive en TanStack Query, no en `useState`.** Esta
 * pantalla tenía seis estados de carga a mano, un efecto de inicialización de
 * noventa líneas y tres `eslint-disable` para callar `set-state-in-effect`, que
 * en este repo es `error` precisamente para evitar este patrón. Además de la
 * ceremonia traía dos fallos: cambiar de rubro dejaba en pantalla los datos del
 * anterior mientras cargaban los nuevos, y volver a la pantalla lo re-pedía
 * todo.
 *
 * **El orden de las secciones es la jerarquía de la decisión**, no una lista de
 * lo que el pipeline sabe calcular:
 *
 *   1. Panorama del rubro — ¿cómo está este mercado?
 *   2. Oportunidades — ¿qué hago esta semana?
 *   3. Detalle por comprador — ¿y si miro uno en concreto?
 *   4. Herramientas — cálculos puntuales, plegados.
 *
 * Desde el pivote a sitio público no hay cuenta ni empresa: no hay «tu
 * posición», ni rubros guardados en un perfil, ni secciones con candado. Sin
 * rubro en la URL abre en el de más mercados, y antes de él, lo nacional: cuánto
 * compra cada sector (`SectorOverview`).
 *
 * Antes eran cinco secciones del mismo peso visual en un scroll largo, y la
 * primera pregunta —la que trae al usuario— no se respondía en ninguna.
 *
 * **Cada sección dice si falló** (`ErrorDeCarga`): con la API caída la pantalla
 * giraba más de 30 s y se pintaba vacía. `SectorOverview` se oculta en error a
 * propósito: es un aviso opcional.
 */

function BIDesactivado() {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center">
      <div className="rounded-full bg-gold/15 p-4">
        <BarChart3 className="h-10 w-10 text-gold" aria-hidden="true" />
      </div>
      <div>
        {/* Esta pantalla la puede ver un cliente pagando, y decía «falta que el
            pipeline de analytics haya materializado sus tablas y que
            FEATURE_ANALYTICS esté activo»: el nombre de una variable de entorno
            y el estado de nuestro ETL, sobre algo que el usuario no puede
            tocar. Se dice que es cosa nuestra y qué puede hacer él, que es
            escribir. */}
        <h2 className="text-xl text-text">Esto todavía no está disponible</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Estamos terminando de preparar los datos de mercado por acá. Si llevas rato viéndolo
          así, escríbenos a{' '}
          <a href="mailto:hola@tordo.cl" className="enlace">
            hola@tordo.cl
          </a>{' '}
          y lo revisamos.
        </p>
      </div>
    </div>
  );
}

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="section-title">{titulo}</h2>
        {descripcion && <p className="mt-2 max-w-[65ch] text-muted">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

function BIContenido() {
  // La URL se LEE al montar, no sólo se escribe. Antes esta pantalla la
  // escribía en un efecto y nunca la leía: compartir el enlace de un rubro
  // abría el rubro por defecto del que lo recibía. Una URL que llega de fuera
  // (la cabecera) vuelve a montar la pantalla: `BIDeLaUrl`.
  //
  // Se lee con `useSearchParams` y un inicializador perezoso —una vez— en vez
  // de con `useEffect` + `setState`: `window` no existe en el prerender, así
  // que leerlo directo rompería el build.
  const params = useSearchParams();
  const [rubroElegido, setRubroElegido] = useState<string | null>(
    () => params.get('rubro') || null,
  );
  const [rubroB, setRubroB] = useState(() => params.get('compare') ?? '');
  const [compareMode, setCompareMode] = useState(() => !!params.get('compare'));
  const [focusCodigo, setFocusCodigo] = useState<string | null>(
    () => params.get('focus') || null,
  );
  const [orgElegido, setOrgElegido] = useState('');

  const consultaRubros = useBIRubros();
  const rubrosPorFrecuencia = useMemo<string[]>(() => {
    const datos = consultaRubros.data as { disponible?: boolean; rubros?: string[] } | undefined;
    return datos?.disponible ? (datos.rubros ?? []) : [];
  }, [consultaRubros.data]);
  const allRubros = useMemo(
    () => [...rubrosPorFrecuencia].sort((a, b) => a.localeCompare(b, 'es')),
    [rubrosPorFrecuencia],
  );

  // Sin rubro en la URL, el de más mercados (`/bi/rubros` viene ordenado por
  // frecuencia). Antes la pantalla abría con tres recuadros vacíos que pedían
  // «Elige un rubro arriba». El elegido por defecto NO se escribe en la URL:
  // `/mercado` sigue siendo `/mercado`.
  const rubroPorDefecto = rubrosPorFrecuencia[0] ?? '';
  const rubro = rubroElegido || rubroPorDefecto;

  // ── Datos de la pantalla ─────────────────────────────────────────────────
  const consultaPanorama = useBIPanorama(rubro || undefined);
  const panorama = consultaPanorama.data as Panorama | undefined;

  const consultaOportunidades = useBIOportunidades(rubro || undefined);
  const oportunidades = useMemo<OportunidadItem[]>(() => {
    const d = consultaOportunidades.data as { disponible?: boolean; oportunidades?: OportunidadItem[] } | undefined;
    return d?.disponible ? (d.oportunidades ?? []) : [];
  }, [consultaOportunidades.data]);

  const consultaTendencia = useBITendencia(rubro || undefined);
  const tendencia = consultaTendencia.data as TendenciaApiResponse | undefined;

  const consultaResumen = useBIResumen(rubro || undefined);
  const resumen = (consultaResumen.data ?? null) as ResumenMercado | null;

  // El módulo está apagado si una consulta devolvió 503. Se mira también la de
  // rubros: es la primera que termina, y sin esto su 503 se pintaría como «no
  // pudimos cargar», que invita a reintentar algo que no se arregla así.
  const es503 = (error: unknown) =>
    (error as { response?: { status?: number } } | null)?.response?.status === 503;
  const biDesactivado = es503(consultaOportunidades.error) || es503(consultaRubros.error);

  const cargandoInicial = consultaRubros.isPending;

  const topOrganismos = useMemo<OrganismoConNombre[]>(() => {
    const vistos = new Set<string>();
    const salida: OrganismoConNombre[] = [];
    for (const o of oportunidades.slice(0, 10)) {
      if (vistos.has(o.CodigoOrganismoPublico)) continue;
      vistos.add(o.CodigoOrganismoPublico);
      salida.push({
        codigo: o.CodigoOrganismoPublico,
        nombre: o.NombreOrganismo || o.CodigoOrganismoPublico,
      });
      if (salida.length >= 3) break;
    }
    return salida;
  }, [oportunidades]);

  const organismoComparado = orgElegido || topOrganismos[0]?.codigo || '';

  // El comprador enfocado se guarda por CÓDIGO y el nombre se deriva de lo que
  // esté cargado. Guardar el par entero dejaba el nombre congelado del momento
  // del clic, y con un código venido de la URL no había nombre ninguno: se
  // pintaba el código crudo en la cabecera.
  const focusedOrganismo = useMemo<OrganismoConNombre | null>(() => {
    if (!focusCodigo) return null;
    const desdeOportunidades = oportunidades.find(
      (o) => o.CodigoOrganismoPublico === focusCodigo,
    );
    return {
      codigo: focusCodigo,
      nombre: desdeOportunidades?.NombreOrganismo || focusCodigo,
    };
  }, [focusCodigo, oportunidades]);

  const cambiarRubro = useCallback((nuevo: string) => {
    setCompareMode(false);
    setRubroB('');
    setRubroElegido(nuevo);
    setOrgElegido('');
    setFocusCodigo(null);
  }, []);

  // ── Sincronizar la URL ───────────────────────────────────────────────────
  // Único efecto de la pantalla, y no toca estado de React: escribe fuera. Va
  // con `replaceState` para no llenar el historial con cada cambio de filtro.
  useEffect(() => {
    const siguiente = new URLSearchParams();
    if (rubroElegido) siguiente.set('rubro', rubroElegido);
    if (focusCodigo) siguiente.set('focus', focusCodigo);
    if (compareMode && rubroB) siguiente.set('compare', rubroB);
    escribirUrlPropia('mercado', siguiente.toString());
  }, [rubroElegido, focusCodigo, compareMode, rubroB]);

  if (cargandoInicial) return <Cargando />;

  if (biDesactivado) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Mercados</h1>
        <BIDesactivado />
      </div>
    );
  }

  // Nunca un spinner indefinido (spec del rediseño §8.2): si los rubros no
  // llegan, se dice y se ofrece reintentar. Antes la pantalla se pintaba vacía.
  if (consultaRubros.isError) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Mercados</h1>
        <ErrorDeCarga
          titulo="No pudimos cargar los rubros"
          error={consultaRubros.error}
          onReintentar={() => void consultaRubros.refetch()}
          reintentando={consultaRubros.isFetching}
        />
      </div>
    );
  }

  // El `h1` va primero y el selector de rubro debajo (spec PORTADA_V7 §4: nada antes
  // del `h1`, el tope es el de toda página). El selector sigue pegado arriba al bajar.
  // `RubroMostrado`: «Copiar enlace» lleva el rubro que se ve, también el
  // elegido por defecto, que no se escribe en la URL de la pantalla.
  return (
    <RubroMostrado value={rubro}>
      <div className="flex min-h-screen flex-col">
        <h1 className="page-title">Mercados</h1>
        <p className="mt-2 max-w-[65ch] text-muted">
          Cuánto compra el Estado en cada rubro, quién le vende y en qué meses. Contamos las órdenes de
          compra de los últimos {MESES_ANALISIS} meses.
        </p>

        {!compareMode && <SectorOverview />}

        <h2 className="section-title mt-8 lg:mt-16">Elige tu rubro</h2>
        <RubroFilter
          rubros={allRubros}
          selectedRubro={rubro}
          onRubroChange={cambiarRubro}
          focusedOrganismo={focusedOrganismo}
          onClearFocus={() => setFocusCodigo(null)}
          porDefecto={!rubroElegido && Boolean(rubro)}
          onComparar={!compareMode && rubro ? () => setCompareMode(true) : undefined}
        />

        <div className="flex-1 space-y-12 pt-8 lg:space-y-16">

          {compareMode ? (
            <CompareMode
              rubroA={rubro}
              rubroB={rubroB}
              allRubros={allRubros}
              onChangeRubroA={setRubroElegido}
              onChangeRubroB={setRubroB}
              onClose={() => {
                setCompareMode(false);
                setRubroB('');
              }}
            />
          ) : (
            <>
              {/* ── 1. ¿Cómo está este mercado? ───────────────────────────── */}
              <Seccion
                titulo="Cómo está el rubro"
                descripcion="Cuánto se compra, quién le vende, en qué meses y si crece. Suma a todos los compradores del rubro."
              >
                {/* El párrafo primero y las cifras después: quien abre esto no
                    quiere leer un tablero, quiere que le digan cómo está el
                    mercado. Las cifras están debajo para el que sí. */}
                {consultaResumen.isError ? (
                  <ErrorDeCarga
                    titulo="No pudimos cargar el resumen del rubro"
                    error={consultaResumen.error}
                    onReintentar={() => void consultaResumen.refetch()}
                    reintentando={consultaResumen.isFetching}
                  />
                ) : (
                  <MarketSummaryCard resumen={resumen} loading={consultaResumen.isFetching} rubro={rubro} />
                )}
                {consultaPanorama.isError ? (
                  <ErrorDeCarga
                    titulo="No pudimos cargar el panorama del rubro"
                    error={consultaPanorama.error}
                    onReintentar={() => void consultaPanorama.refetch()}
                    reintentando={consultaPanorama.isFetching}
                  />
                ) : (
                  <PanoramaRubro
                    panorama={panorama}
                    cargando={consultaPanorama.isPending && !!rubro}
                    rubro={rubro}
                  />
                )}
                {consultaTendencia.isError ? (
                  <ErrorDeCarga
                    titulo="No pudimos cargar las tendencias"
                    error={consultaTendencia.error}
                    onReintentar={() => void consultaTendencia.refetch()}
                    reintentando={consultaTendencia.isFetching}
                  />
                ) : (
                  <TendenciasSection
                    loading={consultaTendencia.isFetching}
                    selectedRubro={rubro}
                    serieAnual={tendencia?.serie_anual ?? null}
                    cagrRubro={tendencia?.cagr_rubro ?? null}
                  />
                )}
              </Seccion>

              {/* ── 2. ¿Qué hago esta semana? ─────────────────────────────── */}
              <Seccion
                titulo="Qué compradores mirar primero"
                descripcion="La oportunidad de cada comprador en este rubro, de 0 a 10. Sube si compra mucho, crece, paga precios parejos, compra en los mismos meses y ningún proveedor se lleva todo."
              >
                {consultaOportunidades.isError ? (
                  <ErrorDeCarga
                    titulo="No pudimos cargar los compradores del rubro"
                    error={consultaOportunidades.error}
                    onReintentar={() => void consultaOportunidades.refetch()}
                    reintentando={consultaOportunidades.isFetching}
                  />
                ) : (
                  <OportunidadesSection
                    oportunidades={oportunidades}
                    loading={consultaOportunidades.isFetching}
                    rubro={rubro}
                    onFocusOrganismo={(o) => {
                      setFocusCodigo(o.codigo);
                      setTimeout(() => {
                        document
                          .querySelector('[data-section="detalle-comprador"]')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                  />
                )}
              </Seccion>

              {/* ── 3. Detalle de un comprador ────────────────────────────── */}
              <div data-section="detalle-comprador" className="space-y-6">
                {focusedOrganismo && (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
                    <div className="flex-1 text-sm">
                      <p className="text-text">
                        <span className="text-muted">Estás mirando:</span>{' '}
                        <span className="font-semibold">{focusedOrganismo.nombre}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setFocusCodigo(null)}
                      className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-danger"
                    >
                      Quitar
                    </button>
                  </div>
                )}

                <Seccion
                  titulo="Un comprador de cerca"
                  descripcion="Quién le vende, cuánto de lo que licita adjudica y en qué meses compra. Para ver otro, ábrelo en la lista de arriba."
                >
                  <div className="space-y-6">
                    <CompetenciaSection
                      topOrganismos={topOrganismos}
                      selectedOrganismo={focusedOrganismo?.codigo || organismoComparado}
                      onOrganismoChange={setOrgElegido}
                      rubro={rubro}
                      disabled={!!focusedOrganismo}
                      focused={!!focusedOrganismo}
                      focusedNombre={focusedOrganismo?.nombre}
                    />
                    {(topOrganismos.length > 0 || focusedOrganismo) && (
                      <>
                        <CompradoresSection
                          topOrganismos={topOrganismos}
                          rubro={rubro}
                          focusedOrganismo={focusedOrganismo}
                          focusedNombre={focusedOrganismo?.nombre}
                        />
                        <EstacionalidadSection
                          topOrganismos={topOrganismos}
                          rubro={rubro}
                          focusedOrganismo={focusedOrganismo}
                          focused={!!focusedOrganismo}
                          focusedNombre={focusedOrganismo?.nombre}
                        />
                      </>
                    )}
                  </div>
                </Seccion>
              </div>

              {/* ── 4. Cálculos puntuales ─────────────────────────────────── */}
              <HerramientasAvanzadas
                rubro={rubro}
                topOrganismos={topOrganismos}
                allRubros={allRubros}
              />
            </>
          )}
        </div>
      </div>
    </RubroMostrado>
  );
}

/** Vuelve a montar la pantalla cuando la URL llega de fuera: ver `lib/urlPropia.ts`. */
function BIDeLaUrl() {
  const clave = useClaveDeUrlExterna('mercado');
  return <BIContenido key={clave} />;
}

/**
 * La espera, con el título: el respaldo de `Suspense` es lo que sirve el
 * servidor, y sin el `h1` el HTML de `/mercado` no tenía título (ahora va al
 * sitemap, y `e2e/calidad-paginas.spec.ts` exige uno).
 */
function Cargando() {
  return (
    <div>
      <h1 className="page-title">Mercados</h1>
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * `useSearchParams` obliga a una frontera de Suspense: sin ella el build
 * estático falla en esta ruta. El fallback es la misma espera de la carga
 * inicial, así que el usuario no ve dos estados de espera distintos.
 */
export default function BIPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <BIDeLaUrl />
    </Suspense>
  );
}

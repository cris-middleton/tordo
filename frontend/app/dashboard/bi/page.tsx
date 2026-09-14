'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, Columns, Loader2, Target } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBIOportunidades,
  useBIPanorama,
  useBIResumen,
  useBIRubros,
  useBITendencia,
  useEmpresas,
  useMiPosicion,
  usePerfilSemantico,
} from '@/lib/queries';

import {
  MiPosicion,
  OportunidadItem,
  OrganismoConNombre,
  Panorama,
  PlanTier,
  ResumenMercado,
  TendenciaApiResponse,
  TFIDFPerfilData,
  isPaidPlan,
} from './types';
import { BIOnboarding } from './components/BIOnboarding';
import { CompareMode } from './components/CompareMode';
import { CompetenciaSection } from './components/CompetenciaSection';
import { CompradoresSection } from './components/CompradoresSection';
import { EstacionalidadSection } from './components/EstacionalidadSection';
import { HerramientasAvanzadas } from './components/HerramientasAvanzadas';
import { MarketSummaryCard } from './components/MarketSummaryCard';
import { MyPositionCard } from './components/MyPositionCard';
import { OportunidadesSection } from './components/OportunidadesSection';
import { PanoramaRubro } from './components/PanoramaRubro';
import { PlanGate } from './components/PlanGate';
import { RubroFilter } from './components/RubroFilter';
import { SectorOverview } from './components/SectorOverview';
import { TendenciasSection } from './components/TendenciasSection';

/**
 * Inteligencia de mercado.
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
 *   2. Dónde estoy yo — ¿tengo algo que defender aquí?
 *   3. Oportunidades — ¿qué hago esta semana?
 *   4. Detalle por comprador — ¿y si miro uno en concreto?
 *   5. Herramientas — cálculos puntuales, plegados.
 *
 * Antes eran cinco secciones del mismo peso visual en un scroll largo, y la
 * primera pregunta —la que trae al usuario— no se respondía en ninguna.
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
        <h2 className="text-xl font-semibold text-text">Esto todavía no está disponible</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Estamos terminando de preparar los datos de mercado por acá. Si llevas rato viéndolo
          así, escríbenos a{' '}
          <a href="mailto:hola@tordo.cl" className="font-medium text-primary hover:underline">
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
    <section className="space-y-3">
      <div>
        <h2
          className="text-lg font-bold text-text"
          style={{ fontFamily: 'var(--font-display, system-ui)' }}
        >
          {titulo}
        </h2>
        {descripcion && <p className="text-sm text-muted">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

function BIContenido() {
  const { user } = useAuth();
  const plan = (user?.plan_tier ?? 'basico') as PlanTier;
  const paid = isPaidPlan(plan);

  // La URL se LEE al montar, no sólo se escribe. Antes esta pantalla la
  // escribía en un efecto y nunca la leía: compartir el enlace de un rubro
  // abría el rubro por defecto del que lo recibía.
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
  // «Explorar sin configurar» es una decisión del usuario, no un dato: se
  // recuerda aparte. Antes el botón se limitaba a elegir el primer rubro del
  // catálogo, así que **sin catálogo no hacía nada** — y sin catálogo es
  // justamente cuando esta pantalla aparece. Ver `saltarConfiguracion`.
  const [configuracionOmitida, setConfiguracionOmitida] = useState(false);

  // ── Contexto de empresa y catálogo ───────────────────────────────────────
  const consultaEmpresas = useEmpresas();
  const empresas = (consultaEmpresas.data ?? []) as { id: string; rubros_cpv?: string[] }[];
  const empresaId = empresas[0]?.id;

  const consultaPerfil = usePerfilSemantico(empresaId);
  const perfil = consultaPerfil.data as TFIDFPerfilData | undefined;

  const consultaRubros = useBIRubros();
  const allRubros = useMemo<string[]>(() => {
    const datos = consultaRubros.data as { disponible?: boolean; rubros?: string[] } | undefined;
    if (!datos?.disponible) return [];
    return [...(datos.rubros ?? [])].sort((a, b) => a.localeCompare(b, 'es'));
  }, [consultaRubros.data]);

  // El rubro se DERIVA mientras el usuario no elija uno: de la URL, de la
  // empresa o del perfil. Guardarlo en estado desde un efecto era lo que
  // obligaba al `eslint-disable` y lo que dejaba un render con el valor vacío.
  const rubroPorDefecto =
    empresas[0]?.rubros_cpv?.[0] ?? perfil?.rubros_usados?.[0] ?? '';
  const rubro = rubroElegido ?? rubroPorDefecto;

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

  const consultaMiPosicion = useMiPosicion(empresaId, rubro);
  const miPosicion = (consultaMiPosicion.data ?? null) as MiPosicion | null;

  // El módulo está apagado si la primera consulta devolvió 503. Se lee del
  // error de la consulta en vez de mantenerse en un estado propio.
  const biDesactivado =
    (consultaOportunidades.error as { response?: { status?: number } } | null)?.response?.status ===
    503;

  const cargandoInicial = consultaEmpresas.isPending || consultaRubros.isPending;

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

  /**
   * Entrar a la pantalla sin haber declarado rubros.
   *
   * Hacía `allRubros[0] && cambiarRubro(allRubros[0])`, que es un no-op cuando
   * el catálogo viene vacío — y viene vacío siempre que el pipeline de
   * analytics no se ha materializado, que es el estado de cualquier despliegue
   * nuevo: `/bi/clusters` responde `{"disponible": false, "motivo":
   * "cluster_taxonomy.parquet no encontrado"}`. El usuario pulsaba un botón que
   * no reaccionaba, sin ningún mensaje.
   *
   * Saltar la puerta no necesita un rubro: las secciones de abajo ya saben
   * pintarse vacías y dicen por qué. Si hay catálogo se elige el primero, que
   * es mejor punto de partida; si no lo hay, se entra igual.
   */
  const saltarConfiguracion = useCallback(() => {
    setConfiguracionOmitida(true);
    if (allRubros[0]) setRubroElegido(allRubros[0]);
  }, [allRubros]);

  const cambiarRubro = useCallback((nuevo: string) => {
    setCompareMode(false);
    setRubroB('');
    setRubroElegido(nuevo);
    setOrgElegido('');
    setFocusCodigo(null);
  }, []);

  /**
   * Guarda el perfil semántico desde el selector de rubros.
   *
   * **Manda la descripción aunque no se toque aquí.** `PUT /bi/perfil` escribe
   * todos los campos del cuerpo, así que enviar sólo los rubros —como hacía
   * esta pantalla— dejaba `descripcion` en `None` y **borraba lo que el usuario
   * había escrito** en la pantalla de empresa. Un guardado silencioso que
   * destruye el dato que alimenta todo el matching.
   */
  const guardarPerfil = useCallback(
    async (rubros: string[]) => {
      if (!empresaId) return;
      await apiClient.updateTFIDFPerfil(empresaId, {
        descripcion: perfil?.descripcion ?? null,
        rubros_usados: rubros,
      });
      await consultaPerfil.refetch();
    },
    [empresaId, perfil?.descripcion, consultaPerfil],
  );

  // ── Sincronizar la URL ───────────────────────────────────────────────────
  // Único efecto de la pantalla, y no toca estado de React: escribe fuera. Va
  // con `replaceState` para no llenar el historial con cada cambio de filtro.
  useEffect(() => {
    const siguiente = new URLSearchParams();
    if (rubro) siguiente.set('rubro', rubro);
    if (focusCodigo) siguiente.set('focus', focusCodigo);
    if (compareMode && rubroB) siguiente.set('compare', rubroB);
    const qs = siguiente.toString();
    window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
  }, [rubro, focusCodigo, compareMode, rubroB]);

  const necesitaOnboarding =
    !cargandoInicial &&
    !biDesactivado &&
    !configuracionOmitida &&
    !perfil?.rubros_usados?.length &&
    !rubro;

  if (cargandoInicial) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (biDesactivado) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="page-title flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
          Inteligencia de mercado
        </h1>
        <BIDesactivado />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <RubroFilter
        rubros={allRubros}
        selectedRubro={rubro}
        onRubroChange={cambiarRubro}
        plan={plan}
        allRubros={allRubros}
        perfil={perfil ?? null}
        empresaId={empresaId ?? null}
        onSavePerfil={guardarPerfil}
        focusedOrganismo={focusedOrganismo}
        onClearFocus={() => setFocusCodigo(null)}
      />

      <div className="flex-1 space-y-8 p-4 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
              Inteligencia de mercado
            </h1>
            {rubro && <p className="mt-0.5 text-sm text-muted">{rubro}</p>}
          </div>
          {!compareMode && rubro && (
            <button
              onClick={() => setCompareMode(true)}
              className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary md:flex"
            >
              <Columns className="h-4 w-4" aria-hidden="true" />
              Comparar con otro rubro
            </button>
          )}
        </div>

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
        ) : necesitaOnboarding ? (
          <BIOnboarding
            onConfigurarRubros={() =>
              window.dispatchEvent(new CustomEvent('bi:open-rubros-modal'))
            }
            onExplorarSinConfigurar={saltarConfiguracion}
          />
        ) : (
          <>
            <SectorOverview />

            {/* ── 1 · ¿Cómo está este mercado? ───────────────────────────── */}
            <Seccion
              titulo="Cómo está el mercado"
              descripcion="Tamaño, competencia y calendario del rubro completo, no de un comprador suelto."
            >
              {/* El párrafo primero y las cifras después: quien abre esto no
                  quiere leer un tablero, quiere que le digan cómo está el
                  mercado. Las cifras están debajo para el que sí. */}
              <MarketSummaryCard resumen={resumen} loading={consultaResumen.isFetching} />
              <PanoramaRubro
                panorama={panorama}
                cargando={consultaPanorama.isPending && !!rubro}
                rubro={rubro}
              />
            </Seccion>

            {/* ── 2 · ¿Tengo algo que defender aquí? ─────────────────────── */}
            {rubro && miPosicion && (
              <Seccion titulo="Tu posición">
                <MyPositionCard
                  posicion={miPosicion}
                  loading={consultaMiPosicion.isFetching}
                  rubro={rubro}
                />
              </Seccion>
            )}

            {/* ── 3 · ¿Qué hago esta semana? ─────────────────────────────── */}
            <Seccion
              titulo="Dónde mirar primero"
              descripcion="Los mercados con mejor combinación de precio, competencia y regularidad."
            >
              <OportunidadesSection
                oportunidades={oportunidades}
                loading={consultaOportunidades.isFetching}
                onFocusOrganismo={(o) => {
                  setFocusCodigo(o.codigo);
                  setTimeout(() => {
                    document
                      .querySelector('[data-section="detalle-comprador"]')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
              />
              <TendenciasSection
                tendencias={tendencia?.tendencias ?? []}
                emergentes={tendencia?.emergentes ?? []}
                loading={consultaTendencia.isFetching}
                selectedRubro={rubro}
                serieAnual={tendencia?.serie_anual ?? null}
                cagrRubro={tendencia?.cagr_rubro ?? null}
              />
            </Seccion>

            {/* ── 4 · Detalle de un comprador ────────────────────────────── */}
            <div data-section="detalle-comprador" className="space-y-6">
              {focusedOrganismo && (
                <div className="flex items-center gap-3 rounded-xl border-l-4 border-accent bg-accent/10 px-4 py-3">
                  <Target className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div className="flex-1 text-sm">
                    <p className="text-text">
                      <span className="text-muted">Mirando en detalle:</span>{' '}
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
                titulo="Un comprador en concreto"
                descripcion="Quién le vende, cómo tramita y en qué meses compra."
              >
                {/* El plan que se nombra es el que se puede comprar. Antes decía
                    «plan PYME o superior» y ese plan no está a la venta: existe
                    en `PLAN_QUOTAS` y no en `/billing/plans`. */}
                <PlanGate locked={!paid} label="Análisis por comprador — plan Pro">
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
                </PlanGate>
              </Seccion>
            </div>

            {/* ── 5 · Cálculos puntuales ─────────────────────────────────── */}
            <HerramientasAvanzadas
              rubro={rubro}
              topOrganismos={topOrganismos}
              allRubros={allRubros}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * `useSearchParams` obliga a una frontera de Suspense: sin ella el build
 * estático falla en esta ruta. El fallback es el mismo spinner de la carga
 * inicial, así que el usuario no ve dos estados de espera distintos.
 */
export default function BIPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      }
    >
      <BIContenido />
    </Suspense>
  );
}

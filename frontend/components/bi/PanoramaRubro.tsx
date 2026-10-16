'use client';

import {
  AlertTriangle,
  CalendarRange,
  Loader2,
  TrendingUp,
  Users,
} from 'lucide-react';

import { InfoTooltip } from './InfoTooltip';
import type { Panorama, PanoramaLider } from '@/types/bi';

import { EligeRubro } from './EligeRubro';
import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

/**
 * El panorama del rubro: la cabecera de la pantalla de analítica.
 *
 * **Por qué existe.** El dashboard estaba construido alrededor del par
 * *(organismo, rubro)* —así están todas las tablas del pipeline— pero el
 * usuario llega preguntando por su rubro. Como esa vista no existía, la
 * pantalla resolvía la pregunta enseñando el primer organismo de una lista
 * ordenada por otra cosa y presentaba sus números como si fueran los del
 * mercado. De ahí salían el «líder del rubro» que era el líder de un comprador
 * y la «participación» que era la de una fila suelta.
 *
 * Cuatro tarjetas y no una lista de doce indicadores: son las cuatro preguntas
 * que se hace alguien antes de decidir si le conviene este mercado — cuánto se
 * mueve, contra quién compito, cuándo compran, y de quién cuidarme.
 */

function Cifra({ children }: { children: React.ReactNode }) {
  return (
    <p className="cifra text-2xl font-bold leading-none text-text">
      {children}
    </p>
  );
}

function Tarjeta({
  icono: Icono,
  titulo,
  ayuda,
  children,
}: {
  icono: React.ElementType;
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <header className="mb-3 flex items-center gap-1.5">
        <Icono className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-text">{titulo}</h3>
        {ayuda && <InfoTooltip content={ayuda} />}
      </header>
      {children}
    </section>
  );
}

function SinDatos({ que }: { que: string }) {
  return <p className="text-sm text-subtle">Todavía no hay {que} para este rubro.</p>;
}

function plata(clp?: number | null): string {
  if (clp == null) return '—';
  if (clp >= 1e12) return `$${decimal(clp / 1e12, 1)} billones`;
  if (clp >= 1e9) return `$${decimal(clp / 1e9, 1)} mil millones`;
  if (clp >= 1e6) return `$${decimal(clp / 1e6, 0)} millones`;
  return `$${Math.round(clp).toLocaleString('es-CL')}`;
}

function entero(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString('es-CL');
}

const TONO_MERCADO: Record<string, string> = {
  fragmentado: 'text-accent',
  moderado: 'text-gold',
  concentrado: 'text-danger',
};

const EXPLICA_MERCADO: Record<string, string> = {
  fragmentado: 'Muchos proveedores se reparten el mercado: hay espacio para entrar.',
  moderado: 'Hay competidores fuertes, pero el mercado no está cerrado.',
  concentrado: 'Pocos proveedores concentran casi todo. Entrar cuesta más.',
};

function Lider({ lider }: { lider: PanoramaLider }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-text">{lider.nombre ?? 'Sin nombre'}</span>
      <span className="cifra shrink-0 text-xs text-muted">
        {lider.share_pct != null ? `${decimal(lider.share_pct, 1)}%` : '—'} del monto
        {/* La cuota por órdenes va al lado a propósito: en varios rubros el
            monto lo domina una sola compra enorme, y sin este número la lectura
            sería «este mercado está tomado» cuando lo que hay son compras
            chicas repartidas entre muchos. */}
        {lider.share_oc_pct != null && (
          <span className="text-subtle">, {decimal(lider.share_oc_pct, 1)}% de las órdenes</span>
        )}
      </span>
    </li>
  );
}

export function PanoramaRubro({
  panorama,
  cargando,
  rubro,
}: {
  panorama: Panorama | null | undefined;
  cargando: boolean;
  rubro: string;
}) {
  if (!rubro) return <EligeRubro que="cómo está ese mercado" />;

  if (cargando) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden="true" />
      </div>
    );
  }

  if (!panorama?.disponible) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          {motivoParaPersona(panorama?.motivo, 'No tenemos histórico de este rubro todavía.')}
        </p>
      </div>
    );
  }

  const { mercado, competencia, estacionalidad, vigilar } = panorama;

  return (
    <div className="space-y-4">
      {/* ── La franja de cabecera: el rubro en una línea ─────────────────── */}
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-xs text-muted">
              Se compró en {mercado?.anio ?? '—'}
            </p>
            <Cifra>{plata(mercado?.monto_clp)}</Cifra>
          </div>
          <div>
            <p className="text-xs text-muted">Órdenes</p>
            <Cifra>{entero(mercado?.n_oc)}</Cifra>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              Orden promedio
              <InfoTooltip content="Monto total dividido por número de órdenes. Es un promedio, no una mediana: el dato viene agregado por mes, así que no quedan órdenes sueltas sobre las que sacarla." />
            </p>
            <Cifra>{plata(mercado?.ticket_promedio_clp)}</Cifra>
          </div>
          <div>
            <p className="text-xs text-muted">Proveedores</p>
            <Cifra>{entero(competencia?.n_proveedores)}</Cifra>
          </div>
          <div>
            <p className="text-xs text-muted">Compradores</p>
            <Cifra>{entero(competencia?.n_compradores)}</Cifra>
          </div>
        </div>
      </div>

      {/* ── Las cuatro preguntas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta
          icono={Users}
          titulo="Contra quién compites"
          ayuda="Cuota de cada proveedor sobre el monto de TODO el rubro, sumando sus compradores. Antes esta cifra era la cuota dentro de un solo comprador."
        >
          {competencia?.disponible ? (
            <>
              <div className="mb-3 flex items-baseline gap-2">
                <span
                  className={`text-lg font-bold ${TONO_MERCADO[competencia.tipo_mercado ?? ''] ?? 'text-text'}`}
                >
                  Mercado {competencia.tipo_mercado ?? 'sin clasificar'}
                </span>
                {competencia.share_top5_pct != null && (
                  <span className="cifra text-xs text-muted">
                    los 5 primeros se llevan {competencia.share_top5_pct}%
                  </span>
                )}
              </div>
              {competencia.tipo_mercado && (
                <p className="mb-3 text-xs leading-relaxed text-muted">
                  {EXPLICA_MERCADO[competencia.tipo_mercado]}
                </p>
              )}
              <ul className="space-y-1.5 border-t border-border pt-3">
                {competencia.lideres.slice(0, 5).map((l) => (
                  <Lider key={`${l.nombre}-${l.share_pct}`} lider={l} />
                ))}
              </ul>
            </>
          ) : (
            <SinDatos que="datos de competencia" />
          )}
        </Tarjeta>

        <Tarjeta
          icono={CalendarRange}
          titulo="Cuándo compran"
          ayuda="Reparto de las compras del rubro a lo largo del año, sumando todos sus compradores. Con reparto plano cada mes sería un 8,3%."
        >
          {estacionalidad?.disponible ? (
            <>
              <div className="mb-3">
                <span
                  className="text-lg font-bold text-text"
                >
                  {estacionalidad.tiene_temporada
                    ? `Temporada alta en ${estacionalidad.mes_pico}`
                    : 'Compra pareja todo el año'}
                </span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-muted">
                {estacionalidad.tiene_temporada
                  ? `Los tres meses más activos concentran el ${estacionalidad.pct_top3}% del año. Conviene tener capacidad disponible antes.`
                  : `Los tres meses más activos suman ${estacionalidad.pct_top3}%, casi lo mismo que cualquier trimestre. No hay que planificar alrededor de una temporada.`}
              </p>
              {/* Doce barras y no un gráfico: para «¿cuándo compran?» la forma
                  basta, y una librería de gráficos aquí sería peso sin lectura
                  adicional. */}
              <div
                className="flex h-16 items-end gap-1"
                role="img"
                aria-label={`Reparto mensual de compras. Mes más activo: ${estacionalidad.mes_pico}`}
              >
                {estacionalidad.meses.map((m) => {
                  const alto = Math.max(6, (m.pct / (estacionalidad.pct_pico || 1)) * 100);
                  const esPico = m.nombre === estacionalidad.mes_pico;
                  return (
                    // `h-full` en la columna y la barra dentro de una caja
                    // `flex-1`: el alto en % de la barra se resuelve contra su
                    // padre, y sin alto definido en la columna valía cero — el
                    // gráfico salía con las letras de los meses y sin barras.
                    <div key={m.mes} className="flex h-full flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-sm ${esPico ? 'bg-accent' : 'bg-primary/25'}`}
                          style={{ height: `${alto}%` }}
                          title={`${m.nombre}: ${m.pct}%`}
                        />
                      </div>
                      <span className="text-[9px] text-subtle">{m.nombre[0]}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <SinDatos que="datos de estacionalidad" />
          )}
        </Tarjeta>
      </div>

      {/* ── Compradores a vigilar ────────────────────────────────────────── */}
      {vigilar?.disponible && vigilar.compradores.length > 0 && (
        <Tarjeta
          icono={AlertTriangle}
          titulo="Compradores a mirar con cuidado"
          ayuda="Compradores de este rubro con señales concretas en su historial. No significa que no haya que venderles: significa que conviene saberlo antes."
        >
          <p className="mb-3 text-xs text-muted">
            {vigilar.n_con_banderas} de {entero(vigilar.n_compradores_rubro)} compradores del rubro
            tienen alguna señal.
          </p>
          <ul className="space-y-2">
            {vigilar.compradores.slice(0, 5).map((c) => (
              <li key={c.codigo} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-text">{c.nombre ?? c.codigo}</span>
                <span className="text-xs text-muted">{c.motivos.join(', ')}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {vigilar?.disponible && vigilar.compradores.length === 0 && (
        <Tarjeta icono={TrendingUp} titulo="Compradores a mirar con cuidado">
          <p className="text-sm text-muted">
            Ninguno de los {entero(vigilar.n_compradores_rubro)} compradores de este rubro tiene
            señales en su historial.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

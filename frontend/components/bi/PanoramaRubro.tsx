'use client';

import { Loader2 } from 'lucide-react';

import { InfoTooltip } from './InfoTooltip';
import type { Panorama, PanoramaLider } from '@/types/bi';

import { EligeRubro } from './EligeRubro';
import { motivoParaPersona } from '@/lib/motivos';
import { Columnas } from '@/components/graficos/Columnas';
import { decimal, monto } from '@/lib/formato';
import { MESES_ANALISIS } from '@/lib/periodo';

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

/**
 * Un bloque del panorama: título, ayuda opcional y contenido, con un filete
 * arriba. Eran cuatro tarjetas iguales con icono; el filete separa igual sin
 * convertir la pantalla en un tablero de cajas.
 */
function Tarjeta({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4">
      <header className="mb-3 flex items-center gap-1.5">
        <h3 className="font-sans text-base font-semibold text-text">{titulo}</h3>
        {ayuda && <InfoTooltip content={ayuda} />}
      </header>
      {children}
    </section>
  );
}

function SinDatos({ que }: { que: string }) {
  return <p className="text-sm text-subtle">Todavía no tenemos {que} de este rubro.</p>;
}

/** La API manda el mes abreviado («Mar»); en una frase va entero. */
const MES_ENTERO: Record<string, string> = {
  Ene: 'enero', Feb: 'febrero', Mar: 'marzo', Abr: 'abril', May: 'mayo', Jun: 'junio',
  Jul: 'julio', Ago: 'agosto', Sep: 'septiembre', Oct: 'octubre', Nov: 'noviembre', Dic: 'diciembre',
};
const mesEntero = (abreviado?: string | null) => (abreviado ? (MES_ENTERO[abreviado] ?? abreviado) : '');

/** Porcentaje en es-CL: la API manda 34.5 y se pintaba «34.5%». */
const pct = (v?: number | null) => (v == null ? '—' : `${decimal(v, 1)} %`);

const plata = (clp?: number | null): string => (clp == null ? '—' : monto(clp));

function entero(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString('es-CL');
}

/** El tramo se dice con palabras; el color no juzga (el teal es de la acción). */
const TONO_MERCADO: Record<string, string> = {
  fragmentado: 'text-text',
  moderado: 'text-text',
  concentrado: 'text-text',
};

const EXPLICA_MERCADO: Record<string, string> = {
  fragmentado: 'Muchos proveedores se reparten las compras. Hay espacio para entrar.',
  moderado: 'Hay proveedores fuertes, pero ninguno se lleva todo.',
  concentrado: 'Unos pocos proveedores se llevan casi todo. Entrar cuesta más.',
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
  if (!rubro) return <EligeRubro que="sus cifras" />;

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
          {motivoParaPersona(panorama?.motivo, 'Todavía no tenemos historia de este rubro.')}
        </p>
      </div>
    );
  }

  const { mercado, competencia, estacionalidad, vigilar } = panorama;

  return (
    <div className="space-y-4">
      {/* ── La franja de cabecera: el rubro en una línea ─────────────────── */}
      <div className="border-y border-border py-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-xs text-muted">
              Comprado en {mercado?.anio ?? '—'}
            </p>
            <Cifra>{plata(mercado?.monto_clp)}</Cifra>
          </div>
          <div>
            <p className="text-xs text-muted">Órdenes de compra en {mercado?.anio ?? '—'}</p>
            <Cifra>{entero(mercado?.n_oc)}</Cifra>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              Monto promedio por orden
              <InfoTooltip content="Lo comprado en el año dividido por sus órdenes. Unas pocas órdenes grandes lo suben, así que la orden común suele ser más chica." />
            </p>
            <Cifra>{plata(mercado?.ticket_promedio_clp)}</Cifra>
          </div>
          <div>
            <p className="text-xs text-muted">Proveedores en {MESES_ANALISIS} meses</p>
            <Cifra>{entero(competencia?.n_proveedores)}</Cifra>
          </div>
          <div>
            <p className="text-xs text-muted">Compradores en {MESES_ANALISIS} meses</p>
            <Cifra>{entero(competencia?.n_compradores)}</Cifra>
          </div>
        </div>
      </div>

      {/* ── Las cuatro preguntas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta
          titulo="Contra quién compites"
          ayuda={`Qué parte del monto del rubro se lleva cada proveedor, sumando a todos los compradores, en los últimos ${MESES_ANALISIS} meses.`}
        >
          {competencia?.disponible ? (
            <>
              <div className="mb-3 flex items-baseline gap-2">
                <span
                  className={`text-lg font-bold ${TONO_MERCADO[competencia.tipo_mercado ?? ''] ?? 'text-text'}`}
                >
                  Rubro {competencia.tipo_mercado ?? 'sin clasificar'}
                </span>
                {competencia.share_top5_pct != null && (
                  <span className="cifra text-xs text-muted">
                    los 5 primeros se llevan el {pct(competencia.share_top5_pct)} del monto
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
            <SinDatos que="las ventas de cada proveedor" />
          )}
        </Tarjeta>

        <Tarjeta
          titulo="En qué meses se compra"
          ayuda="Qué parte de las compras del año cae en cada mes, sumando a todos los compradores del rubro. Si fuera parejo, cada mes tendría un 8,3 %."
        >
          {estacionalidad?.disponible ? (
            <>
              <div className="mb-3">
                <span
                  className="text-lg font-bold text-text"
                >
                  {estacionalidad.tiene_temporada
                    ? `Temporada alta en ${mesEntero(estacionalidad.mes_pico)}`
                    : 'Se compra parejo todo el año'}
                </span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-muted">
                {estacionalidad.tiene_temporada
                  ? `Los tres meses con más compras suman el ${pct(estacionalidad.pct_top3)} del año. Conviene llegar preparado antes de ${mesEntero(estacionalidad.mes_pico)}.`
                  : `Los tres meses con más compras suman el ${pct(estacionalidad.pct_top3)} del año, cerca del 25 % que les tocaría si fuera parejo. No hay una temporada que esperar.`}
              </p>
              <Columnas
                etiqueta={`Compras del rubro por mes. El mes con más compras es ${mesEntero(estacionalidad.mes_pico)}`}
                alto={64}
                textoArriba={false}
                columnas={estacionalidad.meses.map((m) => ({
                  clave: String(m.mes),
                  etiqueta: m.nombre.slice(0, 1),
                  valor: m.pct,
                  texto: `${mesEntero(m.nombre)}: ${pct(m.pct)}`,
                  destacada: m.nombre === estacionalidad.mes_pico,
                }))}
              />
            </>
          ) : (
            <SinDatos que="los meses de compra" />
          )}
        </Tarjeta>
      </div>

      {/* ── Compradores a vigilar ────────────────────────────────────────── */}
      {vigilar?.disponible && vigilar.compradores.length > 0 && (
        <Tarjeta
          titulo="Compradores a mirar con cuidado"
          ayuda="Compradores del rubro con alguna señal en su historia, como cancelar órdenes seguido o declarar desierto lo que licitan. Conviene saberlo antes de postular."
        >
          <p className="mb-3 text-xs text-muted">
            {entero(vigilar.n_con_banderas)} de los {entero(vigilar.n_compradores_rubro)} compradores del rubro
            tienen al menos una de estas señales.
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
        <Tarjeta titulo="Compradores a mirar con cuidado">
          <p className="text-sm text-muted">
            Ninguno de los {entero(vigilar.n_compradores_rubro)} compradores del rubro tiene señales de
            alerta en su historia.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

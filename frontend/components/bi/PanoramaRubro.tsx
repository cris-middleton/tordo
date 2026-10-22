'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { InfoTooltip } from './InfoTooltip';
import type { Panorama, PanoramaLider } from '@/types/bi';

import { EligeRubro } from './EligeRubro';
import { motivoParaPersona } from '@/lib/motivos';
import { Columnas } from '@/components/graficos/Columnas';
import { monto, porcentaje } from '@/lib/formato';
import { rutaComprador } from '@/lib/publico';
import { MESES_ANALISIS } from '@/lib/periodo';
import { normalizeText } from '@/lib/nombresChile';

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
 * Un bloque del panorama: de qué trata (una etiqueta chica, con su ayuda), la
 * conclusión como título y el detalle, con un filete arriba.
 *
 * **El título es la conclusión, no el tema** («Rubro fragmentado», «Se compra
 * parejo todo el año»): es lo que contesta el bloque (docs/VOZ.md, regla 1).
 * Antes el tema era un `h3` («Contra quién compites») y la conclusión un texto
 * grande sin rango de título; en la ficha pública del rubro, que no tiene `h2`
 * encima, el esquema saltaba de `h1` a `h3`. `nivel` lo elige quien lo usa: `h2`
 * en la ficha, `h3` en `/mercado`, dentro de su sección «Cómo está el rubro».
 * Sin conclusión (sin datos), no hay título: sólo la etiqueta y la línea vacía.
 */
function Tarjeta({
  tema,
  conclusion,
  ayuda,
  nivel,
  children,
}: {
  tema: string;
  conclusion?: React.ReactNode;
  ayuda?: string;
  nivel: NivelTitulo;
  children: React.ReactNode;
}) {
  const Titulo = nivel;
  return (
    <section className="border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {tema}
        {ayuda && <InfoTooltip content={ayuda} />}
      </p>
      {conclusion && <Titulo className="mt-1 mb-3 font-sans text-lg font-bold text-text">{conclusion}</Titulo>}
      <div className={conclusion ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

type NivelTitulo = 'h2' | 'h3';

function SinDatos({ que }: { que: string }) {
  return <p className="text-sm text-subtle">Todavía no tenemos {que} de este rubro.</p>;
}

/** La API manda el mes abreviado («Mar»); en una frase va entero. */
const MES_ENTERO: Record<string, string> = {
  Ene: 'enero', Feb: 'febrero', Mar: 'marzo', Abr: 'abril', May: 'mayo', Jun: 'junio',
  Jul: 'julio', Ago: 'agosto', Sep: 'septiembre', Oct: 'octubre', Nov: 'noviembre', Dic: 'diciembre',
};
const mesEntero = (abreviado?: string | null) => (abreviado ? (MES_ENTERO[abreviado] ?? abreviado) : '');

/** Porcentaje en es-CL: la API manda 34.5 y se pintaba «34.5%». Bajo 0,05, «menos de 0,1 %». */
const pct = (v?: number | null) => (v == null ? '—' : porcentaje(v));

const plata = (clp?: number | null): string => (clp == null ? '—' : monto(clp));

function entero(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString('es-CL');
}

/** El tramo se dice con palabras, y el color no juzga: va en la tinta del texto. */
const EXPLICA_MERCADO: Record<string, string> = {
  fragmentado: 'Muchos proveedores se reparten las compras. Hay espacio para entrar.',
  moderado: 'Hay proveedores fuertes, pero ninguno se lleva todo.',
  concentrado: 'Unos pocos proveedores se llevan casi todo. Entrar cuesta más.',
};

function Lider({ lider }: { lider: PanoramaLider }) {
  return (
    // En un teléfono, el nombre arriba y sus cifras debajo: en una línea, el nombre
    // quedaba en «Comercial de la F…».
    <li className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <span className="min-w-0 text-text sm:truncate">{lider.nombre ? normalizeText(lider.nombre) : 'Sin nombre'}</span>
      <span className="cifra shrink-0 text-xs text-muted">
        {lider.share_pct != null ? porcentaje(lider.share_pct) : '—'} del monto
        {/* La cuota por órdenes va al lado a propósito: en varios rubros el
            monto lo domina una sola compra enorme, y sin este número la lectura
            sería «este mercado está tomado» cuando lo que hay son compras
            chicas repartidas entre muchos. */}
        {lider.share_oc_pct != null && (
          <span className="text-subtle">, {porcentaje(lider.share_oc_pct)} de las órdenes</span>
        )}
      </span>
    </li>
  );
}

export function PanoramaRubro({
  panorama,
  cargando,
  rubro,
  nivel = 'h3',
}: {
  panorama: Panorama | null | undefined;
  cargando: boolean;
  rubro: string;
  /** El rango de las conclusiones: `h2` en la ficha pública (va justo bajo el `h1`), `h3` en `/mercado`. */
  nivel?: NivelTitulo;
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
          {/* Sólo las cifras que hay: tres «—» seguidos en la cabecera del rubro no decían nada. */}
          {[
            {
              clave: 'monto',
              rotulo: mercado?.anio != null ? `Comprado en ${mercado.anio}` : 'Comprado en el último año',
              valor: mercado?.monto_clp != null ? plata(mercado.monto_clp) : null,
            },
            {
              clave: 'ordenes',
              rotulo: mercado?.anio != null ? `Órdenes de compra en ${mercado.anio}` : 'Órdenes en el último año',
              valor: mercado?.n_oc != null ? entero(mercado.n_oc) : null,
            },
            {
              clave: 'ticket',
              rotulo: (
                <>
                  Monto promedio por orden
                  <InfoTooltip content="Lo comprado en el año dividido por sus órdenes. Unas pocas órdenes grandes lo suben, así que la orden común suele ser más chica." />
                </>
              ),
              valor: mercado?.ticket_promedio_clp != null ? plata(mercado.ticket_promedio_clp) : null,
            },
            {
              clave: 'proveedores',
              rotulo: `Proveedores en ${MESES_ANALISIS} meses`,
              valor: competencia?.n_proveedores != null ? entero(competencia.n_proveedores) : null,
            },
            {
              clave: 'compradores',
              rotulo: `Compradores en ${MESES_ANALISIS} meses`,
              valor: competencia?.n_compradores != null ? entero(competencia.n_compradores) : null,
            },
          ]
            .filter((c) => c.valor != null)
            .map((c) => (
              <div key={c.clave}>
                <p className="flex items-center gap-1 text-xs text-muted">{c.rotulo}</p>
                <Cifra>{c.valor}</Cifra>
              </div>
            ))}
        </div>
      </div>

      {/* ── Las cuatro preguntas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta
          tema="Contra quién compites"
          nivel={nivel}
          conclusion={competencia?.disponible ? `Rubro ${competencia.tipo_mercado ?? 'sin clasificar'}` : undefined}
          ayuda={`Qué parte del monto del rubro se lleva cada proveedor, sumando a todos los compradores, en los últimos ${MESES_ANALISIS} meses.`}
        >
          {competencia?.disponible ? (
            <>
              {(competencia.tipo_mercado || competencia.share_top5_pct != null) && (
                <p className="mb-3 text-sm leading-relaxed text-muted">
                  {competencia.tipo_mercado && EXPLICA_MERCADO[competencia.tipo_mercado]}
                  {competencia.share_top5_pct != null && (
                    <>
                      {competencia.tipo_mercado && EXPLICA_MERCADO[competencia.tipo_mercado] ? ' ' : ''}
                      Los 5 primeros se llevan el <span className="cifra">{pct(competencia.share_top5_pct)}</span> del
                      monto.
                    </>
                  )}
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
          tema="En qué meses se compra"
          nivel={nivel}
          conclusion={
            estacionalidad?.disponible
              ? estacionalidad.tiene_temporada
                ? `Temporada alta en ${mesEntero(estacionalidad.mes_pico)}`
                : 'Se compra parejo todo el año'
              : undefined
          }
          ayuda="Qué parte de las compras del año cae en cada mes, sumando a todos los compradores del rubro. Si fuera parejo, cada mes tendría un 8,3 %."
        >
          {estacionalidad?.disponible ? (
            <>
              <p className="mb-3 text-sm leading-relaxed text-muted">
                {estacionalidad.tiene_temporada
                  ? `Los tres meses con más compras suman el ${pct(estacionalidad.pct_top3)} del año. Conviene llegar preparado antes de ${mesEntero(estacionalidad.mes_pico)}.`
                  : `Los tres meses con más compras suman el ${pct(estacionalidad.pct_top3)} del año, cerca del 25 % que les tocaría si fuera parejo. No hay una temporada que esperar.`}
              </p>
              {/* El gráfico pinta en `dato` sólo lo que nombra su conclusión: con
                  temporada, el mes pico; «parejo» no nombra ningún mes, y resaltar
                  enero desmentía el título. */}
              <Columnas
                etiqueta={
                  estacionalidad.tiene_temporada
                    ? `Compras del rubro por mes. El mes con más compras es ${mesEntero(estacionalidad.mes_pico)}`
                    : 'Compras del rubro por mes, parejas a lo largo del año'
                }
                alto={64}
                textoArriba={false}
                columnas={estacionalidad.meses.map((m) => ({
                  clave: String(m.mes),
                  etiqueta: m.nombre.slice(0, 1),
                  valor: m.pct,
                  texto: `${mesEntero(m.nombre)}: ${pct(m.pct)}`,
                  destacada: estacionalidad.tiene_temporada && m.nombre === estacionalidad.mes_pico,
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
          tema="Compradores a mirar con cuidado"
          nivel={nivel}
          conclusion={`${entero(vigilar.n_con_banderas)} de los ${entero(vigilar.n_compradores_rubro)} compradores del rubro tienen alguna señal en su historia`}
          ayuda="Compradores del rubro con alguna señal en su historia, como cancelar órdenes seguido o declarar desierto lo que licitan. Conviene saberlo antes de postular."
        >
          {/* Cada nombre lleva a la ficha del comprador, que nombra sus señales:
              como la tabla «Quién compra más» de la ficha del rubro. */}
          <ul className="space-y-2">
            {vigilar.compradores.slice(0, 5).map((c) => (
              <li key={c.codigo} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link href={rutaComprador(c.codigo)} className="text-sm font-medium text-primary hover:text-accent">
                  {c.nombre ? normalizeText(c.nombre) : c.codigo}
                </Link>
                <span className="text-sm text-muted">{c.motivos.join(', ')}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {vigilar?.disponible && vigilar.compradores.length === 0 && (
        <Tarjeta
          tema="Compradores a mirar con cuidado"
          nivel={nivel}
          conclusion={`Ninguno de los ${entero(vigilar.n_compradores_rubro)} compradores del rubro tiene señales en su historia`}
        >
          {null}
        </Tarjeta>
      )}
    </div>
  );
}

/**
 * Textos de «Lo mejor de hoy en Compra Ágil», en lenguaje llano.
 *
 * El puntaje del backend es el producto de sus factores en [0, 1] (comprador,
 * tiempo y monto; la competencia viaja pero no pesa). Un número así no le dice
 * nada a quien cotiza, y **no se muestra** (rediseño §6.7): lo que sí le dice
 * algo es el dato del que sale cada factor —«Esta unidad: 524 órdenes de Compra Ágil», «cierra
 * en 20 h»—. Nunca un cociente: órdenes y publicadas no son la misma cosa.
 *
 * Funciones puras: las usan la pantalla, la portada y el RSS.
 */

import type { CompraAgilDestacada, CompradorCompraAgil } from '@/types/compraAgil';

import { formatCurrency } from './licitacionEstado';

const ZONA = 'America/Santiago';

const HORA = 3_600_000;

/**
 * Las horas de Santiago a las que corre el cron `frecuente`, que es el que trae
 * Compra Ágil. **Copia de `HORAS_HABILES` / `HORAS_FIN_DE_SEMANA` en
 * `etl/cron.py`**: si cambian allí, cambian aquí.
 */
export const HORAS_HABILES = [10, 13, 16, 19] as const;
export const HORAS_FIN_DE_SEMANA = [12] as const;

/**
 * El título de la lista, en todas partes: portada, `/compra-agil`, sus
 * metadatos, el RSS y el CTA. Uno solo porque la regla de §6.3 del rediseño lo
 * cambia entero: si el puntaje no ordena (criterio de §8.1.4, medido en
 * `backend/tests/test_orden_destacadas_instantanea.py`), la lista se titula
 * «Cierran pronto» y va por cierre. El criterio pasó (2/49 con el monto), así
 * que sigue siendo «Lo mejor de hoy en Compra Ágil».
 */
export const TITULO_DESTACADAS = 'Lo mejor de hoy en Compra Ágil';

/**
 * Qué ordena la lista, en una frase. La misma en la página, la portada, el RSS
 * y las preguntas frecuentes. **Dice lo que el orden usa hoy**: un comprador que
 * compra seguido por Compra Ágil (por unidad de compra), el monto (a igual
 * esfuerzo de cotizar, más monto) y el tiempo para preparar la oferta. No
 * promete pocas cotizaciones: la competencia no entra en el puntaje (ver
 * `MOSTRAR_COTIZACIONES`).
 */
export const DESCRIPCION_DESTACADAS =
  'Abiertas, de compradores que compran seguido por Compra Ágil, de monto mayor y con tiempo para preparar la oferta. El orden sale de esas tres reglas y de nada más.';

/**
 * La misma frase cuando **aún no hay historia por unidad** (`historia_disponible`
 * falso: entre el despliegue y la primera corrida semanal). El factor comprador
 * vale entonces lo mismo para todas, así que el orden es sólo tiempo y monto, y
 * decir «de compradores que compran seguido» sería prometer un criterio que no
 * ordena nada.
 */
export const DESCRIPCION_DESTACADAS_SIN_HISTORIA =
  'Abiertas, de monto mayor y con tiempo para preparar la oferta. Cuánto compra cada comprador todavía no entra en el orden: se calcula una vez por semana. El orden sale de esas reglas y de nada más.';

/**
 * La descripción que corresponde al estado de los datos que se muestran al lado.
 * Quien la pinta junto a una respuesta viva pasa `respuesta.historia_disponible
 * === true`: un valor ausente no debe prometer nada. `DESCRIPCION_DESTACADAS`
 * suelta describe el método (metadatos, preguntas frecuentes), no el estado.
 */
export function descripcionDestacadas(historiaDisponible: boolean): string {
  return historiaDisponible ? DESCRIPCION_DESTACADAS : DESCRIPCION_DESTACADAS_SIN_HISTORIA;
}

/** ¿Lleva número de puesto? No en «Cierran pronto»: un orden por cierre no es un ranking. */
export const CON_PUESTO = true;

/**
 * ¿Se dice el conteo de cotizaciones, en la tarjeta y en el RSS? **No**: la
 * compuerta G1 del plan 0a (rediseño §8.1) se cerró el 2026-10-15 y el conteo
 * NO se refresca: queda congelado en su primera lectura, y un «Nadie ha cotizado
 * aún» falso hace que alguien descarte una compra con competencia o cotice
 * creyendo que no la hay. Para encenderlo: ponerlo en `true` sólo cuando exista
 * un refresco de las abiertas en el ETL; la tarjeta y el RSS lo siguen solos. `DESCRIPCION_DESTACADAS` sólo debe volver a
 * prometer «pocas cotizaciones» si la competencia también vuelve al puntaje.
 */
export const MOSTRAR_COTIZACIONES = false;

/** Lo que se le da a una corrida para terminar, y de margen al comparar. */
const GRACIA = HORA;

const partesChile = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

function leTocaAlCron(instante: number): boolean {
  const partes = partesChile.formatToParts(new Date(instante));
  const dia = partes.find((p) => p.type === 'weekday')?.value;
  const hora = Number(partes.find((p) => p.type === 'hour')?.value);
  const horas: readonly number[] = dia === 'Sat' || dia === 'Sun' ? HORAS_FIN_DE_SEMANA : HORAS_HABILES;
  return horas.includes(hora);
}

/**
 * La corrida programada más reciente que ya debería haber terminado: la última
 * hora del horario en o antes de `ahora - 1 h`.
 *
 * Se retrocede de hora en hora en UTC y se mira la hora de Chile de cada una,
 * como hace `corrida_anterior` en `etl/cron.py`: así el día del cambio
 * de hora no se salta ni se repite ninguna.
 */
export function ultimaCorridaEsperada(ahora: number): number {
  let hora = Math.floor((ahora - GRACIA) / HORA) * HORA;
  for (let i = 0; i < 24 * 8; i++, hora -= HORA) {
    if (leTocaAlCron(hora)) return hora;
  }
  throw new Error('ninguna corrida programada en ocho días');
}

/**
 * ¿Se saltó la lista alguna corrida? **Se compara con el horario, no con un
 * número fijo de horas**: con «más de 8 h» el aviso saltaba cada noche de fin
 * de semana y cada mañana antes de las 10 —de viernes 19 h a lunes 10 h es lo
 * normal— y un aviso que salta en lo normal enseña a no leerlo.
 */
export function seSaltoUnaCorrida(actualizadoEn: number, ahora: number): boolean {
  return actualizadoEn < ultimaCorridaEsperada(ahora) - GRACIA;
}

/** Un conteo leído hace más que esto, respecto de la lista, ya no se dice «hasta ahora». */
const VIGENCIA_COTIZACIONES = 3 * HORA;

const fechaHoraCorta = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Las cotizaciones, con su hora si el conteo es viejo: «Nadie ha cotizado aún»
 * sobre una lectura de anteayer sería mentir (`ofertas_al` en la API).
 */
export function textoCompetencia(
  ofertas: number | null,
  ofertasAl: string | null = null,
  actualizadoEn: string | null = null,
): string {
  if (ofertas === null) return 'Sin dato de cotizaciones';
  const leido = ofertasAl ? Date.parse(ofertasAl) : Number.NaN;
  const lista = actualizadoEn ? Date.parse(actualizadoEn) : Number.NaN;
  if (Number.isFinite(leido) && Number.isFinite(lista) && lista - leido > VIGENCIA_COTIZACIONES) {
    const cuando = fechaHoraCorta.format(new Date(leido));
    if (ofertas === 0) return `Sin cotizaciones al ${cuando}`;
    return `${ofertas} ${ofertas === 1 ? 'cotización' : 'cotizaciones'} al ${cuando}`;
  }
  if (ofertas === 0) return 'Nadie ha cotizado aún';
  if (ofertas === 1) return '1 cotización hasta ahora';
  return `${ofertas} cotizaciones hasta ahora`;
}

/** Meses de la ventana de analítica, redondeados. «6 meses», no «180 días». */
export function mesesDeVentana(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null;
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (!Number.isFinite(dias) || dias <= 0) return null;
  return Math.max(1, Math.round(dias / 30.44));
}

function enMeses(meses: number | null): string {
  if (meses === null) return '';
  return meses === 1 ? ' en el último mes' : ` en ${meses} meses`;
}

/**
 * La historia de la unidad que compra, como conteo: «Esta unidad: 524 órdenes de
 * Compra Ágil en 6 meses». **Nunca un cociente**: «Adjudica 2.953 de 11» se leía
 * como un error, y órdenes y publicadas son cosas distintas en meses distintos
 * (CLAUDE.md, `compra_agil_mensual`). Dice «esta unidad» porque la cifra es de la
 * unidad de compra, no de su organismo (en la ficha del comprador conviven las dos).
 *
 * **Devuelve `null` si la historia aún no está disponible** (`historia_disponible`
 * false): entre el despliegue y la primera corrida semanal no se sabe nada de
 * ninguna unidad, y «sin historial» sería afirmar algo falso. Con historia, una
 * unidad ausente (`comprador` nulo) no tuvo órdenes en la ventana.
 */
export function textoComprador(
  comprador: CompradorCompraAgil | null,
  meses: number | null,
  historiaDisponible: boolean,
): string | null {
  if (!historiaDisponible) return null;
  const periodo = enMeses(meses);
  if (!comprador || comprador.ordenes === 0) {
    return `Esta unidad: sin órdenes de Compra Ágil${periodo}`;
  }
  const n = comprador.ordenes.toLocaleString('es-CL');
  return `Esta unidad: ${n} ${comprador.ordenes === 1 ? 'orden' : 'órdenes'} de Compra Ágil${periodo}`;
}

export function textoTiempo(horas: number): string {
  if (horas < 1) return 'Cierra en menos de 1 h';
  if (horas < 24) return `Cierra en ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return `Cierra en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

type MontoDeLista = Pick<CompraAgilDestacada, 'monto_estimado' | 'monto_es_tope'>;

/**
 * Bajo un monto que es el tope de Compra Ágil. Muchos compradores declaran el
 * tope en vez de lo que piensan gastar: «$7,2M» a secas se lee como una compra
 * grande, y es sólo el máximo que permite la modalidad. Por eso el monto va con
 * «Hasta» delante y esta línea debajo, y el orden no lo premia
 * (`backend/app/repositories/compra_agil.py`).
 */
export const NOTA_TOPE = 'Tope de Compra Ágil';

/** ¿Se dice como tope? Sólo con monto y con `monto_es_tope` explícito. */
export function esTopeCompraAgil(item: MontoDeLista): boolean {
  return Boolean(item.monto_estimado) && item.monto_es_tope === true;
}

/** El monto en una línea del RSS, o null sin monto. */
export function textoMontoRss(item: MontoDeLista): string | null {
  if (!item.monto_estimado) return null;
  const monto = formatCurrency(item.monto_estimado);
  return esTopeCompraAgil(item) ? `Hasta ${monto}, el tope de Compra Ágil` : `Monto estimado ${monto}`;
}

/** «Suele comprar entre $400K y $1.5M», o null sin datos. */
export function textoMontoTipico(comprador: CompradorCompraAgil | null): string | null {
  if (!comprador || comprador.monto_mediana === null) return null;
  const { monto_p25: p25, monto_p75: p75, monto_mediana: mediana } = comprador;
  if (p25 !== null && p75 !== null && p25 < p75) {
    return `Suele comprar entre ${formatCurrency(p25)} y ${formatCurrency(p75)} por orden`;
  }
  return `Su orden típica es de ${formatCurrency(mediana)}`;
}

/**
 * La ficha en Mercado Público. La Compra Ágil no trae una URL propia en el
 * dato; ésta es la del buscador público por código.
 */
export function urlMercadoPublico(codigo: string): string {
  return `https://buscador.mercadopublico.cl/ficha?code=${encodeURIComponent(codigo)}`;
}

/** El parámetro de `/compra-agil` con la búsqueda. Es el mismo nombre que entiende el backend. */
export const PARAMETRO_BUSQUEDA_COMPRA_AGIL = 'search';

/**
 * `/compra-agil` con una búsqueda puesta: el «ver todas» del bloque de Compra
 * Ágil de `/buscar`. Nadie arma esta URL a mano; la página lee el mismo
 * `PARAMETRO_BUSQUEDA_COMPRA_AGIL`.
 */
export function rutaCompraAgil(termino = ''): string {
  const limpio = termino.trim();
  if (!limpio) return '/compra-agil';
  return `/compra-agil?${new URLSearchParams({ [PARAMETRO_BUSQUEDA_COMPRA_AGIL]: limpio })}`;
}

export interface Frescura {
  /** «13:05» en hora de Chile. */
  hora: string;
  /** «lun 12 oct.» si no es de hoy; null si es de hoy. */
  dia: string | null;
  desactualizado: boolean;
}

/**
 * Cuándo se actualizó la lista y si hay que avisar.
 *
 * `ahora` llega de fuera (`hooks/useAhora.ts`) en vez de leerse aquí: un
 * `Date.now()` dentro del render no es puro, y en el servidor no se sabe la
 * hora del visitante. Con `ahora = null` no se avisa de nada.
 */
export function frescura(actualizadoEn: string | null, ahora: number | null): Frescura | null {
  if (!actualizadoEn) return null;
  const instante = Date.parse(actualizadoEn);
  if (!Number.isFinite(instante)) return null;
  const fecha = new Date(instante);
  const hora = new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  const diaDe = (d: Date) =>
    new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, dateStyle: 'short' }).format(d);
  const esDeHoy = ahora !== null && diaDe(fecha) === diaDe(new Date(ahora));
  const dia =
    ahora === null || esDeHoy
      ? null
      : new Intl.DateTimeFormat('es-CL', {
          timeZone: ZONA,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }).format(fecha);
  return {
    hora,
    dia,
    desactualizado: ahora !== null && seSaltoUnaCorrida(instante, ahora),
  };
}

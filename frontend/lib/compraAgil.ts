/**
 * Textos de «Lo mejor de hoy en Compra Ágil», en lenguaje llano.
 *
 * El puntaje del backend es el producto de tres factores en [0, 1]
 * (competencia, comprador, tiempo). Un número así no le dice nada a quien
 * cotiza; lo que sí le dice algo es el dato del que sale cada factor: «1
 * cotización hasta ahora», «adjudica 120 de 150 en 6 meses», «cierra en 20 h».
 *
 * Funciones puras: las usan la pantalla y el RSS.
 */

import type { CompradorCompraAgil } from '@/types/compraAgil';

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
 * como hace `ultima_hora_programada` en `etl/cron.py`: así el día del cambio
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

export function textoCompetencia(ofertas: number | null): string {
  if (ofertas === null) return 'Sin dato de cotizaciones';
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

export function textoComprador(
  comprador: CompradorCompraAgil | null,
  meses: number | null,
): string {
  if (!comprador) return 'Sin historial de este comprador en Compra Ágil';
  const periodo = enMeses(meses);
  if (comprador.publicadas) {
    return `Adjudica ${comprador.ordenes.toLocaleString('es-CL')} de ${comprador.publicadas.toLocaleString('es-CL')}${periodo}`;
  }
  const n = comprador.ordenes.toLocaleString('es-CL');
  return `${n} ${comprador.ordenes === 1 ? 'orden' : 'órdenes'} de Compra Ágil${periodo}`;
}

export function textoTiempo(horas: number): string {
  if (horas < 1) return 'Cierra en menos de 1 h';
  if (horas < 24) return `Cierra en ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return `Cierra en ${dias} ${dias === 1 ? 'día' : 'días'}`;
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

/**
 * Fechas y horas en hora de Chile, para lo que se pinta con fecha de calendario.
 *
 * La API manda instantes («2026-10-22T01:00:00Z»). Cortar los diez primeros
 * caracteres da el día en UTC: un cierre a las 22:00 de Santiago salía al día
 * siguiente. Y `date-fns` formatea en el huso del navegador, que no tiene por
 * qué ser el de Chile. Aquí todo pasa por `America/Santiago`.
 *
 * Funciones puras, sin dependencias: sirven en el servidor y en el navegador.
 */

export const ZONA_CHILE = 'America/Santiago';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Sólo una fecha, sin hora: «2026-10-04». Es ya un día de calendario y no se convierte. */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const formateador = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA_CHILE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

/** El año, mes, día, hora y minuto de un instante en Santiago. */
export function partesDeChile(instante: Date): Partes {
  const partes = formateador.formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
  };
}

/** Las partes de un texto de la API, o null si no es una fecha. Una fecha sola no se mueve de día. */
function leer(iso: string | null | undefined): (Partes & { conHora: boolean }) | null {
  // Lo que no es texto no es una fecha: la portada pinta lo que el backend
  // mande, y un campo mal formado no puede tumbarla.
  if (typeof iso !== 'string' || !iso) return null;
  const sola = iso.match(SOLO_FECHA);
  if (sola) {
    return { anio: Number(sola[1]), mes: Number(sola[2]), dia: Number(sola[3]), hora: 0, minuto: 0, conHora: false };
  }
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return { ...partesDeChile(new Date(t)), conHora: true };
}

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** «21 oct 2026», el día en Santiago. */
export function fechaCortaDeChile(iso: string | null | undefined): string | null {
  const p = leer(iso);
  return p ? `${p.dia} ${MESES_CORTOS[p.mes - 1]} ${p.anio}` : null;
}

/** «21 de octubre de 2026», y con `conHora` «21 de octubre de 2026, 18:00», en Santiago. */
export function fechaLargaDeChile(iso: string | null | undefined, conHora = false): string | null {
  const p = leer(iso);
  if (!p) return null;
  const fecha = `${p.dia} de ${MESES_LARGOS[p.mes - 1]} de ${p.anio}`;
  return conHora && p.conHora ? `${fecha}, ${dosCifras(p.hora)}:${dosCifras(p.minuto)}` : fecha;
}

/**
 * «Cierra el 22 oct a las 18:00». Sin «hoy» ni «en 3 h», a propósito: lo usa
 * lo que se sirve desde caché (la portada, media hora o más), donde una cuenta
 * atrás o un «hoy» envejecen sin que la página lo sepa.
 */
export function cierreFijo(iso: string | null | undefined): string | null {
  const p = leer(iso);
  if (!p || !p.conHora) return null;
  return `Cierra el ${p.dia} ${MESES_CORTOS[p.mes - 1]} a las ${dosCifras(p.hora)}:${dosCifras(p.minuto)}`;
}

/**
 * El instante en que en Santiago son las `hora`:00 de una fecha `AAAA-MM-DD`.
 * Para fechar lo que sólo tiene día (las notas de datos en el RSS): leída a
 * secas, «2026-10-20» es la medianoche UTC, que en Chile es la tarde anterior.
 */
export function instanteDeChile(fecha: string, hora: number): Date | null {
  const m = fecha.match(SOLO_FECHA);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const supuesto = Date.UTC(anio, mes - 1, dia, hora);
  // Lo que marca el reloj de Santiago en ese instante UTC, leído como si fuera
  // UTC: la diferencia es el desfase de Chile ese día (−3 o −4 h).
  const p = partesDeChile(new Date(supuesto));
  const desfase = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto) - supuesto;
  return new Date(supuesto - desfase);
}

/**
 * La hora a la que se genera una página de servidor. Un componente no puede llamar
 * a `Date.now()` (`react-hooks/purity`): una página ISR la lee una vez por
 * regeneración, junto con sus datos, y la pasa como prop.
 */
export async function horaDelRender(): Promise<number> {
  return Date.now();
}

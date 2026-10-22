/**
 * Textos y ayudantes de la portada (`app/page.tsx`). Puros y sin secretos.
 *
 * La portada v7 (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3): «¿Qué le vendes al
 * Estado?», sus ejemplos (`lib/buscar.ts`), las cifras vivas y la ficha; debajo,
 * las tres lecturas (`lib/lecturasPortada.ts`), la franja de hoy, «Lo mejor de
 * hoy» y las notas de datos. Lo que antes explicaba —qué es, de dónde salen los
 * datos, cómo se financia y las preguntas frecuentes— vive en `/acerca`.
 *
 * Las variables de servidor (`REPOSITORIO_URL`, `AUTOR_NOMBRE`, `AUTOR_URL`) NO
 * se leen aquí: llegan como argumento desde `app/page.tsx`, que es de servidor.
 * Así estas funciones se prueban sin tocar el entorno.
 */

import type { SectoresBI } from '@/types/bi';
import type { ResumenPortada } from '@/types/publico';

import { HORAS_FIN_DE_SEMANA, HORAS_HABILES, seSaltoUnaCorrida } from './compraAgil';
import { urlCatalogoAbiertas } from './filtrosCatalogo';
import { decimal, fechaCortaDeIntl } from './formato';
import { diaYHora, esConteo, esFechaOAusente } from './lecturasPortada';
import { normalizeText } from './nombresChile';
import { rangoDeMeses } from './periodo';
import { entero } from './publico';

/**
 * Si lo vivo de la portada sigue siendo de ahora. La portada se cachea media hora y
 * el resumen sale del cron frecuente: si el cron no corrió (el 21-10-2026 Railway
 * estuvo caído el día entero), la portada decía «Ahora puedes postular…» y «cierran
 * hoy o mañana» con el conteo de la tarde anterior, sin aviso.
 * - `alDia`: no se saltó ninguna corrida programada (`seSaltoUnaCorrida`, la misma
 *   regla del aviso de `/compra-agil`).
 * - `mismoDia`: el conteo es de hoy en Chile. Un sábado a las 9 lo último es del
 *   viernes a las 19 sin que falte ninguna corrida, y «hoy» sería el viernes.
 * Sin hora legible, las dos son falsas.
 */
export interface Vigencia {
  alDia: boolean;
  mismoDia: boolean;
}

const diaDeChile = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', year: 'numeric', month: 'numeric', day: 'numeric' });

export function vigenciaDelResumen(iso: string | null | undefined, ahora: number): Vigencia {
  const instante = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(instante)) return { alDia: false, mismoDia: false };
  return {
    alDia: !seSaltoUnaCorrida(instante, ahora),
    mismoDia: diaDeChile.format(instante) === diaDeChile.format(ahora),
  };
}

/** Vigente: lo que se lee sin `ahora` (los tests de siempre, que no fijan la hora). */
export const VIGENTE: Vigencia = { alDia: true, mismoDia: true };

/** Lo que se ve en el bloque vivo de la portada. El resto, en la página entera. */
export const DESTACADAS_EN_PORTADA = 5;

/**
 * Cuántas se piden para elegir esas cinco: con un comprador que publica diez
 * parecidas, las cinco primeras eran suyas (cuatro del mismo MOP el 21-10).
 */
export const DESTACADAS_PEDIDAS = 15;

/** Como mucho, cuántas de un mismo comprador entre las de la portada. */
export const POR_COMPRADOR_EN_PORTADA = 2;

/**
 * Las primeras `n` en su orden, con como mucho `porComprador` de cada comprador
 * (por nombre del organismo: la Compra Ágil no trae su código). Si no alcanzan,
 * se completa con las que quedaron fuera, en su orden: mejor cinco que tres.
 */
export function variadas<T extends { nombre_organismo: string | null }>(items: T[], n: number, porComprador: number): T[] {
  const cuenta = new Map<string, number>();
  const elegidas: T[] = [];
  const fuera: T[] = [];
  for (const item of items) {
    const clave = (item.nombre_organismo ?? '').trim().toLowerCase();
    const ya = cuenta.get(clave) ?? 0;
    if (ya < porComprador && elegidas.length < n) {
      elegidas.push(item);
      cuenta.set(clave, ya + 1);
    } else fuera.push(item);
  }
  if (elegidas.length < n) {
    const completar = new Set(fuera.slice(0, n - elegidas.length));
    return items.filter((i) => elegidas.includes(i) || completar.has(i));
  }
  return elegidas;
}

/**
 * «lun 12 oct, 13:05», en hora de Chile. Con el día siempre: la portada se
 * cachea, así que «a las 13:05» a secas no diría si es de hoy o de ayer, y en
 * el servidor no se sabe la fecha del visitante.
 */
export function actualizadoEnPalabras(iso: string | null): string | null {
  if (!iso) return null;
  const instante = Date.parse(iso);
  if (!Number.isFinite(instante)) return null;
  const fecha = new Date(instante);
  const zona = 'America/Santiago';
  const dia = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(fecha);
  // «jue 22 oct», sin la coma tras el día: «Actualizado el jue, 22 oct» se leía torpe.
  const diaLimpio = fechaCortaDeIntl(dia);
  const hora = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return `${diaLimpio}, ${hora}`;
}

export interface CifraPortada {
  /** «4.274». */
  numero: string;
  /** «licitaciones abiertas»: con el número delante es el nombre del enlace. */
  etiqueta: string;
  /** El catálogo con esas mismas abiertas: el número que se lee es el total que se encuentra. */
  href: string;
}

export interface TiraPortada {
  cifras: [CifraPortada, CifraPortada];
  /**
   * «mié 14 oct, 11:00», en hora de Chile. La tira no la pinta (la dice la
   * franja), pero sin hora legible no hay tira.
   */
  actualizado: string;
  /**
   * Con el conteo atrasado (`Vigencia.alDia` falso), de cuándo es: «el martes 20 de
   * octubre a las 19:13». La frase deja de decir «Ahora». Al día, null.
   */
  atrasado: string | null;
}

/**
 * La tira de cifras de la portada, o `null` si no se muestra. **Toda cifra viva
 * lleva su hora** (principio 4): sin resumen —el backend falló— o con un
 * `actualizado_en` nulo o que no se puede leer, la tira se oculta entera en vez de
 * enseñar números sin fecha. Cada cifra enlaza al catálogo con el mismo filtro que
 * la cuenta (`urlCatalogoAbiertas`), también la de Compra Ágil.
 */
export function tiraDeLaPortada(resumen: ResumenPortada | null, vigencia: Vigencia = VIGENTE): TiraPortada | null {
  if (!resumen) return null;
  const actualizado = actualizadoEnPalabras(resumen.actualizado_en);
  if (!actualizado) return null;
  const lic = resumen.licitaciones_abiertas;
  const ca = resumen.compra_agil_abiertas;
  return {
    cifras: [
      {
        numero: entero(lic),
        etiqueta: lic === 1 ? 'licitación abierta' : 'licitaciones abiertas',
        href: urlCatalogoAbiertas('licitaciones'),
      },
      {
        numero: entero(ca),
        etiqueta: ca === 1 ? 'Compra Ágil abierta' : 'Compras Ágiles abiertas',
        href: urlCatalogoAbiertas('compra_agil'),
      },
    ],
    actualizado,
    atrasado: vigencia.alDia ? null : diaYHora(resumen.actualizado_en),
  };
}

/** Bajo la pregunta: qué hace la búsqueda, en una frase (spec PORTADA_V7 §3.8). */
export const SUBTITULO_PORTADA = 'Escribe lo que vendes. Te mostramos a qué precio lo compró el Estado, quién lo compra y dónde postular hoy.';

/** El `h1` de la portada. Sin signos de pregunta: dice lo que el sitio responde. */
export const TITULO_PORTADA = 'Cuánto paga el Estado por lo que vendes';

/** El nombre del campo: el `h1` ya no es su etiqueta. */
export const ETIQUETA_BUSCADOR = 'Producto o servicio que vendes';

/** El campo no repite los ejemplos: ya están debajo (spec §3.1). */
export const PLACEHOLDER_BUSCADOR = 'Un producto o un servicio';

/** «una», «4»: cuántas, para leerlo en una frase. */
const cuantas = (n: number) => (n === 1 ? 'una' : String(n));
const veces = (n: number) => `${cuantas(n)} ${n === 1 ? 'vez' : 'veces'}`;

/**
 * «4 veces al día de lunes a viernes y una al día el fin de semana»: cada cuánto
 * se consulta la API de Mercado Público. Sale del horario del cron frecuente
 * (`HORAS_HABILES` y `HORAS_FIN_DE_SEMANA`, copia de `etl/cron.py`). «De lunes a
 * viernes» y no «cada día hábil»: el cron corre también los festivos.
 */
export const FRECUENCIA_CATALOGO =
  `${veces(HORAS_HABILES.length)} al día de lunes a viernes y ` +
  `${cuantas(HORAS_FIN_DE_SEMANA.length)} al día el fin de semana`;

/**
 * «Licitaciones y Compras Ágiles, hasta 4 veces al día. Precios y mercados, cada
 * domingo.», en la ficha (spec PORTADA_V7 §3.5). «Hasta»: el fin de semana es una.
 * El detalle del horario está en `FRECUENCIA_CATALOGO` (`/acerca`, `/compra-agil`);
 * la ficha es una franja de cuatro celdas y no le cabe. El semanal corre los
 * domingos (`etl/cron.py`, `semanal`).
 */
export const SE_ACTUALIZA =
  `Licitaciones y Compras Ágiles, hasta ${veces(Math.max(HORAS_HABILES.length, HORAS_FIN_DE_SEMANA.length))} al día. ` +
  'Precios y mercados, cada domingo.';

/** «Datos abiertos de ChileCompra»: la fila «Fuente» de la ficha. */
export const FUENTE_PORTADA = 'Datos abiertos de ChileCompra';

/** «5,48 millones de órdenes de compra», «950.000 órdenes de compra»: millones con dos decimales y coma. */
function ordenesDeCompra(n: number): string {
  if (n < 999_995) return `${entero(n)} ${n === 1 ? 'orden' : 'órdenes'} de compra`;
  const millones = decimal(n / 1e6, 2).replace(/,00$/, '');
  return `${millones} ${millones === '1' ? 'millón' : 'millones'} de órdenes de compra`;
}

/**
 * La fila «Base» de la ficha (spec PORTADA_V7 §3.5, V6): «5,48 millones de
 * órdenes de compra, nov 2023 a oct 2026». **Calculada desde `GET /bi/sector`,
 * nunca escrita a mano**: la suma de `n_oc` de todos los sectores y la ventana
 * mínima y máxima de sus filas. Una cifra escrita a mano se queda vieja sin que
 * nada falle.
 *
 * `null` —la fila no sale— sin analytics (503 o tabla ausente), sin `n_oc` en
 * alguna fila (un backend anterior: la suma mentiría), con suma 0 o sin ventana.
 */
export function baseDeLaFicha(sectores: SectoresBI | null): string | null {
  if (!sectores?.disponible || !sectores.sectores?.length) return null;
  const filas = sectores.sectores;
  if (!filas.every((f) => esConteo(f.n_oc))) return null;
  const total = filas.reduce((suma, f) => suma + (f.n_oc as number), 0);
  if (total === 0) return null;
  const fechas = (clave: 'ventana_desde' | 'ventana_hasta') =>
    filas
      .map((f) => f[clave])
      .filter((v): v is string => typeof v === 'string' && esFechaOAusente(v))
      .sort();
  const desde = fechas('ventana_desde')[0];
  const hasta = fechas('ventana_hasta').at(-1);
  const periodo = rangoDeMeses(desde, hasta);
  if (!periodo) return null;
  return `${ordenesDeCompra(total)}, ${periodo}`;
}

/** La franja bajo las dos columnas (spec §3.6). `null` = esa celda no se pinta. */
export interface DatosFranja {
  /**
   * «612 licitaciones y Compras Ágiles»: el número con lo que cuenta, que son las
   * dos cosas. Sin publicaciones hoy —cada madrugada—, null.
   */
  publicadasHoy: string | null;
  /** El organismo que más publicó hoy, como lo escribe «Lo mejor de hoy». */
  masPublicaHoy: string | null;
  /** «mié 14 oct, 13:17»: con el día, porque la portada se cachea. */
  actualizado: string;
  /**
   * El rótulo de las dos primeras celdas: «Publicadas hoy» y «Más publica hoy» si
   * el conteo es de hoy; si no, «Publicadas el mar 20 oct» y «Más publicó ese día».
   */
  rotuloPublicadas: string;
  rotuloMasPublica: string;
}

/**
 * La franja, o `null` sin resumen o sin hora legible (principio 4). Con 0
 * publicadas hoy se ocultan las dos primeras celdas; un backend anterior, que no
 * manda los campos, deja sólo la hora. Ningún campo mal formado lanza.
 */
export function franjaDeLaPortada(resumen: ResumenPortada | null, vigencia: Vigencia = VIGENTE): DatosFranja | null {
  if (!resumen) return null;
  const actualizado = actualizadoEnPalabras(resumen.actualizado_en);
  if (!actualizado) return null;
  const n = resumen.publicadas_hoy;
  const hay = esConteo(n) && n > 0;
  const nombre = typeof resumen.mas_publica_hoy === 'string' ? resumen.mas_publica_hoy.trim() : '';
  return {
    publicadasHoy: hay ? `${entero(n)} ${n === 1 ? 'licitación o Compra Ágil' : 'licitaciones y Compras Ágiles'}` : null,
    masPublicaHoy: hay && nombre ? normalizeText(nombre) : null,
    actualizado,
    rotuloPublicadas: vigencia.mismoDia ? 'Publicadas hoy' : `Publicadas el ${actualizado.replace(/, \d\d:\d\d$/, '')}`,
    rotuloMasPublica: vigencia.mismoDia ? 'Más publica hoy' : 'Más publicó ese día',
  };
}

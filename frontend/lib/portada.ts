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

import { HORAS_FIN_DE_SEMANA, HORAS_HABILES } from './compraAgil';
import { urlCatalogoAbiertas } from './filtrosCatalogo';
import { decimal } from './formato';
import { esConteo, esFechaOAusente } from './lecturasPortada';
import { normalizeText } from './nombresChile';
import { MESES_PRECIOS, rangoDeMeses } from './periodo';
import { entero } from './publico';

/** Lo que se ve en el bloque vivo de la portada. El resto, en la página entera. */
export const DESTACADAS_EN_PORTADA = 5;

/**
 * «lun, 12 oct, 13:05», en hora de Chile. Con el día siempre: la portada se
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
    .format(fecha)
    .replace(/\.$/, '');
  const hora = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return `${dia}, ${hora}`;
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
   * «mié, 14 oct, 11:00», en hora de Chile. La tira no la pinta (la dice la
   * franja), pero sin hora legible no hay tira.
   */
  actualizado: string;
}

/**
 * La tira de cifras de la portada, o `null` si no se muestra. **Toda cifra viva
 * lleva su hora** (principio 4): sin resumen —el backend falló— o con un
 * `actualizado_en` nulo o que no se puede leer, la tira se oculta entera en vez de
 * enseñar números sin fecha. Cada cifra enlaza al catálogo con el mismo filtro que
 * la cuenta (`urlCatalogoAbiertas`), también la de Compra Ágil.
 */
export function tiraDeLaPortada(resumen: ResumenPortada | null): TiraPortada | null {
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
  };
}

/** Bajo la pregunta: qué hace la búsqueda, en una frase (spec PORTADA_V7 §3.8). */
export const SUBTITULO_PORTADA = `Escribe tu producto. Te mostramos a qué precio lo compró el Estado en los últimos ${MESES_PRECIOS} meses, quién lo compra y dónde postular hoy.`;

/** El `h1` de la portada. Sin signos de pregunta: dice lo que el sitio responde. */
export const TITULO_PORTADA = 'Cuánto paga el Estado por lo que vendes';

/** El nombre del campo: el `h1` ya no es su etiqueta. */
export const ETIQUETA_BUSCADOR = 'Producto o servicio que vendes';

/** El campo no repite los ejemplos: ya están debajo (spec §3.1). */
export const PLACEHOLDER_BUSCADOR = 'Escribe un producto o servicio';

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
 * «El catálogo, 4 veces al día de lunes a viernes y una al día el fin de semana.
 * Los precios y los mercados, cada domingo.», en la ficha (spec PORTADA_V7 §3.5).
 * El semanal corre los domingos (`etl/cron.py`, `semanal`).
 */
export const SE_ACTUALIZA =
  `Licitaciones y Compras Ágiles, ${veces(HORAS_HABILES.length)} al día de lunes a viernes y ` +
  `${cuantas(HORAS_FIN_DE_SEMANA.length)} el fin de semana. Precios y mercados, cada domingo.`;

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
  /** «mié, 14 oct, 13:17»: con el día, porque la portada se cachea. */
  actualizado: string;
}

/**
 * La franja, o `null` sin resumen o sin hora legible (principio 4). Con 0
 * publicadas hoy se ocultan las dos primeras celdas; un backend anterior, que no
 * manda los campos, deja sólo la hora. Ningún campo mal formado lanza.
 */
export function franjaDeLaPortada(resumen: ResumenPortada | null): DatosFranja | null {
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
  };
}

/**
 * Textos y ayudantes de la portada (`app/page.tsx`). Puros y sin secretos.
 *
 * La portada es un buscador (spec del rediseño §6.3 e IDENTIDAD_Y_PORTADA §3):
 * «¿Qué le vendes al Estado?», sus ejemplos (`lib/buscar.ts`), las cifras vivas,
 * la ficha y la franja de hoy, «Lo mejor de hoy» y lo abierto. Las tres lecturas
 * del panel viven en `lib/lecturasPortada.ts`. Lo que antes explicaba —qué es,
 * de dónde salen los datos, cómo se financia y las preguntas frecuentes— vive en
 * `/acerca` (`lib/acerca.ts`).
 *
 * Las variables de servidor (`REPOSITORIO_URL`, `RESPONSABLE_LEGAL`) NO se leen
 * aquí: llegan como argumento desde `app/page.tsx`, que es de servidor. Así
 * estas funciones se prueban sin tocar el entorno.
 */

import type { ResumenPortada } from '@/types/publico';

import { HORAS_HABILES } from './compraAgil';
import { urlCatalogoAbiertas } from './filtrosCatalogo';
import { esConteo } from './lecturasPortada';
import type { EnlaceNavegacion } from './navegacion';
import { normalizeText } from './nombresChile';
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

/**
 * «Úsalo como quieras» (spec §6.3): lo abierto, cada cosa a su sección de
 * `/abierto`. CSV y RSS van a la misma (`#datos`), que explica los dos.
 * «Código» sólo con el repositorio publicado (`urlRepositorio()`): mientras siga
 * privado (R8) no se enlaza nada.
 */
export function usosAbiertos(repositorio: string | null): EnlaceNavegacion[] {
  const usos: EnlaceNavegacion[] = [
    { nombre: 'API', href: '/abierto#api' },
    { nombre: 'MCP para Claude y ChatGPT', href: '/abierto#mcp' },
    { nombre: 'CSV', href: '/abierto#datos' },
    { nombre: 'RSS', href: '/abierto#datos' },
  ];
  if (repositorio) usos.push({ nombre: 'Código', href: repositorio, externo: true });
  return usos;
}

/** Bajo la pregunta: qué hace la búsqueda, en una frase (spec §6.2). */
export const SUBTITULO_PORTADA =
  'Escribe lo que vendes. Te mostramos cuánto ha pagado el Estado, quién lo compra y qué está abierto hoy.';

/** El campo no repite los ejemplos: ya están debajo (spec §3.1). */
export const PLACEHOLDER_BUSCADOR = 'Un producto o un servicio';

/**
 * «4 veces cada día hábil; el análisis, cada semana», en la ficha. El número sale
 * del horario del cron frecuente (`HORAS_HABILES`, copia de `etl/cron.py`): si el
 * cron cambia, la frase cambia con él.
 */
export const SE_ACTUALIZA = `${HORAS_HABILES.length} veces cada día hábil; el análisis, cada semana`;

/** La franja bajo las dos columnas (spec §3.6). `null` = esa celda no se pinta. */
export interface DatosFranja {
  /** «612». Sin publicaciones hoy —cada madrugada—, null. */
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
    publicadasHoy: hay ? entero(n) : null,
    masPublicaHoy: hay && nombre ? normalizeText(nombre) : null,
    actualizado,
  };
}

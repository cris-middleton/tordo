/**
 * Textos y ayudantes de la portada (`app/page.tsx`). Puros y sin secretos.
 *
 * La portada es un buscador (spec del rediseño §6.3): «¿Qué le vendes al
 * Estado?», sus ejemplos (`lib/buscar.ts`), una tira de cifras vivas, «Lo mejor
 * de hoy» y lo abierto. Lo que antes explicaba —qué es, de dónde salen los
 * datos, cómo se financia y las preguntas frecuentes— vive en `/acerca`
 * (`lib/acerca.ts`).
 *
 * Las variables de servidor (`REPOSITORIO_URL`, `RESPONSABLE_LEGAL`) NO se leen
 * aquí: llegan como argumento desde `app/page.tsx`, que es de servidor. Así
 * estas funciones se prueban sin tocar el entorno.
 */

import type { ResumenPortada } from '@/types/publico';

import { urlCatalogoAbiertas } from './filtrosCatalogo';
import type { EnlaceNavegacion } from './navegacion';
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
  /** «4.274 licitaciones abiertas». */
  texto: string;
  /** El catálogo con esas mismas abiertas: el número que se lee es el total que se encuentra. */
  href: string;
}

export interface TiraPortada {
  cifras: [CifraPortada, CifraPortada];
  /** «mié, 14 oct, 11:00», en hora de Chile. */
  actualizado: string;
}

function contar(n: number, singular: string, plural: string): string {
  return `${entero(n)} ${n === 1 ? singular : plural}`;
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
  return {
    cifras: [
      {
        texto: contar(resumen.licitaciones_abiertas, 'licitación abierta', 'licitaciones abiertas'),
        href: urlCatalogoAbiertas('licitaciones'),
      },
      {
        texto: contar(resumen.compra_agil_abiertas, 'Compra Ágil abierta', 'Compras Ágiles abiertas'),
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

/**
 * La frase de lo libre, bajo el buscador. «Código abierto» sólo cuando lo es: con
 * el repositorio aún privado (R8) diría algo falso (principio 6).
 */
export function lemaPortada(repositorio: string | null): string {
  return repositorio
    ? 'Gratis (de verdad). Sin cuentas, sin publicidad. Código y API abiertos.'
    : 'Gratis (de verdad). Sin cuentas, sin publicidad. API abierta.';
}

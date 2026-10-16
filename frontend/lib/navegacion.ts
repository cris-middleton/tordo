/**
 * La navegación del sitio, en UNA lista (spec del rediseño §6.1 y §6.2).
 *
 * De aquí salen la fila de la cabecera en escritorio, el menú móvil y el mapa
 * del pie (`components/cascara/`). Antes había dos menús —el de la barra lateral
 * del panel y el de la cabecera pública— con nombres distintos para la misma
 * página: «Inteligencia de mercado» frente a «Mercados», «Precios por producto»
 * frente a «Precios». Una sección nueva se añade aquí y en ningún otro sitio.
 *
 * **No importa nada**: lo lee también Playwright (`e2e/enlaces.spec.ts`,
 * `e2e/cascara.spec.ts`), que no resuelve el alias `@/`.
 */

export interface EnlaceNavegacion {
  nombre: string;
  /** Ruta interna, o una URL `https://` si `externo`. */
  href: string;
  /** Fuera del sitio: se pinta con `<a>` y nunca se marca como sección activa. */
  externo?: boolean;
}

/**
 * Las secciones, en el orden de la cabecera. Nombres llanos (R10): «Compra Ágil»
 * y no «Hoy», que no decía qué es (spec PORTADA_V7, V12).
 */
export const SECCIONES: readonly EnlaceNavegacion[] = [
  { nombre: 'Compra Ágil', href: '/compra-agil' },
  { nombre: 'Licitaciones', href: '/licitaciones' },
  { nombre: 'Precios', href: '/productos' },
  { nombre: 'Mercados', href: '/mercado' },
  { nombre: 'Guías', href: '/guias' },
  { nombre: 'Notas', href: '/notas' },
];

/** Lo guardado en este navegador. En la cabecera es un ícono con contador; en el pie, un enlace más. */
export const GUARDADOS: EnlaceNavegacion = { nombre: 'Guardados', href: '/guardados' };

/**
 * Lo abierto: «API y MCP» siempre; «Código» sólo con el repositorio publicado
 * (`urlRepositorio()`, variable de servidor: quien llama es un componente de servidor).
 */
export function enlacesAbiertos(repositorio: string | null): EnlaceNavegacion[] {
  const enlaces: EnlaceNavegacion[] = [{ nombre: 'API y MCP', href: '/abierto' }];
  if (repositorio) enlaces.push({ nombre: 'Código', href: repositorio, externo: true });
  return enlaces;
}

/** Todo lo navegable de la cabecera, más guardados: secciones, guardados y lo abierto. */
export function mapaDelSitio(repositorio: string | null): EnlaceNavegacion[] {
  return [...SECCIONES, GUARDADOS, ...enlacesAbiertos(repositorio)];
}

export interface ColumnaDelPie {
  titulo: string;
  enlaces: EnlaceNavegacion[];
}

/**
 * Las columnas del pie (spec PORTADA_V7 §6): «Sitio» (las secciones y Guardados),
 * «Abierto» (API y MCP, Código, Licencias) y «Sobre el sitio». La cuarta, «Lo
 * hace», depende de `AUTOR_NOMBRE` y la pone el pie. `correo` llega como
 * parámetro porque este fichero no importa nada.
 */
export function columnasDelPie(repositorio: string | null, correo: string): ColumnaDelPie[] {
  return [
    { titulo: 'Sitio', enlaces: [...SECCIONES, GUARDADOS] },
    {
      titulo: 'Abierto',
      enlaces: [...enlacesAbiertos(repositorio), { nombre: 'Licencias', href: '/abierto#licencias' }],
    },
    {
      titulo: 'Sobre el sitio',
      enlaces: [
        { nombre: 'Acerca', href: '/acerca' },
        { nombre: 'Cuánto cuesta', href: '/apoyar#costos' },
        { nombre: 'Apoyar', href: '/apoyar' },
        { nombre: 'Términos de uso', href: '/terminos' },
        { nombre: 'Privacidad', href: '/privacidad' },
        { nombre: 'Contacto', href: `mailto:${correo}`, externo: true },
      ],
    },
  ];
}

/**
 * Si `ruta` cae dentro de la sección `href`, por segmentos: `/licitaciones/X`
 * sí, `/licitacionesx` no (el `startsWith` de la barra lateral los confundía).
 * La portada (`/`) y lo externo no son secciones.
 */
export function esSeccionActiva(ruta: string, href: string): boolean {
  if (!href.startsWith('/') || href === '/') return false;
  return ruta === href || ruta.startsWith(`${href}/`);
}

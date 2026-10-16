/**
 * El contenedor único del sitio (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §4, V9).
 *
 * Lo usan la cabecera, el pie y TODA página, así que el contenido arranca en un
 * solo borde izquierdo: a 1440 px eran cuatro (168, 176, 192 y 232) porque cada
 * layout ponía su ancho y su relleno. Ninguna página fija `max-w-*` ni relleno
 * lateral por su cuenta: las de lectura limitan su TEXTO a `max-w-3xl` dentro,
 * alineado a la izquierda, no centrado.
 *
 * `pagina` añade el tope y el pie de la página: 48 px desde la cabecera hasta el
 * `h1` en escritorio y 24 en móvil, en toda página (`e2e/escala.spec.ts`). Por eso
 * nada va antes del `h1`: ni un antetítulo ni un «← volver».
 *
 * Componente de servidor, sin color: `__tests__/cabecera.test.tsx` vigila la carpeta.
 */
export const CLASE_CONTENEDOR = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

/** Tope y pie de una página, en la escala de §4 (24/48 arriba, 48/64 abajo). */
export const CLASE_PAGINA = 'pt-6 pb-12 lg:pt-12 lg:pb-16';

export function Contenedor({
  pagina = false,
  className = '',
  children,
}: {
  /** Una página entera: con el tope hasta el `h1` y el espacio antes del pie. */
  pagina?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const clases = [CLASE_CONTENEDOR, pagina ? CLASE_PAGINA : '', className].filter(Boolean).join(' ');
  return <div className={clases}>{children}</div>;
}

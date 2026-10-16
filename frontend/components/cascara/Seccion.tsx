/**
 * Una sección de página (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §4): un `<section>`
 * con su `h2` opcional y LA separación entre secciones del sitio, 64 px en
 * escritorio y 32 en móvil. Antes convivían seis (20, 24, 32, 40, 48 y la del panel),
 * y la distancia no decía nada de la relación entre las piezas.
 *
 * El `h2` es `section-title` (22 px, `app/globals.css`); del título al contenido, 16.
 * Componente de servidor, sin color crudo (`__tests__/cabecera.test.tsx`).
 */
export function Seccion({
  id,
  titulo,
  descripcion,
  className = '',
  children,
}: {
  /** Ancla de la sección (`/abierto#mcp`, `/apoyar#costos`). */
  id?: string;
  titulo?: string;
  descripcion?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const cabecera = Boolean(titulo || descripcion);
  return (
    <section id={id} className={`mt-8 scroll-mt-6 lg:mt-16 ${className}`.trim()}>
      {titulo && <h2 className="section-title">{titulo}</h2>}
      {descripcion && <p className="mt-2 max-w-3xl text-sm text-muted">{descripcion}</p>}
      {cabecera ? <div className="mt-4">{children}</div> : children}
    </section>
  );
}

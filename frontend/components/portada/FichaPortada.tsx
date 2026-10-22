import { FUENTE_PORTADA, SE_ACTUALIZA } from '@/lib/portada';

/**
 * La ficha bajo las cifras (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.5): de qué
 * base sale todo, de dónde, cada cuánto y quién lo hace. Datos concretos, no una
 * lista de ✓.
 *
 * - **Base** sale de `GET /bi/sector` (`baseDeLaFicha`), nunca escrita a mano; sin
 *   analytics o sin ventana, la fila no sale.
 * - **Se actualiza** sale del horario del cron (`SE_ACTUALIZA`).
 * - **Lo hace** sólo con `AUTOR_NOMBRE`, y el nombre enlaza a `AUTOR_URL` si está;
 *   detrás, el rol de `AUTOR_ROL` si lo hay (sin rol, el nombre solo).
 *   Firma la autoría, no el responsable legal.
 *
 * «Se usa» se fue (V11): la salida a API, MCP y CSV está en la cabecera y el pie.
 *
 * Una franja de cuatro celdas a lo ancho, bajo la parte de arriba (dos en una
 * tableta, una en el teléfono): como lista de etiqueta y valor en la columna del
 * buscador medía ~200 px de alto y empujaba todo hacia abajo.
 */
export function FichaPortada({
  base,
  autor,
  rol,
  urlAutor,
  className = '',
}: {
  base: string | null;
  autor: string | null;
  /** `rolAutor()`: va tras el nombre; sin él, el nombre solo. */
  rol: string | null;
  urlAutor: string | null;
  className?: string;
}) {
  return (
    <dl
      className={`grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 text-sm lg:grid-cols-4 lg:gap-x-8 ${className}`.trim()}
    >
      {base && (
        <div className="min-w-0">
          <dt className="text-muted">Base</dt>
          <dd className="mt-0.5 text-text">{base}</dd>
        </div>
      )}
      <div className="min-w-0">
        <dt className="text-muted">Fuente</dt>
        <dd className="mt-0.5 text-text">{FUENTE_PORTADA}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted">Se actualiza</dt>
        <dd className="mt-0.5 text-text">{SE_ACTUALIZA}</dd>
      </div>
      {autor && (
        <div className="min-w-0">
          <dt className="text-muted">Lo hace</dt>
          <dd className="mt-0.5 text-text">
            {urlAutor ? (
              <a href={urlAutor} rel="noopener noreferrer" className="enlace">
                {autor}
              </a>
            ) : (
              autor
            )}
            {rol && `, ${rol}`}
          </dd>
        </div>
      )}
    </dl>
  );
}

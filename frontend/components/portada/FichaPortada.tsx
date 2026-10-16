import { FUENTE_PORTADA, SE_ACTUALIZA } from '@/lib/portada';

/**
 * La ficha bajo las cifras (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.5): de qué
 * base sale todo, de dónde, cada cuánto y quién lo hace. Datos concretos, no una
 * lista de ✓.
 *
 * - **Base** sale de `GET /bi/sector` (`baseDeLaFicha`), nunca escrita a mano; sin
 *   analytics o sin ventana, la fila no sale.
 * - **Se actualiza** sale del horario del cron (`SE_ACTUALIZA`).
 * - **Lo hace** sólo con `AUTOR_NOMBRE`, y el nombre enlaza a `AUTOR_URL` si está.
 *   Firma la autoría, no el responsable legal.
 *
 * «Se usa» se fue (V11): la salida a API, MCP y CSV está en la cabecera y el pie.
 */
export function FichaPortada({
  base,
  autor,
  urlAutor,
  className = '',
}: {
  base: string | null;
  autor: string | null;
  urlAutor: string | null;
  className?: string;
}) {
  return (
    <dl
      className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-t border-border pt-4 text-sm ${className}`.trim()}
    >
      {base && (
        <>
          <dt className="text-muted">Base</dt>
          <dd className="text-text">{base}</dd>
        </>
      )}
      <dt className="text-muted">Fuente</dt>
      <dd className="text-text">{FUENTE_PORTADA}</dd>
      <dt className="text-muted">Se actualiza</dt>
      <dd className="text-text">{SE_ACTUALIZA}</dd>
      {autor && (
        <>
          <dt className="text-muted">Lo hace</dt>
          <dd className="text-text">
            {urlAutor ? (
              <a href={urlAutor} rel="noopener noreferrer" className="enlace">
                {autor}
              </a>
            ) : (
              autor
            )}
            , data scientist
          </dd>
        </>
      )}
    </dl>
  );
}

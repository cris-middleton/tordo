import { FUENTE_PORTADA, SE_ACTUALIZA } from '@/lib/portada';

/**
 * La ficha (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.5): de qué base sale todo,
 * de dónde y cada cuánto. Datos concretos, no una
 * lista de ✓.
 *
 * - **Base** sale de `GET /bi/sector` (`baseDeLaFicha`), nunca escrita a mano; sin
 *   analytics o sin ventana, la fila no sale.
 * - **Se actualiza** sale del horario del cron (`SE_ACTUALIZA`).
 * - Quién lo hace ya no va aquí: lo dice la ficha del autor, junto a las notas, y el
 *   pie. Estaba tres veces en la portada.
 *
 * «Se usa» se fue (V11): la salida a API, MCP y CSV está en la cabecera y el pie.
 *
 * Una franja de tres celdas a lo ancho (dos por fila por debajo de `lg`), como
 * colofón antes de las notas: como lista en la columna del buscador medía ~200 px
 * de alto, y justo bajo el gráfico grande era metadata en el mejor lugar de la página.
 */
export function FichaPortada({ base, className = '' }: { base: string | null; className?: string }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 text-sm lg:grid-cols-3 lg:gap-x-8 ${className}`.trim()}
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
    </dl>
  );
}

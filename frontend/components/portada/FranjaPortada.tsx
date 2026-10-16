import type { DatosFranja } from '@/lib/portada';

/**
 * La franja de hoy, bajo las dos columnas (spec IDENTIDAD_Y_PORTADA §3.6):
 * publicadas hoy, el organismo que más publica y la hora del resumen. Tres
 * celdas desde `lg`, tres líneas por debajo. Sin enlace: el catálogo no filtra
 * por fecha de publicación.
 *
 * Lo decide `franjaDeLaPortada`: con 0 publicadas hoy las dos primeras celdas
 * no llegan, y la celda que quede primera pierde su sangría izquierda
 * (`lg:first:pl-0`): cada madrugada sólo queda la hora, y no debe quedar movida
 * respecto del borde de las columnas de arriba. El nombre largo se corta con
 * elipsis y el `title` lleva el entero.
 * La hora va con el día («Actualizado el mié, 14 oct, 13:17») porque la portada
 * se cachea: «a las 13:17» a secas no diría si es de hoy.
 */
export function FranjaPortada({ franja }: { franja: DatosFranja }) {
  return (
    <dl
      aria-label="Hoy en Mercado Público"
      className="flex flex-col divide-y divide-border border-y border-border text-sm text-muted lg:flex-row lg:divide-x lg:divide-y-0"
    >
      {franja.publicadasHoy && (
        <div className="flex gap-1.5 py-3 lg:flex-1 lg:pr-6 lg:first:pl-0">
          <dt>Publicadas hoy:</dt>
          <dd className="cifra font-semibold text-text">{franja.publicadasHoy}</dd>
        </div>
      )}
      {franja.masPublicaHoy && (
        <div className="flex min-w-0 gap-1.5 py-3 lg:flex-1 lg:px-6 lg:first:pl-0">
          <dt className="shrink-0">Más publica hoy:</dt>
          <dd className="min-w-0 truncate font-semibold text-text" title={franja.masPublicaHoy}>
            {franja.masPublicaHoy}
          </dd>
        </div>
      )}
      <div className="flex min-w-0 flex-wrap gap-x-1.5 py-3 lg:flex-1 lg:pl-6 lg:first:pl-0">
        <dt>Actualizado el</dt>
        <dd className="cifra font-semibold text-text">{franja.actualizado}</dd>
      </div>
    </dl>
  );
}

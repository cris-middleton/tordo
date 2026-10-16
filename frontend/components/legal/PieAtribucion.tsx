import { DESCARGO_CHILECOMPRA, FUENTE_DATOS } from '@/lib/atribucion';

/**
 * La cita de la fuente, en cada página del sitio.
 *
 * La pone UNA vez el pie del sitio (`components/cascara/PieSitio.tsx`), que la
 * cáscara única monta alrededor de toda página desde `app/layout.tsx`. Ningún
 * otro fichero la pinta: un pie duplicado repetiría la cita, y una página con
 * marco propio podría perderla en un rediseño — `__tests__/legal-enlazado.test.tsx`
 * vigila las dos cosas. Los enlaces legales viven en la columna «Sobre el sitio»
 * del mismo pie.
 *
 * La frase de la fuente es una CONDICIÓN de uso de los datos (ver
 * `docs/DECLARACION_USO_DATOS.md`), no un adorno: «datos de fuentes públicas»
 * no la cumple.
 */
export function PieAtribucion({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-1 text-xs text-muted ${className}`.trim()}>
      <p>{FUENTE_DATOS}.</p>
      <p>{DESCARGO_CHILECOMPRA}</p>
    </div>
  );
}

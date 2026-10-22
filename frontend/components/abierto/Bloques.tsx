import type { InstalacionMcp } from '@/lib/abierto';

import { BotonCopiar } from './BotonCopiar';

/**
 * Un fragmento para copiar (una URL, un `curl`, un JSON), en monoespaciada, con
 * su botón «Copiar» (`BotonCopiar`, la única isla de la página).
 *
 * **Las líneas largas se parten** (`whitespace-pre-wrap` y `overflow-wrap:
 * anywhere`), como en las guías: el `curl` quedaba cortado en una caja de 31 rem
 * que había que desplazar. Sin desplazamiento no hace falta `tabIndex`; el foco
 * va al botón. **Todos ocupan el ancho de su columna** (`max-w-none` le gana al
 * tope de `.lectura`), así que terminan en el mismo borde.
 *
 * El botón va arriba a la derecha: en un teléfono el texto empieza debajo de él
 * (`pt-12`) y usa todo el ancho; desde `sm`, a su lado (`pr-28`). `select-all`
 * sigue seleccionando el bloque entero con un clic, y `role="group"` con
 * `aria-label` le da nombre (sobre un `<pre>` pelado no se anuncia de forma fiable).
 */
export function Codigo({ etiqueta, children }: { etiqueta: string; children: string }) {
  return (
    <div className="relative mt-2 max-w-none">
      <pre
        role="group"
        aria-label={etiqueta}
        className="max-w-none whitespace-pre-wrap rounded-lg border border-border bg-surface-elevated pb-3 pl-4 pr-4 pt-12 font-mono text-sm sm:pr-28 sm:pt-3 leading-relaxed text-text select-all [overflow-wrap:anywhere]"
      >
        <code>{children}</code>
      </pre>
      <BotonCopiar texto={children} etiqueta={etiqueta} />
    </div>
  );
}

/**
 * Un cliente MCP, como fila de una lista con filetes: el nombre a la izquierda
 * desde `sm`, y los pasos con lo que se copia o el enlace que lo instala. Antes
 * eran cajas en dos columnas y la quinta quedaba sola en su fila.
 */
export function FilaInstalacion({ instalacion }: { instalacion: InstalacionMcp }) {
  const titulo = `mcp-${instalacion.id}`;
  const [unico] = instalacion.pasos;
  return (
    <li className="grid max-w-none gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <h3 id={titulo} className="text-sm font-semibold text-text">
        {instalacion.cliente}
      </h3>
      <div className="min-w-0">
        {instalacion.pasos.length > 1 ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            {instalacion.pasos.map((paso) => (
              <li key={paso}>{paso}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">{unico}</p>
        )}
        {instalacion.codigo && (
          <Codigo etiqueta={`Configuración para ${instalacion.cliente}`}>{instalacion.codigo}</Codigo>
        )}
        {instalacion.enlace && (
          <a href={instalacion.enlace.href} className="btn-secondary mt-3 inline-flex">
            {instalacion.enlace.texto}
          </a>
        )}
      </div>
    </li>
  );
}

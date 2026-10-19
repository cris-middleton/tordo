import type { InstalacionMcp } from '@/lib/abierto';

/**
 * Un fragmento para copiar (una URL, un `curl`, un JSON), en monoespaciada.
 *
 * **Sin botón de copiar, a propósito**: sería una isla de JavaScript en una
 * página que hoy no tiene ninguna. `select-all` selecciona el bloque entero con
 * un clic. `tabIndex={0}` y `role="group"`: la región con desplazamiento tiene que
 * poder alcanzarse con el teclado, y `aria-label` sobre un `<pre>` pelado no
 * se anuncia de forma fiable.
 *
 * Lo que no cabe se desplaza dentro del bloque, con la barra siempre a la vista
 * (`desplazable-x`, `app/globals.css`): sin ella el comando parecía cortado.
 */
export function Codigo({ etiqueta, children }: { etiqueta: string; children: string }) {
  return (
    <pre
      role="group"
      aria-label={etiqueta}
      tabIndex={0}
      className="desplazable-x mt-2 whitespace-pre rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-text select-all"
    >
      <code>{children}</code>
    </pre>
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

import type { InstalacionMcp } from '@/lib/abierto';

/**
 * Un fragmento para copiar (una URL, un `curl`, un JSON), en monoespaciada.
 *
 * **Sin botón de copiar, a propósito**: sería una isla de JavaScript en una
 * página que hoy no tiene ninguna. `select-all` selecciona el bloque entero con
 * un clic. `tabIndex={0}` y `role="group"`: la región con desplazamiento tiene que
 * poder alcanzarse con el teclado, y `aria-label` sobre un `<pre>` pelado no
 * se anuncia de forma fiable.
 */
export function Codigo({ etiqueta, children }: { etiqueta: string; children: string }) {
  return (
    <pre
      role="group"
      aria-label={etiqueta}
      tabIndex={0}
      className="mt-2 overflow-x-auto whitespace-pre rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-text select-all"
    >
      <code>{children}</code>
    </pre>
  );
}

/** Una caja por cliente MCP: pasos, y lo que se copia o el enlace que lo instala. */
export function CajaInstalacion({ instalacion }: { instalacion: InstalacionMcp }) {
  const titulo = `mcp-${instalacion.id}`;
  return (
    <section aria-labelledby={titulo} className="rounded-xl border border-border bg-surface px-4 py-3">
      <h3 id={titulo} className="text-sm font-semibold text-text">
        {instalacion.cliente}
      </h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
        {instalacion.pasos.map((paso) => (
          <li key={paso}>{paso}</li>
        ))}
      </ol>
      {instalacion.codigo && (
        <Codigo etiqueta={`Configuración para ${instalacion.cliente}`}>{instalacion.codigo}</Codigo>
      )}
      {instalacion.enlace && (
        <a href={instalacion.enlace.href} className="btn-secondary mt-3 inline-flex">
          {instalacion.enlace.texto}
        </a>
      )}
    </section>
  );
}

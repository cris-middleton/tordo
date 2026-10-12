'use client';

/**
 * Lo que enseña una sección de BI cuando todavía no hay ningún rubro elegido.
 *
 * **No es lo mismo «no hay datos de este rubro» que «no has elegido rubro».**
 * Las secciones decían lo primero en los dos casos: «No se encontraron
 * oportunidades para este rubro», «Sin datos de tendencia para este rubro»…
 * sobre un rubro que no existe. El usuario lee que su mercado está vacío cuando
 * lo que pasa es que no ha dicho cuál es — y la acción que lo arregla, el
 * selector de arriba, no se menciona.
 *
 * Se ve al entrar por «Explorar sin configurar» **con el catálogo de rubros
 * vacío**, que es el estado de cualquier despliegue en el que el pipeline de
 * analytics todavía no se ha materializado: ahí no hay ningún rubro que elegir
 * por defecto, así que la pantalla entera se pinta sin él.
 *
 * `PanoramaRubro` ya lo hacía bien y era la única. Esto es su guarda, extraída
 * para que las demás digan lo mismo — que dos secciones de la misma pantalla
 * expliquen el mismo vacío con dos frases distintas es peor que el fallo.
 */
export function EligeRubro({ que }: { que: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
      <p className="text-sm text-muted">Elige un rubro arriba para ver {que}.</p>
    </div>
  );
}

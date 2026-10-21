/**
 * Las rutas de descarga en CSV (`/bi/exportar/*`). El CSV es la misma consulta
 * que la pantalla: **sale de los parámetros con que se consultó**, no de lo que
 * el formulario tenga escrito ahora. Antes «Descargar» en la herramienta de
 * precio se armaba con el producto elegido en ese momento y sin el organismo:
 * quien filtraba por un comprador se bajaba el precio de todo el país, y quien
 * cambiaba de producto sin volver a consultar, el de otro producto.
 */

export interface ConsultaPrecio {
  /** `codigoProductoONU` consultado. */
  codigo: string;
  /** El nombre con que se eligió, para el título del resultado. */
  nombre?: string;
  /** `organismo_id` consultado; vacío = todos. */
  organismo: string;
}

/** `bi/exportar/precio/{codigo}`, con `organismo_id` si se consultó con uno. */
export function rutaExportarPrecio({ codigo, organismo }: ConsultaPrecio): string {
  const base = `bi/exportar/precio/${encodeURIComponent(codigo)}`;
  const o = organismo.trim();
  return o ? `${base}?${new URLSearchParams({ organismo_id: o })}` : base;
}

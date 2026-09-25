/**
 * Cómo se nombra cada estado de la empresa en el Registro de Proveedores.
 *
 * `inscrito` es lo único que confirma la API pública: si la empresa está hábil
 * lo ve sólo el proveedor, en su ficha. `desconocido` no se enseña — es
 * «todavía no lo sabemos», y pintarlo como una etiqueta lo hacía parecer un
 * problema (así salía, en crudo, junto al título de Documentos).
 */
export const ETIQUETA_ESTADO: Record<string, string> = {
  habil: 'Hábil',
  inhabil: 'Inhábil',
  inscrito: 'Inscrita en Mercado Público',
  no_encontrado: 'RUT no inscrito',
};

/** Los estados que impiden ofertar. */
export function impideOfertar(estado: string | undefined | null): boolean {
  return estado === 'inhabil' || estado === 'no_encontrado';
}

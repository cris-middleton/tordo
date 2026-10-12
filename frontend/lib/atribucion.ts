/**
 * La atribución que exige la *Declaración de Uso de Datos Oficiales*
 * (`docs/DECLARACION_USO_DATOS.md`).
 *
 * **La frase de la fuente es literal y no se reescribe**: es la que piden las
 * condiciones de la API de Mercado Público, y una versión «más bonita» deja de
 * ser la cita que se exige. Vive duplicada a propósito en
 * `backend/app/services/exportar.py` (primera línea de cada CSV), y
 * `backend/tests/test_exportar.py` comprueba que las dos digan lo mismo.
 */
export const FUENTE_DATOS =
  'Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado Público)';

/** Lo que la Declaración dice de ChileCompra, en la forma corta del pie. */
export const DESCARGO_CHILECOMPRA =
  'ChileCompra no participa ni respalda este proyecto, y no asume responsabilidad sobre los análisis, interpretaciones ni indicadores que aquí se publican.';

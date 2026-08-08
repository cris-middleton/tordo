/** Catálogos fijos de Mercado Público: las 16 regiones y los estados de una licitación. */

export const REGIONES_CHILE = [
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región Metropolitana de Santiago',
  'Región del Libertador General Bernardo O´Higgins',
  'Región del Maule',
  'Región del Ñuble',
  'Región del Biobío',
  'Región de la Araucanía',
  'Región de Los Ríos',
  'Región de los Lagos',
  'Región Aysén del General Carlos Ibáñez del Campo',
  'Región de Magallanes y de la Antártica',
];

export const ESTADOS_LICITACION = [
  'Publicada',
  'Cerrada',
  'En evaluación',
  'Adjudicada',
  'Desierta',
  'Revocada',
  'Suspendida',
];

/**
 * Los mecanismos por los que el Estado convoca.
 *
 * Espeja `backend/app/models/convocatoria.py`. Compra Ágil y Convenio Marco son
 * cerca de la mitad del mercado chileno y hasta F6 no se veían en el producto:
 * el modelo daba por hecho que todo era una licitación.
 */
export const TIPOS_CONVOCATORIA = [
  { value: 'licitacion', label: 'Licitación' },
  { value: 'compra_agil', label: 'Compra Ágil' },
  { value: 'convenio_marco', label: 'Convenio Marco' },
  { value: 'trato_directo', label: 'Trato Directo' },
] as const;

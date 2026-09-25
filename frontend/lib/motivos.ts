/**
 * Qué se le dice a una persona cuando un análisis no está disponible.
 *
 * El backend acompaña cada `disponible: false` con un `motivo`, y la mayoría es
 * diagnóstico para quien opera el sistema: «parquet no generado», «organismo_id
 * no disponible», «licitación no encontrada en histórico», «Modelo TF-IDF no
 * entrenado. Ejecute: python -m …». Las pantallas los pintaban tal cual, y un
 * cliente leía instrucciones de consola en la ficha de una licitación.
 *
 * No se reescriben en el backend: el golden master de BI los fija y son útiles
 * para quien integra por la API. Se filtran aquí, con una lista de los que SÍ
 * están escritos para el usuario. Es lista blanca a propósito: un diagnóstico
 * nuevo cae en el respaldo sin que nadie tenga que acordarse de bloquearlo.
 */

const PARA_PERSONAS = [
  /^Tu empresa no tiene historial de órdenes en /,
  /^sin movimientos relevantes esta semana$/,
  /^sin datos( históricos)? para el rubro /,
  /^No se pudo consultar el Registro de Proveedores/,
  /^La empresa no tiene RUT registrado$/,
  /^la descripción no se parece a ningún rubro conocido$/,
];

function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function motivoParaPersona(motivo: string | null | undefined, respaldo: string): string {
  if (motivo && PARA_PERSONAS.some((patron) => patron.test(motivo))) {
    return conMayuscula(motivo);
  }
  return respaldo;
}

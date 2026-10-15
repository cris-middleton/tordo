/**
 * Textos y ayudantes de la portada (`app/page.tsx`). Puros y sin secretos.
 *
 * La portada anterior vendía un SaaS: planes, prueba gratis, avisos por correo,
 * informe del lunes, encaje con lo que vendes. Nada de eso existe desde el
 * pivote a sitio público. Ésta responde tres cosas en una pantalla: qué es,
 * para quién, y qué hago ahora — sin cuenta.
 */

import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from './compraAgil';

/** Lo que se ve en el bloque vivo de la portada. El resto, en la página entera. */
export const DESTACADAS_EN_PORTADA = 5;

export interface Acceso {
  titulo: string;
  texto: string;
  href: string;
}

export const ACCESOS: Acceso[] = [
  {
    titulo: 'Licitaciones',
    texto: 'Los llamados abiertos, con la historia del comprador al lado de cada uno.',
    href: '/licitaciones',
  },
  {
    titulo: 'Mercados',
    texto: 'Por rubro: cuánto se compra, quién lo compra, contra quién compites y en qué meses.',
    href: '/mercado',
  },
  {
    titulo: 'Precios',
    texto: 'Cuánto ha pagado el Estado por lo que vendes, en bandas por unidad.',
    href: '/productos',
  },
  {
    titulo: 'Guías',
    texto: 'Cómo leer una banda de precio, un comprador o la concentración de un mercado.',
    href: '/guias',
  },
];

export interface Pregunta {
  pregunta: string;
  respuesta: string;
  enlace?: { href: string; texto: string };
}

/**
 * Reescrita para el sitio público: sin planes, prueba, avisos ni encaje.
 * Cada respuesta dice lo que el sitio hace hoy, no lo que hará.
 */
export const PREGUNTAS: Pregunta[] = [
  {
    pregunta: '¿Cuesta algo? ¿Tengo que crear una cuenta?',
    respuesta:
      'No y no. Todo lo que calculamos se ve entero, sin registrarte. Lo que marcas como favorito y las búsquedas que guardas se quedan en tu navegador, no en un servidor.',
  },
  {
    pregunta: '¿De dónde salen los datos?',
    respuesta:
      'De ChileCompra: los archivos abiertos de órdenes de compra de los últimos tres años —para los precios, sólo el último— y la API de Mercado Público, que consultamos varias veces al día. Son datos oficiales y cualquier cifra se puede contrastar en Mercado Público.',
    enlace: { href: '/guias/de-donde-salen-los-datos', texto: 'De dónde salen los datos' },
  },
  {
    pregunta: '¿Me dicen exactamente cuánto cotizar?',
    respuesta:
      'No. Mostramos el rango en que se ha adjudicado y cuán confiable es. Si el mismo comprador ha pagado cifras muy distintas por lo mismo, también lo decimos: probablemente el precio no sea lo que decide esa compra.',
    enlace: { href: '/guias/como-leer-una-banda-de-precio', texto: 'Cómo leer una banda de precio' },
  },
  {
    pregunta: `¿Cómo se ordena «${TITULO_DESTACADAS}»?`,
    respuesta: DESCRIPCION_DESTACADAS,
    enlace: { href: '/guias/lo-mejor-de-hoy-en-compra-agil', texto: 'Cómo se elige' },
  },
  {
    pregunta: '¿Cómo me entero de lo nuevo sin cuenta?',
    respuesta:
      'Cada búsqueda tiene su canal RSS: lo agregas a un lector y te llega lo nuevo sin dejar tu correo en ninguna parte.',
    enlace: { href: '/guias/seguir-una-busqueda-por-rss', texto: 'Seguir una búsqueda por RSS' },
  },
  {
    pregunta: '¿Necesito algo de ChileCompra para postular?',
    respuesta:
      'Sí: estar inscrito como proveedor en Mercado Público y con el estado hábil al día. Este sitio no reemplaza ese registro; ayuda a decidir dónde y a qué precio postular.',
  },
];

/**
 * «lun 12 oct, 13:05», en hora de Chile. Con el día siempre: la portada se
 * cachea, así que «a las 13:05» a secas no diría si es de hoy o de ayer, y en
 * el servidor no se sabe la fecha del visitante.
 */
export function actualizadoEnPalabras(iso: string | null): string | null {
  if (!iso) return null;
  const instante = Date.parse(iso);
  if (!Number.isFinite(instante)) return null;
  const fecha = new Date(instante);
  const zona = 'America/Santiago';
  const dia = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(fecha)
    .replace(/\.$/, '');
  const hora = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return `${dia}, ${hora}`;
}

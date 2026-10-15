/**
 * Las preguntas frecuentes del sitio, en `/acerca` (spec del rediseño §6.3 y
 * §6.7). Vivían en la portada; la portada nueva es un buscador y no lleva FAQ.
 *
 * Reescritas para el sitio público: sin planes, prueba, avisos ni encaje.
 * **Cada respuesta dice lo que el sitio hace hoy, no lo que hará.**
 */

import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from './compraAgil';

export interface Pregunta {
  pregunta: string;
  respuesta: string;
  enlace?: { href: string; texto: string };
}

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

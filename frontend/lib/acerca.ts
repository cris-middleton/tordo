/**
 * Las preguntas frecuentes del sitio, en `/acerca` (spec del rediseño §6.3 y
 * §6.7). Vivían en la portada; la portada nueva es un buscador y no lleva FAQ.
 *
 * Reescritas para el sitio público: sin planes, prueba, avisos ni encaje.
 * **Cada respuesta dice lo que el sitio hace hoy, no lo que hará.**
 */

import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from './compraAgil';
import { MESES_ANALISIS, MESES_PRECIOS } from './periodo';
import { FRECUENCIA_CATALOGO } from './portada';

export interface Pregunta {
  pregunta: string;
  respuesta: string;
  enlace?: { href: string; texto: string };
}

export const PREGUNTAS: Pregunta[] = [
  {
    pregunta: '¿Cuánto cuesta usarlo?',
    respuesta:
      'Nada, y no hay cuenta que crear. Todo lo que calculamos se ve entero, el primer día y el día cien.',
  },
  {
    pregunta: '¿Qué tan al día están los datos?',
    respuesta: `Las licitaciones y Compras Ágiles se actualizan ${FRECUENCIA_CATALOGO}. Los precios y los mercados se recalculan cada domingo, con los últimos ${MESES_ANALISIS} meses de órdenes de compra (${MESES_PRECIOS} para los precios).`,
    enlace: { href: '/guias/de-donde-salen-los-datos', texto: 'Qué trae cada fuente y qué no' },
  },
  {
    pregunta: '¿Me dicen cuánto cotizar?',
    respuesta: `No, porque nadie sabe cuánto van a cotizar los demás. Te mostramos a qué precio se compró lo mismo en los últimos ${MESES_PRECIOS} meses: entre cuánto y cuánto se pagó la mitad de las compras, cuántas compras son y de cuántos compradores. Si por lo mismo se pagaron precios muy distintos, también te lo decimos.`,
    enlace: { href: '/guias/como-leer-una-banda-de-precio', texto: 'Cómo leer una banda de precio' },
  },
  {
    pregunta: `¿Cómo se ordena «${TITULO_DESTACADAS}»?`,
    respuesta: DESCRIPCION_DESTACADAS,
    enlace: { href: '/guias/lo-mejor-de-hoy-en-compra-agil', texto: 'Cuánto pesa cada cosa' },
  },
  {
    pregunta: '¿Cómo me entero de lo nuevo?',
    respuesta:
      'Con RSS, un enlace que un lector de noticias revisa por ti. Cada búsqueda de licitaciones tiene el suyo, y «Lo mejor de hoy» también. No tienes que dejar tu correo en ninguna parte.',
    enlace: { href: '/guias/seguir-una-busqueda-por-rss', texto: 'Seguir una búsqueda por RSS' },
  },
  {
    pregunta: '¿Por qué algunos proveedores no salen con su nombre?',
    respuesta:
      'Porque son personas naturales: le venden al Estado con su propio RUT. En vez de su nombre mostramos «Persona natural» y, en los análisis, un seudónimo.',
    enlace: { href: '/privacidad', texto: 'Por qué lo hacemos' },
  },
  {
    pregunta: '¿Necesito algo de ChileCompra para postular?',
    respuesta:
      'Sí: estar inscrito como proveedor en Mercado Público y hábil para contratar con el Estado. Eso se hace allá, y las ofertas también se mandan allá. Aquí decides dónde y a cuánto.',
  },
];

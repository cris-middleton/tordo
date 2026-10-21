/**
 * `url_licitacion` se enlaza sólo si apunta a Mercado Público.
 *
 * Llega de la API de ChileCompra y se pinta como `href` en la ficha de la
 * licitación: un `javascript:` o un dominio ajeno en el dato sería un enlace del
 * sitio hacia donde dijera ese dato.
 */

import { describe, expect, it } from 'vitest';

import { urlDeMercadoPublico } from '@/lib/enlacesExternos';

describe('urlDeMercadoPublico', () => {
  it.each([
    'https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=1234-56-LE24',
    'http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=1234-56-LE24',
    'https://buscador.mercadopublico.cl/ficha?code=1234-56-COT24',
    'https://mercadopublico.cl/',
    'HTTPS://WWW.MERCADOPUBLICO.CL/x',
  ])('enlaza %s', (url) => {
    expect(urlDeMercadoPublico(url)).toBe(new URL(url).href);
  });

  it.each([
    undefined,
    null,
    42,
    '',
    '   ',
    'no es una url',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://www.mercadopublico.cl/x',
    'https://mercadopublico.cl.ejemplo.com/x',
    'https://evilmercadopublico.cl/x',
    'https://ejemplo.com/?ir=https://www.mercadopublico.cl',
    'https://www.mercadopublico.cl@ejemplo.com/x',
    'https://usuario:clave@www.mercadopublico.cl/x',
    '//www.mercadopublico.cl/x',
    '/licitaciones/1234-56-LE24',
  ])('no enlaza %j', (valor) => {
    expect(urlDeMercadoPublico(valor)).toBeNull();
  });
});

/**
 * La tarjeta de vista previa (`app/opengraph-image.tsx`) para las páginas que
 * declaran su propio `openGraph`.
 *
 * Next hereda la imagen del archivo de metadatos de la raíz sólo mientras la
 * página no traiga `openGraph`: un `openGraph` propio reemplaza al del padre
 * entero, imagen incluida. Las fichas de comprador, rubro y producto, las guías,
 * las notas y `/buscar` salían sin `og:image`, y WhatsApp, LinkedIn o Facebook
 * mostraban el enlace sin tarjeta (X no, porque lee `twitter:image`, que esas
 * páginas no tocan). Quien declare `openGraph` pone `images: [IMAGEN_OPEN_GRAPH]`;
 * quien declare `twitter`, `images: [IMAGEN_TWITTER]`.
 *
 * Sin imports: lo lee también `app/opengraph-image.tsx`.
 */

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const ALT_VISTA_PREVIA = `${APP_NAME}: cuánto paga el Estado por lo que vendes. Precios pagados, licitaciones abiertas y Compra Ágil, con datos públicos de ChileCompra`;

const TARJETA = { width: 1200, height: 630, type: 'image/png', alt: ALT_VISTA_PREVIA } as const;

/** Relativas: `metadataBase` (`app/layout.tsx`) las vuelve absolutas. */
export const IMAGEN_OPEN_GRAPH = { url: '/opengraph-image', ...TARJETA };
export const IMAGEN_TWITTER = { url: '/twitter-image', ...TARJETA };

import Imagen, { alt as altOg } from './opengraph-image';

/* La misma tarjeta para X/Twitter: `summary_large_image` sin `twitter:image` no siempre cae en og:image. */
export const alt = altOg;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default Imagen;

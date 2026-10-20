import type { MetadataRoute } from 'next';

import {
  FICHAS_BAJO_PEDIDO,
  NO_RASTREAR,
  origenDelSitio,
  RASTREADORES_DE_ENTRENAMIENTO,
} from '@/lib/publico';

/**
 * `/robots.txt`: se rastrea todo menos `NO_RASTREAR` (ver `lib/publico.ts`), y
 * los rastreadores de entrenamiento tampoco recorren las fichas bajo pedido.
 *
 * Un rastreador con grupo propio ignora el de `*`, así que su grupo repite
 * `NO_RASTREAR`.
 */
export default function robots(): MetadataRoute.Robots {
  const origen = origenDelSitio();
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...NO_RASTREAR] },
      {
        userAgent: [...RASTREADORES_DE_ENTRENAMIENTO],
        allow: '/',
        disallow: [...NO_RASTREAR, ...FICHAS_BAJO_PEDIDO],
      },
    ],
    sitemap: `${origen}/sitemap.xml`,
  };
}

import type { MetadataRoute } from 'next';

import { NO_RASTREAR, origenDelSitio } from '@/lib/publico';

/** `/robots.txt`: se rastrea todo menos `NO_RASTREAR` (ver `lib/publico.ts`). */
export default function robots(): MetadataRoute.Robots {
  const origen = origenDelSitio();
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...NO_RASTREAR] },
    sitemap: `${origen}/sitemap.xml`,
  };
}

import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import {
  PAGINAS_FIJAS,
  origenDelSitio,
  rutaComprador,
  rutaProducto,
  rutaRubro,
} from '@/lib/publico';
import { leerGuias, rutaGuia } from '@/lib/guias';
import { pedirPublico } from '@/lib/publicoServidor';
import type { SitemapPublico } from '@/types/publico';

/**
 * `/sitemap.xml`: las páginas fijas y cada comprador, rubro y producto
 * indexable (lo decide el backend en `/publico/sitemap`, en un solo sitio).
 *
 * **`connection()` primero, a propósito.** Sin él, Next genera el sitemap en el
 * build, cuando el backend no está —en CI no existe— y se quedaría con sólo las
 * páginas fijas hasta caducar. Con él se genera al pedirlo, y lo que se cachea
 * es la llamada al backend (una semana, etiqueta `analytics`, como las
 * páginas). Si el backend falla, se sirven las fijas y el fallo NO se cachea:
 * la próxima visita del buscador lo vuelve a intentar.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origen = origenDelSitio();
  const fijas: MetadataRoute.Sitemap = PAGINAS_FIJAS.map((ruta) => ({
    url: `${origen}${ruta === '/' ? '' : ruta}`,
  }));
  // Las guías salen del disco (`content/explicativos`, en la traza del sitemap
  // por `next.config.js`). Si no se pudieran leer, el sitemap sigue sin ellas.
  try {
    fijas.push(
      ...leerGuias().map((g) => ({ url: `${origen}${rutaGuia(g.slug)}`, lastModified: g.actualizado })),
    );
  } catch (error) {
    console.error('sitemap: no se pudieron leer las guías', error);
  }

  let indice: SitemapPublico | null = null;
  try {
    indice = await pedirPublico<SitemapPublico>('/sitemap');
  } catch (error) {
    console.error('sitemap: el backend no respondió; se sirven sólo las páginas fijas', error);
  }
  if (!indice) return fijas;

  const lastModified = indice.actualizado ?? undefined;
  const de = (rutas: string[], ruta: (x: string) => string): MetadataRoute.Sitemap =>
    rutas.map((x) => ({ url: `${origen}${ruta(x)}`, lastModified }));

  return [
    ...fijas,
    ...de(indice.rubros, rutaRubro),
    ...de(indice.compradores, rutaComprador),
    ...de(indice.productos, rutaProducto),
  ];
}

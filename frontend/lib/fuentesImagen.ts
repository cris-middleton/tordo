import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Las fuentes de la tarjeta de vista previa (`app/opengraph-image.tsx`).
 *
 * `ImageResponse` (Satori) no lee WOFF2 ni ejes variables, así que el titular no
 * puede usar la Archivo variable de Google Fonts tal cual: lleva dos instancias
 * estáticas en WOFF, recortadas a ASCII más las letras y signos del castellano,
 * en `assets/fuentes-imagen/` con su licencia (OFL 1.1, sin nombre reservado).
 *
 * Origen: `ofl/archivo/Archivo[wdth,wght].ttf` de github.com/google/fonts en el
 * commit 95f4904fc8bcf26d3420fe315560c96417c6dec7. Se rehacen con fontTools:
 * `varLib.instancer.instantiateVariableFont(f, {'wght': 800, 'wdth': 118})` (el
 * titular, ensanchado como el `font-stretch` de la portada) y `{'wght': 700,
 * 'wdth': 100}` (el resto), `subset` a ASCII más `¿¡áéíóúüñÁÉÍÓÚÜÑ–—«»·…` y `flavor='woff'`.
 *
 * Varien, la de la marca, ya está en el repo en WOFF (`public/fonts/varien/WOFF/`).
 *
 * Se leen al construir: la imagen es estática y Next la genera en el build,
 * con `process.cwd()` en `frontend/`.
 */
export async function fuentesImagen() {
  // Rutas literales, una por archivo: con una ruta armada en tiempo de ejecución,
  // el build no sabe qué se lee y empaqueta el proyecto entero en el servidor.
  const [titular, texto, marca] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fuentes-imagen/Archivo-ExtraBold-Expandida.woff')),
    readFile(join(process.cwd(), 'assets/fuentes-imagen/Archivo-Bold.woff')),
    readFile(join(process.cwd(), 'public/fonts/varien/WOFF/Varien.woff')),
  ]);
  return [
    { name: 'Archivo Expandida', data: titular, weight: 800 as const, style: 'normal' as const },
    { name: 'Archivo', data: texto, weight: 700 as const, style: 'normal' as const },
    { name: 'Varien', data: marca, weight: 400 as const, style: 'normal' as const },
  ];
}

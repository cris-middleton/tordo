import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Las fuentes de la tarjeta de vista previa (`app/opengraph-image.tsx`).
 *
 * `ImageResponse` (Satori) no lee WOFF2 ni ejes variables, así que el titular no
 * puede usar la Libre Franklin variable de Google Fonts tal cual: lleva dos instancias
 * estáticas en WOFF, recortadas a ASCII más las letras y signos del castellano,
 * en `assets/fuentes-imagen/` con su licencia (OFL 1.1, sin nombre reservado).
 *
 * Origen: `ofl/librefranklin/LibreFranklin[wght].ttf` de github.com/google/fonts en el
 * commit e2332cf862ac3145c0ee5f24f04f4c1819b2410b. Se rehacen con fontTools:
 * `varLib.instancer.instantiateVariableFont(f, {'wght': 800})` (el titular) y
 * `{'wght': 700}` (el resto), `subset` a ASCII más `¿¡áéíóúüñÁÉÍÓÚÜÑ–—«»·…` con
 * `layout_features=['*']` y `flavor='woff'`.
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
    readFile(join(process.cwd(), 'assets/fuentes-imagen/LibreFranklin-ExtraBold.woff')),
    readFile(join(process.cwd(), 'assets/fuentes-imagen/LibreFranklin-Bold.woff')),
    readFile(join(process.cwd(), 'public/fonts/varien/WOFF/Varien.woff')),
  ]);
  return [
    { name: 'Libre Franklin ExtraBold', data: titular, weight: 800 as const, style: 'normal' as const },
    { name: 'Libre Franklin', data: texto, weight: 700 as const, style: 'normal' as const },
    { name: 'Varien', data: marca, weight: 400 as const, style: 'normal' as const },
  ];
}

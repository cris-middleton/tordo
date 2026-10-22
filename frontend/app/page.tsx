import type { Metadata } from 'next';

import { Portada } from '@/components/portada/Portada';
import { DESTACADAS_PEDIDAS } from '@/lib/portada';
import {
  pedirDestacadas,
  pedirMercadoPortada,
  pedirProductoPortada,
  pedirResumenPortada,
  pedirSectoresPortada,
} from '@/lib/publicoServidor';
import { nombreAutor, rolAutor, urlAutor } from '@/lib/autor';
import { horaDelRender } from '@/lib/horaChile';
import { leerNotas } from '@/lib/notas';
import { MESES_PRECIOS } from '@/lib/periodo';
import { urlRepositorio } from '@/lib/repositorio';

/**
 * La portada. **Componente de servidor, y tiene que seguir siéndolo**: Next
 * ignora `metadata` en componentes cliente, y la home se quedaría sin título
 * ni tarjeta de preview. Y el buscador es un `<form>` que funciona sin JS. No
 * le pongas 'use client'.
 *
 * **ISR cada media hora** (`revalidate`), la misma ventana que la caché de lo
 * vivo, que además vacía el cron frecuente con la etiqueta `compra-agil`. Así la
 * portada sale del CDN y no del servidor en cada visita.
 *
 * Las cinco piezas se piden en paralelo y **ninguna lanza**: si el backend
 * falla al regenerar, cada `pedir…` devuelve `null`, su bloque se oculta y la
 * portada se publica igual, con el buscador; a la media hora se reintenta. Lo
 * vivo (destacadas y resumen) se cachea media hora con `compra-agil`; lo de
 * analytics (los sectores, que dan la «Base» de la ficha, el gasto mensual y la
 * concentración, y el producto de la lectura de precio), una semana con `analytics`. (En un build sin backend —CI—
 * nace sin ellas por lo mismo.) Las notas de datos son contenido del repo: se
 * leen del disco y nunca fallan.
 */
export const revalidate = 1800;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tordo.cl';

// Vocabulario llano (R10 del rediseño) y la voz de IDENTIDAD_Y_PORTADA §6: qué es,
// no qué no cobra. La descripción, bajo 155 caracteres.
const TITLE = `${APP_NAME} — Qué compra el Estado de Chile y a qué precio`;
const DESCRIPTION =
  `Busca lo que vendes y mira a qué precio lo compró el Estado en ${MESES_PRECIOS} meses, ` +
  'quién lo compra y qué está abierto hoy. Datos de ChileCompra.';

export const metadata: Metadata = {
  // Absoluto: el `template` del layout raíz le añadiría el nombre otra vez.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  keywords: [
    'Compra Ágil',
    'licitaciones',
    'Mercado Público',
    'ChileCompra',
    'precios de adjudicación',
    'proveedores del Estado',
    'Chile',
  ],
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: SITE_URL,
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    // La imagen la pone `app/opengraph-image.tsx` (archivo de metadatos).
  },
  twitter: {
    // `summary_large_image` necesita una imagen 1200×630.
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const [destacadas, resumen, sectores, mercado, producto, ahora] = await Promise.all([
    pedirDestacadas(DESTACADAS_PEDIDAS),
    pedirResumenPortada(),
    pedirSectoresPortada(),
    pedirMercadoPortada(),
    pedirProductoPortada(),
    horaDelRender(),
  ]);
  return (
    <Portada
      destacadas={destacadas}
      resumen={resumen}
      sectores={sectores}
      mercado={mercado}
      producto={producto}
      notas={leerNotas()}
      repositorio={urlRepositorio()}
      autor={nombreAutor()}
      rol={rolAutor()}
      urlAutor={urlAutor()}
      ahora={ahora}
    />
  );
}

import { Contenedor } from '@/components/cascara/Contenedor';

/**
 * El marco de las páginas públicas indexables (comprador, rubro, producto,
 * guías, `/apoyar`, `/abierto`, `/acerca`, `/buscar`): el contenedor único del
 * sitio (spec PORTADA_V7 §4), el mismo borde izquierdo que la cabecera. Las
 * páginas de lectura limitan su texto a `max-w-3xl` dentro, alineado a la
 * izquierda. La cabecera y el pie —con la cita de la fuente— los pone la cáscara
 * única del layout raíz.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return <Contenedor pagina>{children}</Contenedor>;
}

/**
 * El marco de las páginas públicas indexables (comprador, rubro, producto,
 * guías, `/apoyar`, `/abierto`, `/acerca`): sólo el ancho de lectura. La cabecera y el pie
 * —con la cita de la fuente— los pone la cáscara única del layout raíz, igual
 * que en el panel: desde el rediseño ya no hay una cáscara para quien llega de
 * Google y otra para quien usa la herramienta.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>;
}

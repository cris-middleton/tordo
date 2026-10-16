import Link from 'next/link';

interface Props {
  titulo: string;
  vigenteDesde: string;
  children: React.ReactNode;
}

/**
 * Marco común de los documentos legales: el ancho de lectura y la fecha.
 *
 * La fecha de vigencia va arriba y no en letra chica al final: es el dato que
 * permite a alguien saber qué versión está leyendo.
 *
 * Un `[[hueco]]` (hoy, la fecha de vigencia y, sin `RESPONSABLE_LEGAL`, el
 * nombre) es un dato que sólo puede poner el responsable del sitio. Se deja
 * visible a propósito: un hueco que se ve no se publica por descuido; uno
 * rellenado con un dato inventado, sí.
 *
 * La cabecera y el pie —con la cita de la fuente— los pone la cáscara única.
 */
export function DocumentoLegal({ titulo, vigenteDesde, children }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Link href="/" className="text-sm font-semibold text-primary hover:underline">
        ← Volver al inicio
      </Link>
      <h1 className="mt-6 font-display text-3xl text-text">{titulo}</h1>
      <p className="mt-2 text-sm text-muted">Vigente desde {vigenteDesde}</p>
      <div className="mt-10 text-sm leading-relaxed text-text [&_a]:text-primary [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-lg [&_h2]:text-text [&_li]:mt-1.5 [&_li]:text-muted [&_p]:mt-3 [&_p]:text-muted [&_strong]:text-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

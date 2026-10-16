import { Contenedor } from '@/components/cascara/Contenedor';

interface Props {
  titulo: string;
  vigenteDesde: string;
  children: React.ReactNode;
}

/**
 * Marco común de los documentos legales: el contenedor único, el ancho de
 * lectura (`max-w-3xl`, alineado a la izquierda) y la fecha. Nada antes del `h1`:
 * el tope lo pone el contenedor (spec PORTADA_V7 §4); al inicio se vuelve por la marca.
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
    <Contenedor pagina>
      <div className="max-w-3xl">
        <h1 className="page-title">{titulo}</h1>
        <p className="mt-2 text-sm text-muted">Vigente desde {vigenteDesde}</p>
        <div className="mt-8 text-sm leading-relaxed text-text [&_a]:text-primary [&_a]:underline [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:leading-tight [&_h2]:text-text [&_li]:mt-2 [&_li]:text-muted [&_p]:mt-3 [&_p]:text-muted [&_strong]:text-text [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </div>
    </Contenedor>
  );
}

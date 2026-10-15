/**
 * Quién responde por el sitio, en los documentos legales.
 *
 * **Sólo lo que la ley pide, nada más**: la Ley 19.628 (texto de la 21.719) exige
 * identificar al responsable y un medio de contacto para ejercer los derechos.
 * Ni RUT ni domicilio: no son necesarios para eso y publicarlos expone al
 * responsable sin proteger a nadie.
 *
 * El nombre vive en `RESPONSABLE_LEGAL`, una variable de SERVIDOR, para que no
 * quede en el repositorio. Las páginas legales se prerenderizan en el build, así
 * que en Vercel tiene que estar definida al construir. Sin ella la página muestra
 * el hueco a la vista: un hueco que se ve no se publica por descuido.
 */
export const RESPONSABLE = process.env.RESPONSABLE_LEGAL?.trim() || '[[definir RESPONSABLE_LEGAL]]';

/** Un solo buzón para contacto y privacidad, en el dominio del sitio: no expone un correo personal. */
export const CORREO_CONTACTO = 'hola@tordo.cl';

type Entorno = Record<string, string | undefined>;

/**
 * El nombre de quien hace el sitio, para firmar («hecho por») en la portada y en
 * `/acerca`. **`null` sin `RESPONSABLE_LEGAL`**: ahí no se firma con el hueco
 * `[[definir …]]` —que sí ven a propósito los documentos legales— ni, claro, con
 * un nombre inventado; la línea dice lo demás y calla el nombre.
 *
 * Se lee en cada llamada (no al importar, como `RESPONSABLE`) y sólo desde
 * componentes de servidor: en el navegador la variable no existe.
 */
export function nombreResponsable(entorno: Entorno = process.env): string | null {
  return entorno.RESPONSABLE_LEGAL?.trim() || null;
}

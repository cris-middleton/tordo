import { nombreDelEnlace } from '@/lib/autor';
import { CORREO_CONTACTO } from '@/lib/responsable';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/**
 * La ficha del autor (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.6, V5): quién
 * hace el sitio y a quién escribirle si un número no cuadra. **Sólo con
 * `AUTOR_NOMBRE`**: la portada no llega aquí sin nombre. Sin foto, sin
 * trayectoria y sin logos (spec §2, lo descartado): esto no es un CV.
 *
 * El rol (`AUTOR_ROL`) va tras el nombre entre comas; sin él, el nombre solo.
 *
 * El enlace del autor se nombra por su sitio («GitHub», «LinkedIn» o el dominio:
 * `nombreDelEnlace`).
 */
export function FichaAutor({ nombre, rol, url }: { nombre: string; rol: string | null; url: string | null }) {
  return (
    <aside aria-label="Quién lo hace" className="border-t border-border pt-5">
      <p className="text-text">
        <strong className="font-semibold">{nombre}</strong>
        {rol && `, ${rol},`} hace {APP_NAME} y escribe las notas de datos.
      </p>
      <p className="mt-2 text-sm text-muted">
        Si un número no cuadra con Mercado Público, escríbele: cada corrección sale como nota.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li>
          <a href={`mailto:${CORREO_CONTACTO}`} className="enlace">
            {CORREO_CONTACTO}
          </a>
        </li>
        {url && (
          <li>
            <a href={url} rel="noopener noreferrer" className="enlace">
              {nombreDelEnlace(url)}
            </a>
          </li>
        )}
      </ul>
    </aside>
  );
}

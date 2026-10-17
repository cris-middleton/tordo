/**
 * Quién hace el sitio, para firmarlo (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §7, V5).
 *
 * **La autoría no es el responsable legal** (`lib/responsable.ts`): así se puede
 * firmar sin tocar los términos ni la política de privacidad, que siguen con
 * `RESPONSABLE_LEGAL`.
 *
 * Sale de `AUTOR_NOMBRE`, `AUTOR_ROL` y `AUTOR_URL`, variables de SERVIDOR y opcionales, para
 * que ningún dato personal viva en el repositorio. **Sin `AUTOR_NOMBRE` no se pinta
 * nada**: ni un hueco ni un nombre inventado. `AUTOR_URL` sólo vale con `https://`,
 * el mismo criterio que `REPOSITORIO_URL` (`urlSegura`).
 *
 * **Sólo lo importan componentes de servidor** (`__tests__/autor.test.ts`): en un
 * componente cliente las variables no existen y la firma no saldría nunca. Las
 * páginas que lo leen se prerenderizan: en Vercel tienen que estar al construir.
 */
import { urlSegura } from './donaciones';

type Entorno = Record<string, string | undefined>;

/** El tope de `AUTOR_NOMBRE` (spec §7). Más largo es un error de configuración: no se firma. */
const MAXIMO_NOMBRE = 60;

export function nombreAutor(entorno: Entorno = process.env): string | null {
  const nombre = entorno.AUTOR_NOMBRE?.trim();
  return nombre && nombre.length <= MAXIMO_NOMBRE ? nombre : null;
}

/** El tope de `AUTOR_ROL`. Más largo es un error de configuración: no se dice el rol. */
const MAXIMO_ROL = 80;

/**
 * Qué hace el autor («ingeniero que construye productos con datos»), para el «Lo
 * hace» de la portada, `/acerca` y la ficha del autor. **No hay rol por defecto**:
 * sin `AUTOR_ROL` se firma sólo con el nombre. Vive fuera del código para que el
 * rol no dependa de un empleo y cambie sin un PR.
 */
export function rolAutor(entorno: Entorno = process.env): string | null {
  const rol = entorno.AUTOR_ROL?.trim();
  return rol && rol.length <= MAXIMO_ROL ? rol : null;
}

export function urlAutor(entorno: Entorno = process.env): string | null {
  return urlSegura(entorno.AUTOR_URL);
}

/** Los sitios que se nombran por su marca; el resto, por su dominio. */
const MARCAS: Record<string, string> = {
  'github.com': 'GitHub',
  'linkedin.com': 'LinkedIn',
};

/**
 * Cómo se nombra el enlace del autor: «GitHub», «LinkedIn» o el dominio sin
 * `www.` («alguien.cl»). Por dominio o subdominio exacto, no por texto: un
 * `notgithub.com` no es GitHub.
 */
export function nombreDelEnlace(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  for (const [dominio, marca] of Object.entries(MARCAS)) {
    if (host === dominio || host.endsWith(`.${dominio}`)) return marca;
  }
  return host;
}

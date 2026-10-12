/**
 * Los medios de donación de `/apoyar` (spec del pivote §4.2).
 *
 * Tres enlaces, sin integración. **Ningún dato del dueño vive en el repo**:
 * todo sale de variables de entorno de SERVIDOR, sin prefijo `NEXT_PUBLIC_`.
 *
 * - `DONAR_MERCADO_PAGO_URL` — link de pago abierto (el botón principal).
 * - `DONAR_GITHUB_SPONSORS_URL` — para el público técnico.
 * - `DONAR_TRANSFERENCIA` — texto multilínea con los datos bancarios. **No va en
 *   el HTML de la página**: lo entrega `GET /api/apoyar/transferencia` tras un
 *   clic. Así no lo indexa un buscador ni lo recoge un raspador que lea HTML, y
 *   `npm run check:secreto` lo busca con un centinela en lo que se sirve.
 *
 * **Sólo lo importan componentes de servidor y rutas.** Un componente cliente
 * que lo importara metería `process.env.DONAR_TRANSFERENCIA` en su bundle
 * (vacío, porque no lleva `NEXT_PUBLIC_`, pero es el mismo error que con el
 * secreto del proxy).
 *
 * `/apoyar` se prerenderiza en el build, como las páginas legales: en Vercel
 * las dos URL tienen que estar definidas al construir. La transferencia se lee
 * al pedirla.
 */

export interface MedioDeDonacion {
  id: 'mercado-pago' | 'github-sponsors';
  nombre: string;
  url: string;
}

export interface MediosDeDonacion {
  /** Mercado Pago primero: es el principal. */
  enlaces: MedioDeDonacion[];
  /** Si hay datos de transferencia. El TEXTO no sale de aquí: lo da la ruta. */
  transferencia: boolean;
}

type Entorno = Record<string, string | undefined>;

/**
 * La URL si es `https://` y parsea; si no, null. Un enlace de donación en
 * `http://` o mal escrito no se muestra: mandar a alguien a pagar por un
 * enlace sin cifrar, o a uno roto, es peor que no ofrecerlo.
 */
export function urlSegura(valor: string | undefined): string | null {
  const v = valor?.trim();
  if (!v) return null;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

/** El texto de la transferencia, o null si no está configurado. */
export function datosTransferencia(entorno: Entorno = process.env): string | null {
  const texto = entorno.DONAR_TRANSFERENCIA?.replace(/\r\n/g, '\n').trim();
  return texto ? texto : null;
}

export function mediosDeDonacion(entorno: Entorno = process.env): MediosDeDonacion {
  const enlaces: MedioDeDonacion[] = [];
  const mercadoPago = urlSegura(entorno.DONAR_MERCADO_PAGO_URL);
  if (mercadoPago) enlaces.push({ id: 'mercado-pago', nombre: 'Mercado Pago', url: mercadoPago });
  const sponsors = urlSegura(entorno.DONAR_GITHUB_SPONSORS_URL);
  if (sponsors) enlaces.push({ id: 'github-sponsors', nombre: 'GitHub Sponsors', url: sponsors });
  return { enlaces, transferencia: datosTransferencia(entorno) !== null };
}

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * La sesión vive en cookies `httpOnly`, no en `localStorage`.
 *
 * Por qué importa
 * ---------------
 * `localStorage` es legible por cualquier JavaScript que corra en la página.
 * Una dependencia comprometida —y el frontend tiene decenas— se lleva el token
 * y con él la sesión. Una cookie `httpOnly` **no la puede leer el navegador**:
 * sólo viaja al servidor, que es quien la usa.
 *
 * Con eso, el token de refresco (30 días) puede vivir en el navegador sin ser
 * un riesgo mayor que el de acceso (30 minutos). Antes no podía: por eso el
 * backend lo devuelve en el cuerpo y lo guarda ESTE lado, nunca el cliente.
 */

export const COOKIE_ACCESO = 'tordo_acceso';
export const COOKIE_REFRESCO = 'tordo_refresco';

const BACKEND = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function urlBackend(ruta: string): string {
  return `${BACKEND}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

function opciones(maxAge: number) {
  return {
    httpOnly: true,
    // En producción sólo por HTTPS. En local iría por HTTP y la cookie no se
    // enviaría nunca, así que el flag depende del entorno.
    secure: process.env.NODE_ENV === 'production',
    // `lax` y no `strict`: con `strict` la cookie no viaja al volver de un
    // proveedor externo, y el callback de Google dejaría de funcionar.
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** Guarda la sesión en la respuesta. `refresco` puede faltar (ruta de Google). */
export function guardarSesion(
  res: NextResponse,
  acceso: string,
  refresco?: string | null,
): NextResponse {
  // 30 min, igual que la vida del JWT: una cookie que sobreviva al token sólo
  // sirve para producir 401.
  res.cookies.set(COOKIE_ACCESO, acceso, opciones(30 * 60));
  if (refresco) {
    res.cookies.set(COOKIE_REFRESCO, refresco, opciones(30 * 24 * 60 * 60));
  }
  return res;
}

export function borrarSesion(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_ACCESO, '', { ...opciones(0), maxAge: 0 });
  res.cookies.set(COOKIE_REFRESCO, '', { ...opciones(0), maxAge: 0 });
  return res;
}

export async function leerSesion(): Promise<{ acceso?: string; refresco?: string }> {
  const tarro = await cookies();
  return {
    acceso: tarro.get(COOKIE_ACCESO)?.value,
    refresco: tarro.get(COOKIE_REFRESCO)?.value,
  };
}

/** Canjea el refresco por una pareja nueva. `null` si ya no vale. */
export async function rotar(
  refresco: string,
): Promise<{ acceso: string; refresco: string } | null> {
  const r = await fetch(urlBackend('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresco }),
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const datos = await r.json();
  return { acceso: datos.access_token, refresco: datos.refresh_token };
}

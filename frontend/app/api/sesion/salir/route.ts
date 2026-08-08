import { NextResponse } from 'next/server';

import { API } from '@/lib/versionApi';
import { borrarSesion, leerSesion, urlBackend } from '@/lib/servidor/sesion';

/**
 * Cierre de sesión.
 *
 * Revoca el refresco en el backend ANTES de borrar la cookie: si sólo se
 * borrara aquí, el token seguiría siendo válido para quien lo hubiera copiado.
 */
export async function POST() {
  const { refresco } = await leerSesion();

  if (refresco) {
    await fetch(urlBackend(`${API}/auth/logout`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresco }),
      cache: 'no-store',
    }).catch(() => {
      // Si el backend no responde igualmente se borra la cookie: dejar al
      // usuario dentro porque falló una llamada sería peor.
    });
  }

  return borrarSesion(NextResponse.json({ ok: true }));
}

export const dynamic = 'force-dynamic';

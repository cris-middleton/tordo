import { NextRequest, NextResponse } from 'next/server';

import { guardarSesion } from '@/lib/servidor/sesion';

/**
 * Vuelta de Google.
 *
 * Era una PÁGINA que leía `?token=` con JavaScript y lo metía en
 * `localStorage`. Ahora es un handler: el token se convierte en cookie
 * `httpOnly` del lado del servidor y **se responde con un redirect**, así que
 * sale de la barra de direcciones en el mismo instante y nunca lo ve un script.
 *
 * PENDIENTE, y conviene saberlo: el backend sólo manda el token de ACCESO en
 * esta redirección, así que una sesión iniciada con Google sigue caducando a los
 * 30 minutos. Mandar también el refresco por la URL sería peor —quedaría en el
 * historial, en los logs y en el `Referer`—. La solución es un código de un solo
 * uso que este handler canjee por la pareja, y eso exige tocar el backend.
 */
export function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const error = req.nextUrl.searchParams.get('error');

  const irA = (ruta: string) => NextResponse.redirect(new URL(ruta, req.nextUrl.origin));

  if (error || !token) {
    const mensaje =
      error === 'google_denied'
        ? 'Acceso denegado por Google.'
        : 'Error al iniciar sesión con Google.';
    return irA(`/login?error=${encodeURIComponent(mensaje)}`);
  }

  return guardarSesion(irA('/dashboard'), token);
}

export const dynamic = 'force-dynamic';

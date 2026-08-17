import { NextRequest, NextResponse } from 'next/server';

import { API } from '@/lib/versionApi';
import { guardarSesion, urlBackend } from '@/lib/servidor/sesion';

/**
 * Vuelta de Google.
 *
 * Era una PÁGINA que leía `?token=` con JavaScript y lo metía en
 * `localStorage`. Después pasó a ser un handler que convertía ese token en
 * cookie `httpOnly` del lado del servidor — mejor, pero **seguía llegando sólo
 * el token de acceso**, así que una sesión iniciada con Google moría a los 30
 * minutos en mitad de la jornada, que es justo lo que el refresco existe para
 * evitar.
 *
 * Ahora lo que llega por la URL es un **código de un solo uso**: no sirve para
 * nada por sí mismo, caduca en sesenta segundos y este handler lo canjea contra
 * el backend, de servidor a servidor, por el par acceso + refresco. El refresco
 * nunca aparece en una URL, ni en el historial, ni en el `Referer`.
 *
 * A partir de aquí la sesión de Google es idéntica a la de contraseña: la
 * renueva el proxy sola y se revoca igual.
 */
export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get('codigo');
  const error = req.nextUrl.searchParams.get('error');

  const irA = (ruta: string) => NextResponse.redirect(new URL(ruta, req.nextUrl.origin));
  const fallar = (mensaje: string) => irA(`/login?error=${encodeURIComponent(mensaje)}`);

  if (error) {
    return fallar(
      error === 'google_denied' ? 'Acceso denegado por Google.' : 'Error al iniciar sesión con Google.',
    );
  }
  if (!codigo) {
    return fallar('Error al iniciar sesión con Google.');
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(urlBackend(`${API}/auth/google/canjear`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
      cache: 'no-store',
    });
  } catch {
    // El backend no respondió. Es distinto de un código inválido y el usuario
    // merece saber que puede reintentar sin más.
    return fallar('No pudimos completar el acceso. Inténtalo de nuevo.');
  }

  if (!respuesta.ok) {
    return fallar('El enlace de acceso ya no es válido. Vuelve a entrar con Google.');
  }

  const datos = (await respuesta.json()) as {
    access_token?: string;
    refresh_token?: string | null;
  };
  if (!datos.access_token) {
    return fallar('No pudimos completar el acceso. Inténtalo de nuevo.');
  }

  return guardarSesion(irA('/dashboard'), datos.access_token, datos.refresh_token);
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  borrarSesion,
  guardarSesion,
  leerSesion,
  rotar,
  urlBackend,
} from '@/lib/servidor/sesion';

/**
 * Proxy hacia el backend. Todo el tráfico del navegador pasa por aquí.
 *
 * Qué resuelve
 * ------------
 * 1. **El navegador deja de ver los tokens.** El acceso viaja en una cookie
 *    `httpOnly` que este handler lee y convierte en `Authorization`. Un XSS ya
 *    no se puede llevar la sesión, porque no hay nada que leer.
 * 2. **La renovación es transparente.** Si el backend responde 401, se rota el
 *    refresco y se reintenta UNA vez. El usuario no ve nada; antes se le echaba
 *    al login cada 30 minutos.
 *
 * Se reintenta una sola vez a propósito: si el 401 persiste con un token recién
 * emitido, el problema no es la caducidad y repetir sólo multiplica peticiones.
 */

const SIN_CUERPO = new Set(['GET', 'HEAD']);

async function manejar(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await ctx.params;
  // El cliente ya manda la ruta completa del backend (`/api/auth/me`), así que
  // aquí sólo se quita el prefijo del proxy. Volver a prefijar `/api` daría
  // `/api/api/...`.
  const destino = urlBackend(`/${ruta.join('/')}${req.nextUrl.search}`);
  const { acceso, refresco } = await leerSesion();

  // El cuerpo se lee UNA vez y se reutiliza: un `Request` no se puede consumir
  // dos veces, y el reintento necesita el mismo cuerpo.
  const cuerpo = SIN_CUERPO.has(req.method) ? undefined : await req.arrayBuffer();

  const enviar = (token?: string) =>
    fetch(destino, {
      method: req.method,
      headers: {
        // Sólo lo necesario: reenviar las cabeceras del navegador tal cual
        // filtraría cookies de sesión de este dominio al backend.
        'Content-Type': req.headers.get('content-type') ?? 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo && cuerpo.byteLength > 0 ? cuerpo : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

  let respuesta = await enviar(acceso);

  if (respuesta.status === 401 && refresco) {
    const nueva = await rotar(refresco);
    if (!nueva) {
      // El refresco ya no vale: sesión terminada. Se limpian las cookies para
      // que el siguiente intento no vuelva a pasar por aquí.
      return borrarSesion(
        NextResponse.json({ detail: 'Sesión expirada' }, { status: 401 }),
      );
    }
    respuesta = await enviar(nueva.acceso);
    const salida = new NextResponse(await respuesta.arrayBuffer(), {
      status: respuesta.status,
      headers: { 'Content-Type': respuesta.headers.get('content-type') ?? 'application/json' },
    });
    return guardarSesion(salida, nueva.acceso, nueva.refresco);
  }

  return new NextResponse(await respuesta.arrayBuffer(), {
    status: respuesta.status,
    headers: { 'Content-Type': respuesta.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = manejar;
export const POST = manejar;
export const PUT = manejar;
export const PATCH = manejar;
export const DELETE = manejar;

// Sin caché: son datos por usuario y una respuesta cacheada podría servirse a
// otra sesión.
export const dynamic = 'force-dynamic';

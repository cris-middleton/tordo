import { NextRequest, NextResponse } from 'next/server';

import { API } from '@/lib/versionApi';
import { guardarSesion, urlBackend } from '@/lib/servidor/sesion';

/**
 * Inicio de sesión.
 *
 * El backend devuelve acceso y refresco en el cuerpo; **este handler es quien
 * los guarda**, en cookies `httpOnly`. Al navegador sólo le llega el usuario.
 * Ése es todo el punto: el cliente nunca toca un token.
 */
export async function POST(req: NextRequest) {
  const credenciales = await req.json();

  const r = await fetch(urlBackend(`${API}/auth/login`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credenciales),
    cache: 'no-store',
  });

  const datos = await r.json();
  if (!r.ok) {
    return NextResponse.json(datos, { status: r.status });
  }

  const usuario = await fetch(urlBackend(`${API}/auth/me`), {
    headers: { Authorization: `Bearer ${datos.access_token}` },
    cache: 'no-store',
  }).then((x) => (x.ok ? x.json() : null));

  return guardarSesion(
    NextResponse.json({ usuario }),
    datos.access_token,
    datos.refresh_token,
  );
}

export const dynamic = 'force-dynamic';

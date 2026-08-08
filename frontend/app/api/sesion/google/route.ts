import { NextResponse } from 'next/server';

import { API } from '@/lib/versionApi';
import { urlBackend } from '@/lib/servidor/sesion';

/**
 * Arranque del inicio de sesión con Google.
 *
 * Existe para que la URL del backend **no salga en el bundle del navegador**:
 * antes el botón la construía con `NEXT_PUBLIC_API_URL`, que por definición
 * viaja al cliente. Ahora el navegador va a una ruta propia y el redirect lo
 * decide el servidor.
 */
export function GET() {
  return NextResponse.redirect(urlBackend(`${API}/auth/google`));
}

export const dynamic = 'force-dynamic';

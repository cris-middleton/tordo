import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

import { CABECERA_REVALIDAR, etiquetasDelCuerpo, secretoCoincide } from '@/lib/revalidacion';

/**
 * `POST /api/revalidar` — lo llaman los cron (`etl/cron.py`) al terminar:
 * el semanal con `["analytics"]`, el frecuente con `["compra-agil"]`.
 *
 * - Sin `REVALIDAR_SECRETO` configurado: **503**. No hay valor por defecto: uno
 *   conocido dejaría a cualquiera vaciar la caché y mandar cada visita al
 *   backend.
 * - Secreto ausente o distinto: **401**.
 * - Cuerpo que no es `{"etiquetas": [...]}` con etiquetas de la lista blanca: **400**.
 *
 * `revalidateTag(etiqueta, 'max')`: marca lo cacheado como viejo y la próxima
 * visita lo sirve mientras se regenera detrás (stale-while-revalidate). La
 * forma de un solo argumento está obsoleta desde Next 16; la expiración
 * inmediata (`{ expire: 0 }`) haría que la primera visita tras el cron esperara
 * al backend, y para datos de una semana no hace falta.
 */
export async function POST(req: NextRequest) {
  const esperado = process.env.REVALIDAR_SECRETO;
  if (!esperado) {
    return Response.json({ detail: 'La revalidación no está configurada.' }, { status: 503 });
  }
  if (!secretoCoincide(req.headers.get(CABECERA_REVALIDAR), esperado)) {
    return Response.json({ detail: 'Secreto de revalidación inválido.' }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    cuerpo = null;
  }
  const etiquetas = etiquetasDelCuerpo(cuerpo);
  if (!etiquetas) {
    return Response.json(
      { detail: 'Se esperaba {"etiquetas": [...]} con «analytics» o «compra-agil».' },
      { status: 400 },
    );
  }

  for (const etiqueta of etiquetas) revalidateTag(etiqueta, 'max');
  return Response.json({ revalidadas: etiquetas });
}

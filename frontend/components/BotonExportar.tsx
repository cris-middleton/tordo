'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api';

/**
 * Descargar el análisis de la pantalla como CSV.
 *
 * **La descarga pasa por el proxy autenticado, no por un `href` directo.** Un
 * enlace normal iría al backend sin la cabecera `Authorization` —la sesión vive
 * en una cookie `httpOnly` que sólo lee el proxy de Next— así que devolvería
 * 401 y el navegador descargaría un archivo con el error dentro. Por eso se pide
 * como `blob` y se dispara la descarga a mano.
 *
 * Y por eso también el `revokeObjectURL`: sin él, cada descarga deja el archivo
 * entero retenido en memoria hasta que se recargue la pestaña.
 */
export default function BotonExportar({
  ruta,
  etiqueta = 'Descargar CSV',
}: {
  /** Ruta relativa a la API, ej. `bi/exportar/precio/41116000`. */
  ruta: string;
  etiqueta?: string;
}) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descargar = async () => {
    setBajando(true);
    setError(null);
    try {
      const { blob, nombre } = await apiClient.descargarCsv(ruta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // El 402 por cuota agotada ya lo pinta `PlanUpgradeBanner` desde el
      // interceptor. Aquí sólo hace falta que el botón deje de girar y diga algo.
      setError('No se pudo descargar. Inténtalo de nuevo.');
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={descargar}
        disabled={bajando}
        className="btn-secondary inline-flex items-center gap-1.5 text-xs"
      >
        {bajando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {etiqueta}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

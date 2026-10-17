'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api';

/**
 * Descargar el análisis de la pantalla como CSV.
 *
 * **La descarga pasa por el proxy de Next, no por un `href` directo**: la URL
 * del backend es de servidor y el navegador sólo conoce `/api/proxy`. Se pide
 * como `blob` y se dispara la descarga a mano, así un error se queda en el
 * botón en vez de bajarse como un archivo con el error dentro.
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
      // Basta con que el botón deje de girar y diga algo.
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
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

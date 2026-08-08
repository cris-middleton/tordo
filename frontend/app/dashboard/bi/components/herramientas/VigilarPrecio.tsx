'use client';

import axios from 'axios';
import { Bell, BellOff, Loader2 } from 'lucide-react';

import { useEmpresaActiva } from '@/lib/empresaActive';
import {
  useDejarDeVigilarPrecio,
  usePreciosVigilados,
  useVigilarPrecio,
} from '@/lib/queries';

/**
 * El botón que convierte una consulta de precio en un aviso.
 *
 * Consultar un precio es una foto; vigilarlo es lo que avisa cuando cambia.
 * Sin este botón la vigilancia existiría sólo en la API y nadie la usaría.
 *
 * **No pide la unidad de medida.** Forma parte de la identidad del precio —el
 * mismo producto en «Unidad» y en «Caja» vale cosas distintas—, pero quien
 * consulta busca un producto, no una unidad: la resuelve el servidor por la que
 * más se compra y se muestra ya resuelta, para que el usuario sepa qué le van a
 * comparar.
 */
export default function VigilarPrecio({
  codigoProducto,
  nombreProducto,
}: {
  codigoProducto: string;
  nombreProducto?: string;
}) {
  const empresaId = useEmpresaActiva();
  const { data: vigilados } = usePreciosVigilados(empresaId ?? undefined);
  const vigilar = useVigilarPrecio(empresaId ?? '');
  const dejar = useDejarDeVigilarPrecio(empresaId ?? '');

  // Sin empresa no hay a quién avisar: la suscripción es de la empresa.
  if (!empresaId) return null;

  const yaVigilado = vigilados?.find((v) => v.codigo_producto === codigoProducto);
  const ocupado = vigilar.isPending || dejar.isPending;

  if (yaVigilado) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
          <Bell className="h-3.5 w-3.5" />
          Vigilando
          {yaVigilado.unidad_medida && <> · por {yaVigilado.unidad_medida}</>}
        </span>
        <span className="text-muted">
          Te avisamos si cambia más de un {Math.round(yaVigilado.umbral_pct)}%.
        </span>
        <button
          onClick={() => dejar.mutate(yaVigilado.id)}
          disabled={ocupado}
          className="ml-auto inline-flex items-center gap-1 text-muted hover:text-danger disabled:opacity-50"
        >
          {dejar.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
          Dejar de vigilar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
      <button
        onClick={() =>
          vigilar.mutate({ codigo_producto: codigoProducto, nombre_producto: nombreProducto })
        }
        disabled={ocupado}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium text-text hover:border-primary hover:text-primary disabled:opacity-50"
      >
        {vigilar.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bell className="h-3.5 w-3.5" />
        )}
        Avisarme si cambia el precio
      </button>
      <span className="text-muted">Revisamos los precios cada semana.</span>
      {vigilar.isError && (
        <span className="text-danger">
          {/* El 403 se distingue a propósito: «inténtalo otra vez» invitaría a
              reintentar algo que no va a funcionar nunca con ese rol. */}
          {axios.isAxiosError(vigilar.error) && vigilar.error.response?.status === 403
            ? 'Solo quien administra la cuenta puede activar avisos.'
            : 'No se pudo activar el aviso. Inténtalo otra vez.'}
        </span>
      )}
    </div>
  );
}

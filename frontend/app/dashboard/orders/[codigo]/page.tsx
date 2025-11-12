'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  Building2,
  Info,
  BadgeCheck,
} from 'lucide-react';
import { format } from 'date-fns';

interface OrderDetail {
  id: number;
  codigo_oc: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion?: string;
  fecha_emision?: string;
  monto_total: number;
  moneda?: string;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  nombre_proveedor?: string;
  codigo_organismo?: string;
  codigo_proveedor?: string;
  url_detalle?: string;
  categoria?: string;
  rubro?: string;
}

interface PageParams {
  params: { codigo: string };
}

export default function OrderDetailPage({ params }: PageParams) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOrder = async () => {
      const codigo = decodeURIComponent(params.codigo);
      try {
        const response = await apiClient.getOrders({
          codigo_oc: codigo,
          limit: 1,
        });
        const item = Array.isArray(response.data) ? response.data[0] : null;
        if (!item) {
          throw new Error('Orden no encontrada');
        }
        setOrder(item);
      } catch (err) {
        console.error('Error loading order detail:', err);
        setError('No pudimos cargar la información de la orden seleccionada.');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [params.codigo]);

  const formatCurrency = (amount: number, currency: string = 'CLP') => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="btn-secondary flex items-center gap-2"
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-semibold text-text sm:text-3xl">
          Detalle Orden de Compra
        </h1>
      </div>

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error}
        </div>
      ) : !order ? (
        <div className="card p-6 text-muted">No se encontró la orden solicitada.</div>
      ) : (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-muted">Código orden de compra</p>
                <h2 className="text-2xl font-semibold text-text">{order.codigo_oc}</h2>
              </div>
              {order.url_detalle && (
                <Link
                  href={order.url_detalle}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                >
                  <BadgeCheck className="h-4 w-4" />
                  Ver en Mercado Público
                </Link>
              )}
            </div>

            <div>
              <p className="text-sm text-muted">Nombre</p>
              <p className="text-lg font-medium text-text">{order.nombre}</p>
            </div>

            {order.descripcion && (
              <div>
                <p className="text-sm text-muted">Descripción</p>
                <p className="text-sm leading-6 text-text">{order.descripcion}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <Calendar className="h-4 w-4 text-primary" />
                Fechas
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Publicación: </span>
                  {order.fecha_publicacion
                    ? format(new Date(order.fecha_publicacion), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                {order.fecha_emision && (
                  <p>
                    <span className="font-medium text-text">Emisión: </span>
                    {format(new Date(order.fecha_emision), 'dd MMM yyyy')}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <DollarSign className="h-4 w-4 text-accent" />
                Financiero
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Monto total: </span>
                  {formatCurrency(order.monto_total, order.moneda)}
                </p>
                {order.categoria && (
                  <p>
                    <span className="font-medium text-text">Categoría: </span>
                    {order.categoria}
                  </p>
                )}
                {order.rubro && (
                  <p>
                    <span className="font-medium text-text">Rubro: </span>
                    {order.rubro}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <MapPin className="h-4 w-4 text-primaryDark" />
                Ubicación y actores
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Región: </span>
                  {order.region || 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Comuna: </span>
                  {order.comuna || 'Sin información'}
                </p>
                {order.nombre_organismo && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Organismo público</p>
                      <p className="text-sm text-text">{order.nombre_organismo}</p>
                      {order.codigo_organismo && (
                        <p className="text-xs text-muted">Código: {order.codigo_organismo}</p>
                      )}
                    </div>
                  </div>
                )}
                {order.nombre_proveedor && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Proveedor</p>
                      <p className="text-sm text-text">{order.nombre_proveedor}</p>
                      {order.codigo_proveedor && (
                        <p className="text-xs text-muted">Código: {order.codigo_proveedor}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Info className="h-4 w-4 text-primary" />
              Información adicional
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm text-muted sm:grid-cols-2">
              <div>
                <p className="font-medium text-text">Estado</p>
                <p>{order.estado || 'Sin información'}</p>
              </div>
              <div>
                <p className="font-medium text-text">ID interno</p>
                <p>{order.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



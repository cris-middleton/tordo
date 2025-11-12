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
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

interface TenderDetail {
  id: number;
  codigo_externo: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion?: string;
  fecha_cierre?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  url_licitacion?: string;
  categoria?: string;
  tipo?: string;
  dias_publicacion?: number;
  dias_cierre?: number;
}

interface PageParams {
  params: { codigo: string };
}

export default function TenderDetailPage({ params }: PageParams) {
  const router = useRouter();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTender = async () => {
      const codigo = decodeURIComponent(params.codigo);
      try {
        const response = await apiClient.getTenderByCode(codigo);
        setTender(response);
      } catch (err) {
        console.error('Error loading tender detail:', err);
        setError('No pudimos cargar la información de la licitación seleccionada.');
      } finally {
        setLoading(false);
      }
    };

    loadTender();
  }, [params.codigo]);

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
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
        <h1 className="text-2xl font-semibold text-text sm:text-3xl">Detalle Licitación</h1>
      </div>

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error}
        </div>
      ) : !tender ? (
        <div className="card p-6 text-muted">No se encontró la licitación solicitada.</div>
      ) : (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-muted">Código externo</p>
                <h2 className="text-2xl font-semibold text-text">{tender.codigo_externo}</h2>
              </div>
              {tender.url_licitacion && (
                <Link
                  href={tender.url_licitacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir en Mercado Público
                </Link>
              )}
            </div>

            <div>
              <p className="text-sm text-muted">Nombre</p>
              <p className="text-lg font-medium text-text">{tender.nombre}</p>
            </div>

              {tender.descripcion && (
                <div>
                  <p className="text-sm text-muted">Descripción</p>
                  <p className="text-sm leading-6 text-text">{tender.descripcion}</p>
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
                  {tender.fecha_publicacion
                    ? format(new Date(tender.fecha_publicacion), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Cierre: </span>
                  {tender.fecha_cierre
                    ? format(new Date(tender.fecha_cierre), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                {typeof tender.dias_publicacion === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días publicada: </span>
                    {tender.dias_publicacion}
                  </p>
                )}
                {typeof tender.dias_cierre === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días hasta cierre: </span>
                    {tender.dias_cierre}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <DollarSign className="h-4 w-4 text-accent" />
                Monto y clasificación
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Monto estimado: </span>
                  {formatCurrency(tender.monto_estimado)}
                </p>
                {tender.categoria && (
                  <p>
                    <span className="font-medium text-text">Categoría: </span>
                    {tender.categoria}
                  </p>
                )}
                {tender.tipo && (
                  <p>
                    <span className="font-medium text-text">Tipo: </span>
                    {tender.tipo}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <MapPin className="h-4 w-4 text-primaryDark" />
                Ubicación y organismo
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Región: </span>
                  {tender.region || 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Comuna: </span>
                  {tender.comuna || 'Sin información'}
                </p>
                {tender.nombre_organismo && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Organismo público</p>
                      <p className="text-sm text-text">{tender.nombre_organismo}</p>
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
                <p>{tender.estado || 'Sin información'}</p>
              </div>
              <div>
                <p className="font-medium text-text">ID interno</p>
                <p>{tender.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



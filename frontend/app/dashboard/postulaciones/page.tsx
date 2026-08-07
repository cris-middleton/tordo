'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useDocumentos, useEmpresas, usePostulaciones } from '@/lib/queries';
import SelectField from '@/components/SelectField';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ChecklistItem {
  id: string;
  descripcion: string;
  completado: boolean;
  es_obligatorio: boolean;
  orden: number;
  documento_id: string | null;
}

interface Postulacion {
  id: string;
  empresa_id: string;
  licitacion_id: number;
  estado: string;
  notas?: string;
  created_at: string;
  checklist: ChecklistItem[];
  licitacion?: { nombre?: string; codigo_externo?: string };
}

interface Empresa {
  id: string;
  nombre_empresa: string;
  rut_empresa: string;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  en_seguimiento: { label: 'En seguimiento', color: 'text-muted border-border bg-surface', icon: Clock },
  en_preparacion: { label: 'En preparación', color: 'text-gold border-gold/30 bg-gold/10', icon: Clock },
  enviada: { label: 'Enviada', color: 'text-info border-info/30 bg-info/10', icon: Send },
  adjudicada: { label: 'Adjudicada', color: 'text-accent border-accent/30 bg-accent/10', icon: CheckCircle2 },
  no_adjudicada: { label: 'No adjudicada', color: 'text-danger border-danger/30 bg-danger/10', icon: XCircle },
  descartada: { label: 'Descartada', color: 'text-muted border-border bg-surface', icon: XCircle },
};

interface DocumentoRef {
  id: string;
  nombre_archivo: string;
  tipo_documento: string;
}

function PostulacionCard({
  postulacion,
  onChecklistToggle,
  documentos,
  onDocumentoLink,
}: {
  postulacion: Postulacion;
  onChecklistToggle: (postulacionId: string, itemId: string, currentCompleted: boolean) => void;
  documentos: DocumentoRef[];
  onDocumentoLink: (postulacionId: string, itemId: string, completado: boolean, documentoId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = ESTADO_CONFIG[postulacion.estado] || ESTADO_CONFIG.en_seguimiento;
  const Icon = config.icon;

  const totalItems = postulacion.checklist.length;
  const completedItems = postulacion.checklist.filter((i) => i.completado).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allObligatoriosDone = postulacion.checklist
    .filter((i) => i.es_obligatorio)
    .every((i) => i.completado);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text truncate">
            {postulacion.licitacion?.nombre || `Licitación #${postulacion.licitacion_id}`}
          </p>
          {postulacion.licitacion?.codigo_externo && (
            <p className="text-xs text-muted mt-0.5">
              Código: {postulacion.licitacion.codigo_externo}
            </p>
          )}
          <p className="text-xs text-muted mt-0.5">
            Creada: {format(new Date(postulacion.created_at), 'dd MMM yyyy', { locale: es })}
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${config.color}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </span>
      </div>

      {/* Progress bar */}
      {totalItems > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted">
              Checklist: {completedItems}/{totalItems}
            </span>
            <span
              className={`text-xs font-medium ${allObligatoriosDone ? 'text-accent' : 'text-gold'}`}
            >
              {allObligatoriosDone ? '✓ Requisitos completos' : 'Faltan obligatorios'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress === 100 ? 'bg-accent' : progress > 50 ? 'bg-primary' : 'bg-gold'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expand checklist */}
      {totalItems > 0 && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex w-full items-center justify-between text-xs text-muted hover:text-primary transition-colors"
        >
          <span>Ver checklist</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}

      {expanded && (
        <ul className="space-y-2 pl-1">
          {[...postulacion.checklist]
            .sort((a, b) => a.orden - b.orden)
            .map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <button
                  onClick={() => onChecklistToggle(postulacion.id, item.id, item.completado)}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors ${
                    item.completado
                      ? 'bg-primary border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {item.completado && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </button>
                <span
                  className={`text-sm ${
                    item.completado ? 'line-through text-muted' : 'text-text'
                  }`}
                >
                  {item.descripcion}
                  {item.es_obligatorio && (
                    <span className="ml-1 text-xs text-danger">*</span>
                  )}
                </span>
                {documentos.length > 0 && (
                  <select
                    value={item.documento_id ?? ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const docId = e.target.value || null;
                      onDocumentoLink(postulacion.id, item.id, item.completado, docId);
                    }}
                    className="ml-2 text-xs border border-border rounded-lg px-1.5 py-0.5 text-muted bg-surface focus:outline-none focus:ring-1 focus:ring-primary max-w-[140px]"
                    title="Vincular documento"
                  >
                    <option value="">Doc...</option>
                    {documentos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre_archivo?.length > 20 ? d.nombre_archivo.slice(0, 20) + '...' : d.nombre_archivo}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          <p className="text-xs text-muted pl-6">* Obligatorio</p>
        </ul>
      )}
    </div>
  );
}

export default function PostulacionesPage() {
  const router = useRouter();
  const [filtroEstado, setFiltroEstado] = useState('');

  const { data: empresasData } = useEmpresas();
  const empresas = (empresasData ?? []) as Empresa[];
  // Se DERIVA de la primera empresa mientras el usuario no elija otra.
  const [empresaElegida, setEmpresaId] = useState('');
  const empresaId = empresaElegida || empresas[0]?.id || '';

  const consultaPost = usePostulaciones(empresaId || undefined, {
    estado: filtroEstado || undefined,
    limit: 50,
  });
  const datosPost = consultaPost.data as unknown;
  const postulaciones: Postulacion[] = Array.isArray(datosPost)
    ? (datosPost as Postulacion[])
    : (((datosPost as { items?: Postulacion[] })?.items) ?? []);
  const loading = consultaPost.isFetching || !empresasData;

  const consultaDocs = useDocumentos(empresaId || undefined);
  const datosDocs = consultaDocs.data as unknown;
  const documentos: DocumentoRef[] = (
    Array.isArray(datosDocs) ? datosDocs : (((datosDocs as { items?: unknown[] })?.items) ?? [])
  ).map((d) => {
    const doc = d as { id: string; nombre_archivo: string; tipo_documento: string };
    return {
      id: doc.id,
      nombre_archivo: doc.nombre_archivo,
      tipo_documento: doc.tipo_documento,
    };
  });

  // Nombres conservados: los llaman las acciones de la pantalla.
  const loadPostulaciones = consultaPost.refetch;
  const loadDocumentos = consultaDocs.refetch;

  const handleDocumentoLink = async (postulacionId: string, itemId: string, completado: boolean, documentoId: string | null) => {
    try {
      await apiClient.toggleChecklistItem(postulacionId, itemId, completado, documentoId ?? undefined);
      // Antes se actualizaba la lista en local; ahora se recarga del
      // servidor, que es lo que de verdad quedó guardado.
      await loadPostulaciones();
    } catch {
      // ignore
    }
  };

  const handleChecklistToggle = async (postulacionId: string, itemId: string, currentCompleted: boolean) => {
    const newCompleted = !currentCompleted;
    try {
      await apiClient.toggleChecklistItem(postulacionId, itemId, newCompleted);
      // Antes se actualizaba la lista en local; ahora se recarga del
      // servidor, que es lo que de verdad quedó guardado.
      await loadPostulaciones();
    } catch {
      // ignore
    }
  };

  if (!loading && empresas.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Postulaciones</h1>
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="h-10 w-10 text-subtle" />
          <p className="text-muted">Registra tu empresa primero para gestionar postulaciones.</p>
          <button onClick={() => router.push('/onboarding')} className="btn-primary">
            Registrar empresa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Postulaciones</h1>
          <p className="text-sm text-muted mt-0.5">Gestiona tus postulaciones a licitaciones activas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {empresas.length > 1 && (
          <SelectField
            value={empresaId}
            onChange={setEmpresaId}
            options={empresas.map((e) => ({ value: String(e.id), label: e.nombre_empresa }))}
            className="w-48"
          />
        )}
        <SelectField
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: '', label: 'Todos los estados' },
            ...Object.entries(ESTADO_CONFIG).map(([key, cfg]) => ({ value: key, label: cfg.label })),
          ]}
          className="w-48"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : postulaciones.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <ClipboardList className="h-10 w-10 text-subtle" />
          <p className="text-muted">No hay postulaciones aún.</p>
          <p className="text-sm text-muted">
            Desde una licitación, haz clic en «Postular» para crear una postulación con checklist automático.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard/tenders')}
              className="btn-primary"
            >
              Explorar licitaciones
            </button>
            <button
              onClick={() => router.push('/dashboard/orders')}
              className="btn-accent"
            >
              Explorar órdenes de compra
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {postulaciones.map((p) => (
            <PostulacionCard
              key={p.id}
              postulacion={p}
              onChecklistToggle={handleChecklistToggle}
              documentos={documentos || []}
              onDocumentoLink={handleDocumentoLink}
            />
          ))}
        </div>
      )}
    </div>
  );
}

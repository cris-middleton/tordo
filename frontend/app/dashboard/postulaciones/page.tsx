'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
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
  en_preparacion: { label: 'En preparación', color: 'text-amber-700 border-amber-200 bg-amber-50', icon: Clock },
  enviada: { label: 'Enviada', color: 'text-blue-700 border-blue-200 bg-blue-50', icon: Send },
  adjudicada: { label: 'Adjudicada', color: 'text-green-700 border-green-200 bg-green-50', icon: CheckCircle2 },
  no_adjudicada: { label: 'No adjudicada', color: 'text-red-700 border-red-200 bg-red-50', icon: XCircle },
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
              className={`text-xs font-medium ${allObligatoriosDone ? 'text-green-600' : 'text-amber-600'}`}
            >
              {allObligatoriosDone ? '✓ Requisitos completos' : 'Faltan obligatorios'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress === 100 ? 'bg-green-500' : progress > 50 ? 'bg-blue-500' : 'bg-amber-400'
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
                    <span className="ml-1 text-xs text-red-500">*</span>
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
                    className="ml-2 text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[140px]"
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
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [postulaciones, setPostulaciones] = useState<Postulacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoRef[]>([]);

  useEffect(() => {
    loadEmpresas();
  }, []);

  useEffect(() => {
    if (empresaId) {
      loadPostulaciones();
      loadDocumentos();
    }
  }, [empresaId, filtroEstado]);

  const loadEmpresas = async () => {
    try {
      const data = await apiClient.getEmpresas();
      setEmpresas(data);
      if (data.length > 0) setEmpresaId(data[0].id);
    } catch {
      setLoading(false);
    }
  };

  const loadPostulaciones = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getPostulaciones(empresaId, {
        estado: filtroEstado || undefined,
        limit: 50,
      });
      setPostulaciones(Array.isArray(data) ? data : data.items || []);
    } catch {
      setPostulaciones([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentos = async () => {
    try {
      const data = await apiClient.getDocumentos(empresaId);
      const docs: DocumentoRef[] = (Array.isArray(data) ? data : data.items || []).map(
        (d: { id: string; nombre_archivo: string; tipo_documento: string }) => ({
          id: d.id,
          nombre_archivo: d.nombre_archivo,
          tipo_documento: d.tipo_documento,
        }),
      );
      setDocumentos(docs);
    } catch {
      setDocumentos([]);
    }
  };

  const handleDocumentoLink = async (postulacionId: string, itemId: string, completado: boolean, documentoId: string | null) => {
    try {
      await apiClient.toggleChecklistItem(postulacionId, itemId, completado, documentoId ?? undefined);
      setPostulaciones((prev) =>
        prev.map((p) =>
          p.id === postulacionId
            ? {
                ...p,
                checklist: p.checklist.map((c) =>
                  c.id === itemId ? { ...c, documento_id: documentoId } : c,
                ),
              }
            : p,
        ),
      );
    } catch {
      // ignore
    }
  };

  const handleChecklistToggle = async (postulacionId: string, itemId: string, currentCompleted: boolean) => {
    const newCompleted = !currentCompleted;
    try {
      await apiClient.toggleChecklistItem(postulacionId, itemId, newCompleted);
      setPostulaciones((prev) =>
        prev.map((p) =>
          p.id === postulacionId
            ? {
                ...p,
                checklist: p.checklist.map((i) =>
                  i.id === itemId ? { ...i, completado: newCompleted } : i,
                ),
              }
            : p,
        ),
      );
    } catch {
      // ignore
    }
  };

  if (!loading && empresas.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-text">Postulaciones</h1>
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="h-12 w-12 text-muted" />
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Postulaciones</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {empresas.length > 1 && (
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="input-field max-w-xs"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre_empresa}
              </option>
            ))}
          </select>
        )}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="input-field max-w-xs"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : postulaciones.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <ClipboardList className="h-12 w-12 text-muted" />
          <p className="text-muted">No hay postulaciones aún.</p>
          <p className="text-sm text-muted">
            Desde una licitación, haz clic en «Postular» para crear una postulación con checklist automático.
          </p>
          <button
            onClick={() => router.push('/dashboard/tenders')}
            className="btn-primary"
          >
            Explorar licitaciones
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {postulaciones.map((p) => (
            <PostulacionCard
              key={p.id}
              postulacion={p}
              onChecklistToggle={handleChecklistToggle}
              documentos={documentos}
              onDocumentoLink={handleDocumentoLink}
            />
          ))}
        </div>
      )}
    </div>
  );
}

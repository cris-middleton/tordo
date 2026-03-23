'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import {
  Upload,
  FileText,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  X,
  Building2,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Empresa {
  id: string;
  rut_empresa: string;
  nombre_empresa: string;
  estado_habil: string;
}

interface Documento {
  id: string;
  nombre: string;
  tipo_documento: string;
  mime_type?: string;
  tamano_bytes?: number;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  esta_vigente: boolean;
  created_at: string;
}

const TIPOS_DOCUMENTO = [
  'Certificado de vigencia',
  'Poder notarial',
  'Inicio de actividades SII',
  'Estado de situación tributaria',
  'Certificado de antecedentes laborales',
  'Garantía bancaria',
  'Boleta de garantía',
  'Póliza de seguro',
  'Certificado de deuda previsional',
  'Otro',
];

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VencimientoBadge({ fecha }: { fecha?: string }) {
  if (!fecha) return <span className="text-xs text-muted">Sin vencimiento</span>;
  const days = differenceInDays(new Date(fecha), new Date());
  if (days < 0)
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertTriangle className="h-3 w-3" />
        Vencido
      </span>
    );
  if (days <= 30)
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
        <AlertTriangle className="h-3 w-3" />
        Vence en {days}d
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-green-600">
      <CheckCircle2 className="h-3 w-3" />
      {format(new Date(fecha), 'dd MMM yyyy', { locale: es })}
    </span>
  );
}

export default function DocumentosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [fechaEmision, setFechaEmision] = useState('');

  useEffect(() => {
    loadEmpresas();
  }, []);

  useEffect(() => {
    if (empresaId) loadDocumentos();
  }, [empresaId]);

  const loadEmpresas = async () => {
    try {
      const data = await apiClient.getEmpresas();
      setEmpresas(data);
      if (data.length > 0) setEmpresaId(data[0].id);
    } catch {
      setError('No se pudieron cargar las empresas.');
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentos = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const data = await apiClient.getDocumentos(empresaId);
      setDocumentos(data);
    } catch {
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !empresaId) return;
    if (uploadFile.size > 26214400) {
      setError('El archivo supera el límite de 25 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('tipo_documento', tipoDocumento);
      if (fechaVencimiento) formData.append('fecha_vencimiento', fechaVencimiento);
      if (fechaEmision) formData.append('fecha_emision', fechaEmision);

      await apiClient.uploadDocumento(empresaId, formData);
      setSuccess('Documento subido correctamente.');
      setShowUploadForm(false);
      setUploadFile(null);
      setFechaVencimiento('');
      setFechaEmision('');
      await loadDocumentos();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await apiClient.deleteDocumento(empresaId, docId);
      setDocumentos((prev) => prev.filter((d) => d.id !== docId));
      setSuccess('Documento eliminado.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Error al eliminar el documento.');
    }
  };

  if (loading && !empresaId) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (empresas.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-text">Documentos</h1>
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="h-12 w-12 text-muted" />
          <p className="text-muted">No tienes ninguna empresa registrada.</p>
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
        <h1 className="text-2xl font-semibold text-text">Documentos</h1>
        <button
          onClick={() => setShowUploadForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Subir documento
        </button>
      </div>

      {/* Empresa selector */}
      {empresas.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted">Empresa:</label>
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="input-field max-w-xs"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre_empresa} ({e.rut_empresa})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <X className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Upload form modal */}
      {showUploadForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">Subir documento</h2>
              <button onClick={() => setShowUploadForm(false)}>
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>

            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background p-6 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted mb-2" />
              {uploadFile ? (
                <p className="text-sm font-medium text-text">{uploadFile.name}</p>
              ) : (
                <p className="text-sm text-muted">Haz clic o arrastra un archivo (máx. 25 MB)</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Tipo de documento</label>
              <select
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value)}
                className="input-field"
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-text">Fecha emisión</label>
                <input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-text">Fecha vencimiento</label>
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowUploadForm(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Subir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documents list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : documentos.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <FileText className="h-12 w-12 text-muted" />
          <p className="text-muted">No hay documentos cargados aún.</p>
          <button
            onClick={() => setShowUploadForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Subir primer documento
          </button>
        </div>
      ) : (
        <div className="card divide-y divide-border p-0 overflow-hidden">
          {documentos.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center justify-between gap-4 px-4 py-3 ${
                !doc.esta_vigente ? 'bg-red-50' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{doc.nombre}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted">{doc.tipo_documento}</span>
                    {doc.tamano_bytes && (
                      <span className="text-xs text-muted">{formatBytes(doc.tamano_bytes)}</span>
                    )}
                    <VencimientoBadge fecha={doc.fecha_vencimiento} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={apiClient.getDocumentoDownloadUrl(empresaId, doc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border p-1.5 text-muted hover:border-primary/40 hover:text-primary transition-colors"
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="rounded-md border border-border p-1.5 text-muted hover:border-red-400/40 hover:text-red-500 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

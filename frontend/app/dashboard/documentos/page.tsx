'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import SelectField from '@/components/SelectField';
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
      <span className="flex items-center gap-1 text-xs font-medium text-danger">
        <AlertTriangle className="h-3 w-3" />
        Vencido
      </span>
    );
  if (days <= 30)
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-gold">
        <AlertTriangle className="h-3 w-3" />
        Vence en {days}d
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-accent">
      <CheckCircle2 className="h-3 w-3" />
      {format(new Date(fecha), 'dd MMM yyyy', { locale: es })}
    </span>
  );
}

export default function DocumentosPage() {
  const router = useRouter();
  const { user } = useAuth();
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
  const [isDragging, setIsDragging] = useState(false);
  const [estadoHabil, setEstadoHabil] = useState<string | null>(null);

  useEffect(() => {
    loadEmpresas();
  }, []);

  useEffect(() => {
    if (empresaId) loadDocumentos();
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    apiClient.getEstadoHabil(empresaId)
      .then((data: any) => setEstadoHabil(data?.estado_habil ?? null))
      .catch((err) => {
        console.error('Error fetching estado hábil:', err);
        setEstadoHabil(null);
      });
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

  function handleFileSelect(file: File) {
    const MAX_MB = 25
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${MAX_MB} MB`)
      return
    }
    setUploadFile(file)
    setError('')
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation()
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFileSelect(dropped)
  }

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-text sm:text-3xl">Documentos</h1>
          {estadoHabil && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              estadoHabil === 'habil'
                ? 'bg-accent/10 text-accent'
                : estadoHabil === 'inhabil'
                ? 'bg-danger/10 text-danger'
                : 'bg-border text-muted'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                estadoHabil === 'habil' ? 'bg-accent' : 'bg-danger'
              }`} />
              {estadoHabil === 'habil' ? 'Hábil' : estadoHabil === 'inhabil' ? 'Inhábil' : estadoHabil}
            </span>
          )}
        </div>
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
          <SelectField
            value={empresaId}
            onChange={setEmpresaId}
            options={empresas.map((e) => ({ value: e.id, label: `${e.nombre_empresa} (${e.rut_empresa})` }))}
            className="max-w-xs"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          <X className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/30 px-4 py-3 text-sm text-accent">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Upload form modal */}
      {showUploadForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">Subir documento</h2>
              <button onClick={() => setShowUploadForm(false)}>
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>

            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload-input')?.click()}
              className={`relative border-2 border-dashed rounded-xl p-5 sm:p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-info bg-info/10 scale-[1.01]'
                  : uploadFile
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-borderLight bg-background'
              }`}
            >
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                  <p className="text-info font-semibold text-sm">Suelta el archivo aquí</p>
                </div>
              )}

              {!isDragging && !uploadFile && (
                <>
                  <div className="w-10 h-10 bg-border rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-muted">Arrastra un archivo aquí</p>
                  <p className="text-xs text-muted mt-1">o haz clic para seleccionar</p>
                  <p className="text-xs text-muted mt-2">PDF, DOC, DOCX, JPG, PNG, XLSX · Máx. 25 MB</p>
                </>
              )}

              {!isDragging && uploadFile && (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium text-text truncate max-w-[180px]">
                      {uploadFile.name}
                    </p>
                    <p className="text-xs text-muted">
                      {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setUploadFile(null) }}
                    className="text-muted hover:text-danger transition-colors ml-1"
                    title="Quitar archivo"
                  >
                    ✕
                  </button>
                </div>
              )}

              <input
                id="file-upload-input"
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Tipo de documento</label>
              <SelectField
                value={tipoDocumento}
                onChange={setTipoDocumento}
                options={TIPOS_DOCUMENTO.map((t) => ({ value: t, label: t }))}
              />
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
                !doc.esta_vigente ? 'bg-danger/10' : ''
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
                <button
                  onClick={async () => {
                    const res = await apiClient.getDocumentoDownloadUrl(empresaId, doc.id);
                    window.open(res.url, '_blank', 'noopener,noreferrer');
                  }}
                  className="rounded-md border border-border p-1.5 text-muted hover:border-primary/40 hover:text-primary transition-colors"
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="rounded-md border border-border p-1.5 text-muted hover:border-danger/40 hover:text-danger transition-colors"
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

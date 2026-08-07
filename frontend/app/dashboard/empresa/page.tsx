'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderOpen } from 'lucide-react'

import SelectField from '@/components/SelectField'
import PanelClavesApi from '@/components/empresa/PanelClavesApi'
import PanelEquipo, { EtiquetaRol } from '@/components/empresa/PanelEquipo'
import SelectorAvatar from '@/components/empresa/SelectorAvatar'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresas } from '@/lib/queries'

interface Empresa {
  id: string
  rut_empresa: string
  nombre_empresa: string
  rol: string
}

export default function EmpresaPage() {
  const { user } = useAuth()
  // Sólo el id: la empresa seleccionada se DERIVA de la lista. Guardar el objeto
  // en estado obligaba a un efecto para elegir el primero al cargar, y ese
  // efecto se quedaba con una copia vieja tras cualquier cambio.
  const [idElegida, setIdElegida] = useState<string | null>(null)

  const consulta = useEmpresas()
  const datos = consulta.data as unknown
  const empresas: Empresa[] = Array.isArray(datos)
    ? (datos as Empresa[])
    : ((datos as { data?: Empresa[] })?.data ?? [])

  const seleccionada =
    empresas.find((e) => e.id === idElegida) ?? empresas[0] ?? null
  const puedeGestionar = seleccionada?.rol === 'owner' || seleccionada?.rol === 'admin'

  if (consulta.isPending) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="animate-pulse h-8 bg-border rounded w-40" />
        <div className="animate-pulse h-48 bg-background rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title mb-1">Mi Empresa</h1>
          <p className="text-sm text-muted">Gestiona el equipo de tu empresa</p>
        </div>
        <Link
          href="/dashboard/documentos"
          className="btn-secondary gap-2 text-sm hidden sm:inline-flex"
        >
          <FolderOpen size={15} />
          Documentos
        </Link>
      </div>

      <SelectorAvatar nombre={user?.full_name} usuario={user?.username} />

      {empresas.length > 1 && (
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted mb-1">Empresa</label>
          <SelectField
            value={seleccionada?.id ?? ''}
            onChange={setIdElegida}
            options={empresas.map((em) => ({ value: em.id, label: em.nombre_empresa }))}
          />
        </div>
      )}

      {seleccionada && (
        <>
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-text">{seleccionada.nombre_empresa}</h2>
                <p className="text-sm text-muted mt-0.5">{seleccionada.rut_empresa}</p>
              </div>
              <EtiquetaRol rol={seleccionada.rol} />
            </div>
          </div>

          {/* La `key` reinicia el estado local al cambiar de empresa: un correo
              a medio escribir para una no debe quedarse en el formulario de
              otra, donde se enviaría a la equivocada. */}
          <PanelEquipo
            key={seleccionada.id}
            empresaId={seleccionada.id}
            puedeGestionar={puedeGestionar}
            idUsuario={user?.id}
          />

          <PanelClavesApi
            key={`claves-${seleccionada.id}`}
            empresaId={seleccionada.id}
            puedeGestionar={puedeGestionar}
          />
        </>
      )}

      {empresas.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">No tienes empresas registradas.</p>
          <Link href="/onboarding" className="text-primary text-sm hover:underline mt-2 block">
            Registrar empresa →
          </Link>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { UserPlus, Trash2, Shield, Eye, Crown } from 'lucide-react'

interface Empresa {
  id: string
  rut_empresa: string
  nombre_empresa: string
  rol: string
}

interface Miembro {
  user_id: number
  email: string
  full_name: string | null
  rol: string
  joined_at: string
}

const ROL_CONFIG: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  owner:  { label: 'Owner',  Icon: Crown,  cls: 'text-gold bg-gold/10'       },
  admin:  { label: 'Admin',  Icon: Shield, cls: 'text-info bg-info/10'        },
  viewer: { label: 'Viewer', Icon: Eye,    cls: 'text-muted bg-border'        },
}

export default function EmpresaPage() {
  const { user } = useAuth()
  const [empresas, setEmpresas]         = useState<Empresa[]>([])
  const [selected, setSelected]         = useState<Empresa | null>(null)
  const [miembros, setMiembros]         = useState<Miembro[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadingM, setLoadingM]         = useState(false)
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRol, setInviteRol]       = useState<'admin' | 'viewer'>('viewer')
  const [inviting, setInviting]         = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState<string | null>(null)

  const canManage = selected?.rol === 'owner' || selected?.rol === 'admin'

  useEffect(() => {
    apiClient
      .getEmpresas()
      .then((data: any) => {
        const list: Empresa[] = Array.isArray(data) ? data : (data?.data ?? [])
        setEmpresas(list)
        if (list.length > 0) setSelected(list[0])
      })
      .finally(() => setLoading(false))
  }, [])

  const loadMiembros = useCallback(() => {
    if (!selected) return
    setLoadingM(true)
    apiClient
      .getEmpresaMembers(selected.id)
      .then((data: any) => setMiembros(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => setMiembros([]))
      .finally(() => setLoadingM(false))
  }, [selected])

  useEffect(() => { loadMiembros() }, [loadMiembros])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !inviteEmail.trim()) return
    setInviting(true); setError(null)
    try {
      await apiClient.addEmpresaMember(selected.id, inviteEmail.trim(), inviteRol)
      setSuccess(`${inviteEmail.trim()} añadido como ${inviteRol}`)
      setInviteEmail('')
      loadMiembros()
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo añadir el miembro')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(m: Miembro) {
    if (!selected) return
    if (!confirm(`¿Eliminar a ${m.email} del equipo?`)) return
    try {
      await apiClient.removeEmpresaMember(selected.id, m.user_id)
      loadMiembros()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo eliminar el miembro')
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="animate-pulse h-8 bg-border rounded w-40" />
        <div className="animate-pulse h-48 bg-background rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-text mb-1">Mi Empresa</h1>
      <p className="text-sm text-muted mb-6">Gestiona el equipo de tu empresa</p>

      {empresas.length > 1 && (
        <div className="mb-5">
          <label className="block text-xs font-medium text-muted mb-1">Empresa</label>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => {
              const found = empresas.find((em) => em.id === e.target.value) ?? null
              setSelected(found)
            }}
            className="input-field w-full"
          >
            {empresas.map((em) => (
              <option key={em.id} value={em.id}>{em.nombre_empresa}</option>
            ))}
          </select>
        </div>
      )}

      {selected && (
        <>
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-text">{selected.nombre_empresa}</h2>
                <p className="text-sm text-muted mt-0.5">{selected.rut_empresa}</p>
              </div>
              {(() => {
                const r = ROL_CONFIG[selected.rol] ?? ROL_CONFIG.viewer
                return (
                  <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${r.cls}`}>
                    <r.Icon className="w-3 h-3" /> {r.label}
                  </span>
                )
              })()}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
            <h3 className="text-sm font-semibold text-text mb-4">
              Equipo ({miembros.length}{' '}
              {miembros.length === 1 ? 'miembro' : 'miembros'})
            </h3>

            {loadingM ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse h-12 bg-background rounded-xl" />
                ))}
              </div>
            ) : miembros.length === 0 ? (
              <p className="text-sm text-muted">Sin miembros registrados.</p>
            ) : (
              <div className="divide-y divide-border">
                {miembros.map((m) => {
                  const r = ROL_CONFIG[m.rol] ?? ROL_CONFIG.viewer
                  const isMe = m.user_id === user?.id
                  return (
                    <div key={m.user_id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-info">
                            {(m.full_name ?? m.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text leading-tight">
                            {m.full_name ?? m.email}
                            {isMe && (
                              <span className="ml-1 text-xs font-normal text-muted">(tú)</span>
                            )}
                          </p>
                          {m.full_name && (
                            <p className="text-xs text-muted">{m.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${r.cls}`}>
                          <r.Icon className="w-3 h-3" /> {r.label}
                        </span>
                        {canManage && m.rol !== 'owner' && !isMe && (
                          <button
                            onClick={() => handleRemove(m)}
                            className="p-1 text-subtle hover:text-danger transition-colors"
                            title="Eliminar miembro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {canManage ? (
            <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="w-4 h-4 text-muted" />
                <h3 className="text-sm font-semibold text-text">Añadir miembro</h3>
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger mb-4">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-sm text-accent mb-4">
                  ✓ {success}
                </div>
              )}

              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Email del usuario
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="usuario@empresa.cl"
                    required
                    className="input-field w-full"
                  />
                  <p className="text-xs text-muted mt-1">
                    El usuario debe tener una cuenta en TORDO.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Rol</label>
                  <select
                    value={inviteRol}
                    onChange={(e) => setInviteRol(e.target.value as 'admin' | 'viewer')}
                    className="input-field w-full"
                  >
                    <option value="viewer">Viewer — solo puede leer</option>
                    <option value="admin">Admin — puede editar y añadir miembros</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? 'Añadiendo…' : 'Añadir miembro'}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-4">
              Solo el owner o admin puede gestionar miembros.
            </p>
          )}
        </>
      )}

      {!loading && empresas.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">No tienes empresas registradas.</p>
          <a href="/onboarding" className="text-primary text-sm hover:underline mt-2 block">
            Registrar empresa →
          </a>
        </div>
      )}
    </div>
  )
}

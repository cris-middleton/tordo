'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle } from 'lucide-react'

interface PostulacionItem {
  id: string
  estado: string
  licitacion: {
    codigo_externo: string
    nombre: string
    fecha_cierre: string | null
  }
  checklist: Array<{ completado: boolean; es_obligatorio: boolean }>
}

/** Build a Mon-based calendar grid. Null cells = padding before month start. */
function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const cells: (Date | null)[] = []
  // Convert Sunday-based (0) to Monday-based (0): Mon=0 … Sun=6
  const offset = (firstDay.getDay() + 6) % 7
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T12:00:00')
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

function dotColor(days: number): string {
  if (days < 0)  return 'bg-gray-400'
  if (days <= 1) return 'bg-red-500'
  if (days <= 3) return 'bg-orange-500'
  if (days <= 7) return 'bg-amber-400'
  return 'bg-blue-400'
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const ACTIVE_ESTADOS = new Set(['en_seguimiento', 'en_preparacion'])

export default function CalendarioPage() {
  const { user } = useAuth()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [postulaciones, setPostulaciones] = useState<PostulacionItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const empresas: Array<{ id: string }> = await apiClient.getEmpresas()
      const results = await Promise.allSettled(
        empresas.map((e) =>
          apiClient.getPostulaciones(e.id).then((r: PostulacionItem[]) => r)
        )
      )
      const flat: PostulacionItem[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') flat.push(...r.value)
      }
      setPostulaciones(flat.filter((p) => ACTIVE_ESTADOS.has(p.estado)))
    } catch {
      setPostulaciones([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Build date → items map
  const byDate: Record<string, PostulacionItem[]> = {}
  for (const p of postulaciones) {
    if (!p.licitacion?.fecha_cierre) continue
    const key = p.licitacion.fecha_cierre.split('T')[0]
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(p)
  }

  const cells = buildCalendarGrid(year, month)
  const todayStr = isoDate(today)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const selectedItems = selectedDate ? (byDate[selectedDate] ?? []) : []

  // Next 30 days, sorted by urgency
  const upcoming = postulaciones
    .filter((p) => p.licitacion?.fecha_cierre)
    .map((p) => ({
      ...p,
      days: daysUntil(p.licitacion.fecha_cierre!.split('T')[0]),
    }))
    .filter((p) => p.days >= 0 && p.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 10)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Calendario de Plazos</h1>
      <p className="text-sm text-gray-500 mb-6">
        Fechas de cierre de tus postulaciones activas
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Calendar ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="font-semibold text-gray-800">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} />
              const key = isoDate(day)
              const items = byDate[key] ?? []
              const isToday = key === todayStr
              const isSelected = key === selectedDate
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                  className={`relative flex flex-col items-center py-1.5 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday
                      ? 'bg-blue-50 font-bold text-blue-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-sm leading-none">{day.getDate()}</span>
                  {items.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {items.slice(0, 4).map((item, di) => (
                        <span
                          key={di}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? 'bg-white'
                              : dotColor(
                                  daysUntil(item.licitacion.fecha_cierre!.split('T')[0])
                                )
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            {[
              { color: 'bg-red-500',    label: 'Hoy / mañana' },
              { color: 'bg-orange-500', label: '2–3 días' },
              { color: 'bg-amber-400',  label: '4–7 días' },
              { color: 'bg-blue-400',   label: '8+ días' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="space-y-4">

          {/* Selected day detail */}
          {selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              {selectedItems.length === 0 ? (
                <p className="text-sm text-gray-400">Sin vencimientos este día.</p>
              ) : (
                <div className="space-y-3">
                  {selectedItems.map((item) => {
                    const done  = item.checklist.filter((c) => c.completado && c.es_obligatorio).length
                    const total = item.checklist.filter((c) => c.es_obligatorio).length
                    return (
                      <a
                        key={item.id}
                        href={`/dashboard/tenders/${item.licitacion.codigo_externo}`}
                        className="block border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-800 leading-tight line-clamp-2">
                          {item.licitacion.nombre}
                        </p>
                        {total > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Checklist</span>
                              <span>{done}/{total}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  done === total ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming deadlines */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-500" />
              <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                Próximos 30 días
              </p>
            </div>

            {loading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-gray-100 h-12 rounded-lg" />
                ))}
              </div>
            )}

            {!loading && upcoming.length === 0 && (
              <p className="text-sm text-gray-400">Sin postulaciones activas próximas.</p>
            )}

            {!loading &&
              upcoming.map((item) => (
                <a
                  key={item.id}
                  href={`/dashboard/tenders/${item.licitacion.codigo_externo}`}
                  className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors"
                >
                  <div
                    className={`w-1.5 h-8 rounded-full flex-shrink-0 ${dotColor(item.days)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {item.licitacion.nombre}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.days === 0
                        ? 'Hoy'
                        : item.days === 1
                        ? 'Mañana'
                        : `En ${item.days} días`}
                    </p>
                  </div>
                  {item.days <= 1 && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  )}
                </a>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

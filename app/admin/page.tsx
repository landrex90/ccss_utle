import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

interface CampanaSummary {
  campana_id: string | null
  total: number
  pendiente: number
  activo: number
  no_autorizo: number
  no_verificado: number
  info_incorrecta: number
  depurado: number
  otro: number
}

async function getCampanaSummary(): Promise<CampanaSummary[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('registros')
    .select('campana_id, estado')

  if (error || !data) return []

  const map = new Map<string, CampanaSummary>()

  for (const row of data) {
    const key = row.campana_id ?? '(sin campaña)'
    if (!map.has(key)) {
      map.set(key, {
        campana_id: key,
        total: 0,
        pendiente: 0,
        activo: 0,
        no_autorizo: 0,
        no_verificado: 0,
        info_incorrecta: 0,
        depurado: 0,
        otro: 0,
      })
    }
    const entry = map.get(key)!
    entry.total++

    const estado = (row.estado ?? '').toUpperCase()
    if (estado === 'PENDIENTE') entry.pendiente++
    else if (estado === 'ACTIVO') entry.activo++
    else if (estado === 'NO_AUTORIZO') entry.no_autorizo++
    else if (estado === 'NO_VERIFICADO') entry.no_verificado++
    else if (estado === 'INFO_INCORRECTA') entry.info_incorrecta++
    else if (estado.startsWith('DEPURADO')) entry.depurado++
    else entry.otro++
  }

  return Array.from(map.values()).sort((a, b) =>
    (b.campana_id ?? '').localeCompare(a.campana_id ?? '')
  )
}

export default async function AdminDashboard() {
  const campanaSummary = await getCampanaSummary()

  const totals = campanaSummary.reduce(
    (acc, c) => {
      acc.total += c.total
      acc.pendiente += c.pendiente
      acc.activo += c.activo
      acc.no_autorizo += c.no_autorizo
      acc.depurado += c.depurado
      return acc
    },
    { total: 0, pendiente: 0, activo: 0, no_autorizo: 0, depurado: 0 }
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen general de campañas activas</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total pacientes" value={totals.total} color="blue" />
        <StatCard label="Pendientes" value={totals.pendiente} color="yellow" />
        <StatCard label="Activos" value={totals.activo} color="green" />
        <StatCard label="Depurados" value={totals.depurado} color="gray" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <QuickAction href="/admin/importar" label="Importar pacientes" icon="↑" />
        <QuickAction href="/admin/resultados" label="Importar resultados" icon="↻" />
        <QuickAction href="/admin/campanas" label="Ver campañas" icon="☰" />
      </div>

      {/* Campaign table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-700">Por campaña</h2>
        </div>
        {campanaSummary.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No hay registros aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Campaña</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-4 py-3 font-medium">Pendiente</th>
                  <th className="text-right px-4 py-3 font-medium">Activo</th>
                  <th className="text-right px-4 py-3 font-medium">No autorizó</th>
                  <th className="text-right px-4 py-3 font-medium">No verificado</th>
                  <th className="text-right px-4 py-3 font-medium">Info incorrecta</th>
                  <th className="text-right px-4 py-3 font-medium">Depurado</th>
                  <th className="text-right px-4 py-3 font-medium">Otro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campanaSummary.map(c => (
                  <tr key={c.campana_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">
                      {c.campana_id}
                    </td>
                    <td className="text-right px-4 py-3 font-medium text-gray-800">{c.total}</td>
                    <td className="text-right px-4 py-3 text-yellow-700">{c.pendiente || '—'}</td>
                    <td className="text-right px-4 py-3 text-green-700">{c.activo || '—'}</td>
                    <td className="text-right px-4 py-3 text-gray-500">{c.no_autorizo || '—'}</td>
                    <td className="text-right px-4 py-3 text-gray-500">{c.no_verificado || '—'}</td>
                    <td className="text-right px-4 py-3 text-gray-500">{c.info_incorrecta || '—'}</td>
                    <td className="text-right px-4 py-3 text-gray-500">{c.depurado || '—'}</td>
                    <td className="text-right px-4 py-3 text-gray-400">{c.otro || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'blue' | 'yellow' | 'green' | 'gray'
}) {
  const colorClass = {
    blue: 'text-[#005d8f]',
    yellow: 'text-yellow-600',
    green: 'text-green-600',
    gray: 'text-gray-500',
  }[color]

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorClass}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4 flex items-center gap-3 hover:border-[#005d8f] hover:shadow-md transition-all group"
    >
      <span className="text-2xl text-[#005d8f] group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </Link>
  )
}

import { createClient } from '@/lib/supabase/server'

interface RegistroRow {
  campana_id: string | null
  estado: string | null
}

interface CampanaStats {
  campana_id: string
  total: number
  byEstado: Record<string, number>
}

async function getCampanasData(): Promise<CampanaStats[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('registros')
    .select('campana_id, estado')
    .order('campana_id', { ascending: false })

  if (error || !data) return []

  const map = new Map<string, CampanaStats>()

  for (const row of data as RegistroRow[]) {
    const key = row.campana_id ?? '(sin campaña)'
    if (!map.has(key)) {
      map.set(key, { campana_id: key, total: 0, byEstado: {} })
    }
    const entry = map.get(key)!
    entry.total++
    const estado = row.estado ?? 'PENDIENTE'
    entry.byEstado[estado] = (entry.byEstado[estado] ?? 0) + 1
  }

  return Array.from(map.values())
}

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE:              'hc-badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  ACTIVO:                 'hc-badge bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  NO_AUTORIZO:            'hc-badge bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  NO_VERIFICADO:          'hc-badge bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  INFO_INCORRECTA:        'hc-badge bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  DEPURADO_YA_ATENDIDO:   'hc-badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DEPURADO_YA_PROGRAMADO: 'hc-badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DEPURADO_RENUNCIA:      'hc-badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  NO_ASEGURADO:           'hc-badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default async function CampanasPage() {
  const campanas = await getCampanasData()

  const allEstados = Array.from(
    new Set(campanas.flatMap(c => Object.keys(c.byEstado)))
  ).sort()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Campañas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {campanas.length} campaña{campanas.length !== 1 ? 's' : ''} encontrada
          {campanas.length !== 1 ? 's' : ''}
        </p>
      </div>

      {campanas.length === 0 ? (
        <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 px-5 py-12 text-center">
          <p className="text-gray-400 dark:text-gray-500">No hay campañas registradas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campanas.map(campana => (
            <div
              key={campana.campana_id}
              className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="font-mono text-sm font-medium text-gray-800 dark:text-gray-100">
                    {campana.campana_id}
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{campana.total} pacientes</p>
                </div>
                <div className="text-2xl font-bold text-[#004B83] dark:text-[#0066aa]">{campana.total}</div>
              </div>

              <div className="px-5 py-3 flex flex-wrap gap-2">
                {Object.entries(campana.byEstado)
                  .sort((a, b) => b[1] - a[1])
                  .map(([estado, count]) => (
                    <span
                      key={estado}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        ESTADO_COLORS[estado] ?? 'hc-badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {estado}
                      <span className="font-bold">{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full breakdown table */}
      {campanas.length > 0 && allEstados.length > 0 && (
        <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-medium text-gray-700 dark:text-gray-200">Tabla comparativa</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Campaña</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  {allEstados.map(e => (
                    <th key={e} className="text-right px-4 py-3 font-medium whitespace-nowrap">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {campanas.map(c => (
                  <tr key={c.campana_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{c.campana_id}</td>
                    <td className="text-right px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{c.total}</td>
                    {allEstados.map(e => (
                      <td key={e} className="text-right px-4 py-3 text-gray-600 dark:text-gray-400">
                        {c.byEstado[e] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

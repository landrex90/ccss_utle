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
  PENDIENTE:              'bg-yellow-100 text-yellow-800',
  ACTIVO:                 'bg-green-100 text-green-800',
  NO_AUTORIZO:            'bg-gray-100 text-gray-700',
  NO_VERIFICADO:          'bg-gray-100 text-gray-700',
  INFO_INCORRECTA:        'bg-orange-100 text-orange-700',
  DEPURADO_YA_ATENDIDO:   'bg-blue-100 text-blue-700',
  DEPURADO_YA_PROGRAMADO: 'bg-blue-100 text-blue-700',
  DEPURADO_RENUNCIA:      'bg-blue-100 text-blue-700',
  NO_ASEGURADO:           'bg-red-100 text-red-700',
}

export default async function CampanasPage() {
  const campanas = await getCampanasData()

  // Collect all unique estados for the header row
  const allEstados = Array.from(
    new Set(campanas.flatMap(c => Object.keys(c.byEstado)))
  ).sort()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Campañas</h1>
        <p className="text-sm text-gray-500 mt-1">
          {campanas.length} campaña{campanas.length !== 1 ? 's' : ''} encontrada
          {campanas.length !== 1 ? 's' : ''}
        </p>
      </div>

      {campanas.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-12 text-center">
          <p className="text-gray-400">No hay campañas registradas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campanas.map(campana => (
            <div
              key={campana.campana_id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-mono text-sm font-medium text-gray-800">
                    {campana.campana_id}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">{campana.total} pacientes</p>
                </div>
                <div className="text-2xl font-bold text-[#005d8f]">{campana.total}</div>
              </div>

              <div className="px-5 py-3 flex flex-wrap gap-2">
                {Object.entries(campana.byEstado)
                  .sort((a, b) => b[1] - a[1])
                  .map(([estado, count]) => (
                    <span
                      key={estado}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        ESTADO_COLORS[estado] ?? 'bg-gray-100 text-gray-600'
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-medium text-gray-700">Tabla comparativa</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Campaña</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  {allEstados.map(e => (
                    <th key={e} className="text-right px-4 py-3 font-medium whitespace-nowrap">
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campanas.map(c => (
                  <tr key={c.campana_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{c.campana_id}</td>
                    <td className="text-right px-4 py-3 font-medium text-gray-800">{c.total}</td>
                    {allEstados.map(e => (
                      <td key={e} className="text-right px-4 py-3 text-gray-600">
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

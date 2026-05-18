'use client'

import { useState, FormEvent } from 'react'

interface ImportSummary {
  actualizados: number
  noEncontrados: number
  errores: number
  total: number
  detalles: string[]
}

export default function ResultadosPage() {
  const [file, setFile] = useState<File | null>(null)
  const [canal, setCanal] = useState<'whatsapp' | 'llamada'>('whatsapp')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setResult(null)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('canal', canal)

    try {
      const res = await fetch('/api/admin/import-results', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error desconocido')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Importar resultados de canal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carga los resultados de WhatsApp o llamada para actualizar el estado de los registros.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Canal selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Canal</label>
            <div className="flex gap-4">
              {(['whatsapp', 'llamada'] as const).map(c => (
                <label key={c} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="canal"
                    value={c}
                    checked={canal === c}
                    onChange={() => setCanal(c)}
                    className="accent-[#005d8f]"
                  />
                  <span className="text-sm text-gray-700 capitalize">{c}</span>
                </label>
              ))}
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Archivo CSV <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              required
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#e6f2f8] file:text-[#005d8f] hover:file:bg-[#c8e3f0] cursor-pointer"
            />
            <p className="text-xs text-gray-400 mt-1">
              Columnas requeridas: id_registro (o telefono), estado_canal
              (completado | no_respondio | fallido)
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !file}
            className="bg-[#005d8f] hover:bg-[#004268] text-white font-medium py-2 px-6 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Procesando…' : 'Importar resultados'}
          </button>
        </form>
      </div>

      {/* Result summary */}
      {result && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-medium text-gray-700">Resumen</h2>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-4 gap-4 text-sm mb-4">
              <div>
                <p className="text-gray-500">Total filas</p>
                <p className="font-semibold text-gray-800">{result.total}</p>
              </div>
              <div>
                <p className="text-gray-500">Actualizados</p>
                <p className="font-semibold text-green-700">{result.actualizados}</p>
              </div>
              <div>
                <p className="text-gray-500">No encontrados</p>
                <p className="font-semibold text-yellow-700">{result.noEncontrados}</p>
              </div>
              <div>
                <p className="text-gray-500">Errores</p>
                <p className="font-semibold text-red-700">{result.errores}</p>
              </div>
            </div>

            {result.detalles.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  Detalles
                </p>
                <div className="bg-gray-50 rounded p-3 h-48 overflow-y-auto font-mono text-xs text-gray-600 space-y-0.5">
                  {result.detalles.map((d, i) => (
                    <div key={i}>{d}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

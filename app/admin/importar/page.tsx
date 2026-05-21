'use client'

import { useState, useRef, FormEvent } from 'react'

interface LogEntry {
  row?: number
  id?: string
  url?: string
  correo?: string | null
  telefono?: string | null
  ok?: boolean
  error?: string
  done?: boolean
  summary?: {
    insertados: number
    invalidos: number
    errores: number
    total: number
  }
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [baseUrl, setBaseUrl] = useState('https://ccss-utle-preprod.netlify.app')
  const [campanaId, setCampanaId] = useState('')
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [summary, setSummary] = useState<LogEntry['summary'] | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  function appendLog(entry: LogEntry) {
    setLog(prev => [...prev, entry])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setLog([])
    setSummary(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('baseUrl', baseUrl)
    if (campanaId.trim()) formData.append('campanaId', campanaId.trim())

    try {
      const res = await fetch('/api/admin/import-patients', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        appendLog({ ok: false, error: err.error ?? 'Error desconocido' })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const entry: LogEntry = JSON.parse(line)
            if (entry.done && entry.summary) {
              setSummary(entry.summary)
            } else {
              appendLog(entry)
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      appendLog({ ok: false, error: String(err) })
    } finally {
      setLoading(false)
    }
  }

  const successCount = log.filter(e => e.ok).length
  const errorCount = log.filter(e => e.ok === false).length

  function downloadCsv() {
    const rows = log.filter(e => e.ok && e.id && e.url)
    const lines = ['id_registro,telefono,correo,url']
    for (const e of rows) {
      const phone = e.telefono ?? ''
      const email = e.correo ?? ''
      lines.push(`${e.id},${phone},"${email}","${e.url}"`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `pacientes_urls_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Importar pacientes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Carga un CSV con datos de pacientes y genera sus URLs personalizadas.
        </p>
      </div>

      <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Archivo CSV <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              required
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 dark:text-gray-300
                         file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0
                         file:text-sm file:font-medium file:bg-[#e6f2f8] file:text-[#004B83]
                         dark:file:bg-gray-700 dark:file:text-blue-300
                         hover:file:bg-[#c8e3f0] dark:hover:file:bg-gray-600 cursor-pointer"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Columnas requeridas: nombre_paciente, numero_asegurado, correo, centro_medico,
              tipo_atencion, ultimos_4_asegurado
            </p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">URL base</label>
            <input
              type="url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="hc-input w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-[#004B83] dark:focus:ring-[#0066aa]"
              placeholder="https://ccss-utle-preprod.netlify.app"
            />
          </div>

          {/* Campaign ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              ID de campaña <span className="text-gray-400 dark:text-gray-500">(opcional)</span>
            </label>
            <input
              type="text"
              value={campanaId}
              onChange={e => setCampanaId(e.target.value)}
              className="hc-input w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-[#004B83] dark:focus:ring-[#0066aa]"
              placeholder="ej: 2026-05-01_HospMexico"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !file}
            className="bg-[#004B83] hover:bg-[#003668] text-white font-medium py-2 px-6 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Importando…' : 'Iniciar importación'}
          </button>
        </form>
      </div>

      {/* Progress log */}
      {(log.length > 0 || loading) && (
        <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-medium text-gray-700 dark:text-gray-200">Registro de importación</h2>
            <div className="flex gap-3 text-xs">
              <span className="text-green-600 dark:text-green-400 font-medium">{successCount} OK</span>
              {errorCount > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">{errorCount} errores</span>
              )}
            </div>
          </div>

          <div className="hc-code h-72 overflow-y-auto font-mono text-xs p-4 bg-gray-50 dark:bg-gray-900 space-y-0.5">
            {log.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2 ${entry.ok === false ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <span className="text-gray-400 dark:text-gray-500 select-none w-10 flex-shrink-0">
                  {entry.row ? `r${entry.row}` : ''}
                </span>
                {entry.ok ? (
                  <span>
                    <span className="text-green-600 dark:text-green-400">✓</span>{' '}
                    <span className="text-[#004B83] dark:text-[#0066aa]">[{entry.id}]</span>{' '}
                    <span className="text-gray-500 dark:text-gray-400 break-all">{entry.url}</span>
                  </span>
                ) : (
                  <span>
                    <span className="text-red-500 dark:text-red-400">✗</span>{' '}
                    {entry.id && <span className="text-gray-700 dark:text-gray-300">[{entry.id}]</span>}{' '}
                    {entry.error}
                  </span>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-gray-400 dark:text-gray-500 animate-pulse">procesando…</div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="hc-surface bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-green-800 dark:text-green-300">Importación completada</h3>
            {successCount > 0 && (
              <button
                onClick={downloadCsv}
                className="flex items-center gap-1.5 text-xs font-medium bg-[#004B83] hover:bg-[#003668] text-white px-3 py-1.5 rounded-md transition-colors"
              >
                ↓ Descargar CSV de URLs ({successCount})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Total filas</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{summary.total}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Insertados</p>
              <p className="font-semibold text-green-700 dark:text-green-400">{summary.insertados}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Inválidos</p>
              <p className="font-semibold text-yellow-700 dark:text-yellow-400">{summary.invalidos}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Errores BD</p>
              <p className="font-semibold text-red-700 dark:text-red-400">{summary.errores}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

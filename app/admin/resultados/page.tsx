'use client'

import { useState, FormEvent, useRef } from 'react'

// ── Infobip import (streaming) ────────────────────────────────────────────────
interface InfobobipLine {
  row?: number; ok?: boolean; motivo?: string; id?: string
  estado_canal?: string; warning?: string; cedula?: string; tel?: string; error?: string
  done?: boolean
  summary?: { actualizados: number; noEncontrados: number; omitidos: number; errores: number; total: number; canal: string }
}

// ── Internal CSV import (legacy) ──────────────────────────────────────────────
interface ImportSummary {
  actualizados: number; noEncontrados: number; errores: number; total: number; detalles: string[]
}

export default function ResultadosPage() {
  // ── Infobip state ──────────────────────────────────────────────────────────
  const [ibFile, setIbFile]       = useState<File | null>(null)
  const [ibLoading, setIbLoading] = useState(false)
  const [ibLines, setIbLines]     = useState<InfobobipLine[]>([])
  const [ibSummary, setIbSummary] = useState<InfobobipLine['summary'] | null>(null)
  const [ibError, setIbError]     = useState('')
  const ibLogRef = useRef<HTMLDivElement>(null)

  // ── Internal CSV state ─────────────────────────────────────────────────────
  const [csvFile, setCsvFile]     = useState<File | null>(null)
  const [canal, setCanal]         = useState<'whatsapp' | 'llamada'>('whatsapp')
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvResult, setCsvResult] = useState<ImportSummary | null>(null)
  const [csvError, setCsvError]   = useState('')

  // ── Infobip submit ─────────────────────────────────────────────────────────
  async function handleInfobip(e: FormEvent) {
    e.preventDefault()
    if (!ibFile) return
    setIbLoading(true)
    setIbLines([])
    setIbSummary(null)
    setIbError('')

    const fd = new FormData()
    fd.append('file', ibFile)

    try {
      const res = await fetch('/api/admin/import-infobip', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json()
        setIbError(d.error ?? 'Error desconocido')
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.trim()) continue
          try {
            const line: InfobobipLine = JSON.parse(part)
            if (line.done && line.summary) {
              setIbSummary(line.summary)
            } else {
              setIbLines(prev => [...prev, line])
              setTimeout(() => ibLogRef.current?.scrollTo(0, ibLogRef.current.scrollHeight), 0)
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      setIbError(String(err))
    } finally {
      setIbLoading(false)
    }
  }

  // ── Internal CSV submit ────────────────────────────────────────────────────
  async function handleCsv(e: FormEvent) {
    e.preventDefault()
    if (!csvFile) return
    setCsvLoading(true)
    setCsvResult(null)
    setCsvError('')

    const fd = new FormData()
    fd.append('file', csvFile)
    fd.append('canal', canal)

    try {
      const res  = await fetch('/api/admin/import-results', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) setCsvError(data.error ?? 'Error desconocido')
      else setCsvResult(data)
    } catch (err) {
      setCsvError(String(err))
    } finally {
      setCsvLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Importar resultados de canal</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Carga los archivos exportados desde Infobip para actualizar el estado de los registros.
        </p>
      </div>

      {/* ── Sección Infobip ──────────────────────────────────────────────── */}
      <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Importar desde Infobip
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
          <span className="font-medium">.xlsx</span> → resultados WhatsApp &nbsp;·&nbsp;
          <span className="font-medium">.csv</span> → resultados IVR (voz)
        </p>

        <form onSubmit={handleInfobip} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Archivo Infobip <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.csv"
              required
              onChange={e => setIbFile(e.target.files?.[0] ?? null)}
              className="hc-input block w-full text-sm text-gray-600 dark:text-gray-300
                         file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0
                         file:text-sm file:font-medium file:bg-[#e6f2f8] file:text-[#004B83]
                         dark:file:bg-gray-700 dark:file:text-blue-300
                         hover:file:bg-[#c8e3f0] dark:hover:file:bg-gray-600 cursor-pointer"
            />
          </div>

          {ibError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              {ibError}
            </p>
          )}

          <button
            type="submit"
            disabled={ibLoading || !ibFile}
            className="bg-[#004B83] hover:bg-[#003668] text-white font-medium py-2 px-6 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ibLoading ? 'Procesando…' : 'Importar Infobip'}
          </button>
        </form>

        {/* Live log */}
        {(ibLines.length > 0 || ibLoading) && (
          <div className="mt-5 space-y-3">
            <div
              ref={ibLogRef}
              className="hc-code bg-gray-50 dark:bg-gray-900 rounded p-3 h-48 overflow-y-auto font-mono text-xs text-gray-600 dark:text-gray-300 space-y-0.5"
            >
              {ibLines.map((l, i) => (
                <div key={i} className={l.ok === false ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                  {l.ok === true  && `✓ fila ${l.row} [${l.id}] → ${l.estado_canal}${l.warning ? ` ⚠ ${l.warning}` : ''}`}
                  {l.ok === false && `⚠ fila ${l.row}: ${l.motivo}${l.id ? ` [${l.id}]` : ''}${l.cedula ? ` ced:${l.cedula}` : ''}${l.tel ? ` tel:${l.tel}` : ''}${l.error ? ` — ${l.error}` : ''}`}
                </div>
              ))}
              {ibLoading && <div className="text-gray-400 animate-pulse">…</div>}
            </div>

            {ibSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Canal</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-100 capitalize">{ibSummary.canal}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Total filas</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{ibSummary.total}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Actualizados</p>
                  <p className="font-semibold text-green-700 dark:text-green-400">{ibSummary.actualizados}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">No encontrados</p>
                  <p className="font-semibold text-yellow-700 dark:text-yellow-400">{ibSummary.noEncontrados}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Errores BD</p>
                  <p className="font-semibold text-red-700 dark:text-red-400">{ibSummary.errores}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sección CSV interno (legacy) ─────────────────────────────────── */}
      <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Importar CSV interno
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
          Formato propio con columna <code>estado_canal</code>. Columnas: id_registro (o telefono), estado_canal, enviado_at, respondio_at…
        </p>

        <form onSubmit={handleCsv} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Canal</label>
            <div className="flex gap-4">
              {(['whatsapp', 'llamada'] as const).map(c => (
                <label key={c} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="canal" value={c}
                    checked={canal === c}
                    onChange={() => setCanal(c)}
                    className="accent-[#004B83]"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Archivo CSV <span className="text-red-500">*</span>
            </label>
            <input
              type="file" accept=".csv,text/csv" required
              onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
              className="hc-input block w-full text-sm text-gray-600 dark:text-gray-300
                         file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0
                         file:text-sm file:font-medium file:bg-[#e6f2f8] file:text-[#004B83]
                         dark:file:bg-gray-700 dark:file:text-blue-300
                         hover:file:bg-[#c8e3f0] dark:hover:file:bg-gray-600 cursor-pointer"
            />
          </div>

          {csvError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              {csvError}
            </p>
          )}

          <button
            type="submit"
            disabled={csvLoading || !csvFile}
            className="bg-[#004B83] hover:bg-[#003668] text-white font-medium py-2 px-6 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {csvLoading ? 'Procesando…' : 'Importar CSV'}
          </button>
        </form>

        {csvResult && (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500 dark:text-gray-400">Total</p><p className="font-semibold">{csvResult.total}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400">Actualizados</p><p className="font-semibold text-green-700 dark:text-green-400">{csvResult.actualizados}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400">No encontrados</p><p className="font-semibold text-yellow-700 dark:text-yellow-400">{csvResult.noEncontrados}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400">Errores</p><p className="font-semibold text-red-700 dark:text-red-400">{csvResult.errores}</p></div>
            </div>
            {csvResult.detalles.length > 0 && (
              <div className="hc-code bg-gray-50 dark:bg-gray-900 rounded p-3 h-40 overflow-y-auto font-mono text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                {csvResult.detalles.map((d, i) => <div key={i}>{d}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

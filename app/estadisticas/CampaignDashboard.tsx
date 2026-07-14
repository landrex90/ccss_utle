'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { CampanaInfo, RespuestasStats } from './page'

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(n: number, d: number) {
  if (!d) return '—'
  return `${Math.round((n / d) * 100)}%`
}
function fmt(n: number) {
  return n.toLocaleString('es-CR')
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Sub-componentes ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: 'blue' | 'green' | 'yellow' | 'red' | 'gray' }) {
  const palette = {
    blue:   'bg-blue-50  dark:bg-blue-950/30  border-blue-200  dark:border-blue-800  text-blue-700  dark:text-blue-300',
    green:  'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    yellow: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    red:    'bg-red-50   dark:bg-red-950/30   border-red-200   dark:border-red-800   text-red-700   dark:text-red-300',
    gray:   'bg-gray-50  dark:bg-gray-800      border-gray-200  dark:border-gray-700  text-gray-700  dark:text-gray-300',
  }
  return (
    <div className={`border rounded-xl p-4 ${palette[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{typeof value === 'number' ? fmt(value) : value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  )
}

function FunnelRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-200">{label}</span>
        <span className="font-semibold text-gray-800 dark:text-gray-100">{fmt(value)} <span className="text-gray-400 font-normal">({pct(value, total)})</span></span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  campanas: CampanaInfo[]
  campanaActual: string | null
  campanaInfo: CampanaInfo | null
  respuestas: RespuestasStats
}

export default function CampaignDashboard({ campanas, campanaActual, campanaInfo, respuestas }: Props) {
  const router       = useRouter()
  const [tab, setTab]         = useState<'embudo' | 'respuestas' | 'especialidades'>('embudo')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  function selectCampana(id: string) {
    router.push(`/estadisticas?campana=${encodeURIComponent(id)}`)
  }

  async function handleExport(tipo: 'registros' | 'respuestas') {
    if (!campanaActual) return
    setExporting(true)
    setExportError('')
    try {
      const url = `/api/estadisticas/export?campana=${encodeURIComponent(campanaActual)}&tipo=${tipo}`
      const res = await fetch(url)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setExportError(d.error ?? 'Error al exportar')
        return
      }
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = `${campanaActual}_${tipo}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      setExportError('Error de conexión')
    } finally {
      setExporting(false)
    }
  }

  const c = campanaInfo

  return (
    <div className="space-y-6">

      {/* ── Header / selector ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Resultados de campaña</h1>
          {c && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Iniciada el {fmtDate(c.fecha_inicio)} · {fmt(c.total)} registros asignados
            </p>
          )}
        </div>

        {/* Selector */}
        <div className="flex flex-col items-end gap-2">
          <select
            value={campanaActual ?? ''}
            onChange={e => selectCampana(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2
                       bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-[#004B83]"
          >
            {campanas.length === 0 && <option value="">Sin campañas</option>}
            {campanas.map(c => (
              <option key={c.id} value={c.id}>{c.id}</option>
            ))}
          </select>

          {/* Botones export */}
          {campanaActual && (
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('registros')}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#004B83] text-[#004B83] dark:border-blue-400 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {exporting ? 'Exportando...' : 'Registros Excel'}
              </button>
              <button
                onClick={() => handleExport('respuestas')}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-green-600 text-green-700 dark:border-green-400 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {exporting ? 'Exportando...' : 'Respuestas Excel'}
              </button>
            </div>
          )}
          {exportError && <p className="text-xs text-red-500">{exportError}</p>}
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {c ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Asignados"   value={c.total}      color="blue"   />
          <KpiCard label="Enviados"    value={c.enviado}    sub={pct(c.enviado, c.total)}    color="blue"   />
          <KpiCard label="Abrieron"    value={c.abierto}    sub={pct(c.abierto, c.enviado)}  color="yellow" />
          <KpiCard label="Click link"  value={c.click}      sub={pct(c.click, c.abierto)}    color="yellow" />
          <KpiCard label="Completaron" value={c.completado} sub={pct(c.completado, c.enviado)} color="green" />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center text-gray-500 dark:text-gray-400">
          No hay campañas registradas aún.
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      {c && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* Tab nav */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {([
              { key: 'embudo',       label: 'Embudo de correo' },
              { key: 'respuestas',   label: 'Formulario' },
              { key: 'especialidades', label: 'Especialidades' },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'border-b-2 border-[#004B83] dark:border-blue-400 text-[#004B83] dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">

            {/* ── Tab: Embudo ── */}
            {tab === 'embudo' && (
              <div className="space-y-4">
                <FunnelRow label="Enviados"    value={c.enviado}    total={c.total}    color="#004B83" />
                <FunnelRow label="Abrieron"    value={c.abierto}    total={c.total}    color="#2563eb" />
                <FunnelRow label="Click link"  value={c.click}      total={c.total}    color="#f59e0b" />
                <FunnelRow label="Completaron" value={c.completado} total={c.total}    color="#16a34a" />
                <FunnelRow label="Sin abrir"   value={c.enviado - c.abierto} total={c.total} color="#9ca3af" />
              </div>
            )}

            {/* ── Tab: Respuestas formulario ── */}
            {tab === 'respuestas' && (
              <div className="space-y-5">
                {respuestas.total === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Sin respuestas aún.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <KpiCard label="Total respuestas"    value={respuestas.total}          color="blue"   />
                      <KpiCard label="Autorizaron"         value={respuestas.consentimiento} sub={pct(respuestas.consentimiento, respuestas.total)} color="green"  />
                      <KpiCard label="Info correcta"       value={respuestas.infoCorrecta}   sub={pct(respuestas.infoCorrecta, respuestas.consentimiento)} color="green" />
                      <KpiCard label="Quieren seguir"      value={respuestas.quiereSeguir}   sub={pct(respuestas.quiereSeguir, respuestas.consentimiento)} color="yellow" />
                    </div>

                    {/* Canal preferido */}
                    {Object.keys(respuestas.medioPref).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Canal de contacto preferido</h3>
                        <div className="space-y-2">
                          {Object.entries(respuestas.medioPref)
                            .sort((a, b) => b[1] - a[1])
                            .map(([medio, count]) => (
                              <FunnelRow key={medio} label={medio} value={count} total={respuestas.total} color="#004B83" />
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab: Especialidades ── */}
            {tab === 'especialidades' && (
              <div>
                {Object.keys(respuestas.especialidad).length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Sin datos de especialidad aún.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(respuestas.especialidad)
                      .sort((a, b) => b[1] - a[1])
                      .map(([esp, count]) => (
                        <FunnelRow key={esp} label={esp} value={count} total={respuestas.total} color="#2563eb" />
                      ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Lista de todas las campañas ────────────────────────────────────── */}
      {campanas.length > 1 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Todas las campañas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  {['Campaña', 'Fecha', 'Enviados', 'Abrieron', 'Completaron', '% Conv.'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {campanas.map(camp => (
                  <tr
                    key={camp.id}
                    onClick={() => selectCampana(camp.id)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30 ${camp.id === campanaActual ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-[#004B83] dark:text-blue-400">{camp.id}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{fmtDate(camp.fecha_inicio)}</td>
                    <td className="px-4 py-2">{fmt(camp.enviado)}</td>
                    <td className="px-4 py-2">{fmt(camp.abierto)} <span className="text-gray-400 text-xs">({pct(camp.abierto, camp.enviado)})</span></td>
                    <td className="px-4 py-2">{fmt(camp.completado)}</td>
                    <td className="px-4 py-2 font-semibold text-green-700 dark:text-green-400">{pct(camp.completado, camp.enviado)}</td>
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

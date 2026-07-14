'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import type { CampanaInfo, EficienciaData, DispositivoBreakdown, RespuestasStats } from './page'

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(n: number, d: number) { return d ? `${Math.round((n / d) * 100)}%` : '—' }
function fmt(n: number)            { return n.toLocaleString('es-CR') }
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtMin(min: number | null) {
  if (min === null) return '—'
  if (min < 60)  return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)}h ${min % 60}min`
  return `${Math.floor(min / 1440)}d ${Math.round((min % 1440) / 60)}h`
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: 'blue' | 'green' | 'yellow' | 'gray' | 'purple' }) {
  const cls = {
    blue:   'bg-blue-50  dark:bg-blue-950/30  border-blue-200  text-blue-800',
    green:  'bg-green-50 dark:bg-green-950/30 border-green-200 text-green-800',
    yellow: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800',
    gray:   'bg-gray-50  dark:bg-gray-800      border-gray-200  text-gray-700',
    purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 text-purple-800',
  }[color]
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">{label}</p>
      <p className="text-2xl font-bold">{typeof value === 'number' ? fmt(value) : value}</p>
      {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Bar Row ────────────────────────────────────────────────────────────────────
function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const w = total ? Math.max(1, Math.round((value / total) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-200">{label}</span>
        <span className="font-semibold">{fmt(value)} <span className="text-gray-400 font-normal text-xs">({pct(value, total)})</span></span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ── Insight Card ───────────────────────────────────────────────────────────────
function InsightCard({ emoji, label, value, sub, highlight }: { emoji: string; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${highlight ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
      <span className="text-2xl">{emoji}</span>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  campanas: CampanaInfo[]
  campanaActual: string | null
  campanaInfo: CampanaInfo | null
  eficiencia: EficienciaData
  dispositivos: DispositivoBreakdown[]
  respuestas: RespuestasStats
}

const TABS = ['Resumen', 'Eficiencia', 'Especialidades', 'Tecnología', 'Formulario'] as const
type Tab = typeof TABS[number]

const REFRESH_SECS = 120

export default function CampaignDashboard({ campanas, campanaActual, campanaInfo, eficiencia, dispositivos, respuestas }: Props) {
  const router       = useRouter()
  const [tab, setTab]             = useState<Tab>('Resumen')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [countdown, setCountdown] = useState(REFRESH_SECS)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Auto-refresh cada REFRESH_SECS segundos
  const refresh = useCallback(() => {
    router.refresh()
    setLastUpdated(new Date())
    setCountdown(REFRESH_SECS)
  }, [router])

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { refresh(); return REFRESH_SECS }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [refresh])

  function selectCampana(id: string) {
    router.push(`/estadisticas?campana=${encodeURIComponent(id)}`)
  }

  async function handleExport(tipo: 'registros' | 'respuestas') {
    if (!campanaActual) return
    setExporting(true); setExportError('')
    try {
      const res = await fetch(`/api/estadisticas/export?campana=${encodeURIComponent(campanaActual)}&tipo=${tipo}`)
      if (!res.ok) { const d = await res.json().catch(() => ({})); setExportError(d.error ?? 'Error'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${campanaActual}_${tipo}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { setExportError('Error de conexión') }
    finally { setExporting(false) }
  }

  const c = campanaInfo

  // Aggregated device data
  const totalDisp = dispositivos.reduce((s, d) => s + d.count, 0)
  const osCounts  = dispositivos.reduce<Record<string, number>>((m, d) => ({ ...m, [d.os]: (m[d.os] ?? 0) + d.count }), {})
  const brCounts  = dispositivos.reduce<Record<string, number>>((m, d) => ({ ...m, [d.browser]: (m[d.browser] ?? 0) + d.count }), {})
  const tipoCounts = dispositivos.reduce<Record<string, number>>((m, d) => ({ ...m, [d.tipo]: (m[d.tipo] ?? 0) + d.count }), {})

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Resultados de campaña</h1>
          {c && (
            <p className="text-sm text-gray-500 mt-0.5">
              Iniciada el {fmtDate(c.fecha_inicio)} · {fmt(c.total)} registros
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Selector de campaña */}
          <select
            value={campanaActual ?? ''}
            onChange={e => selectCampana(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#004B83]"
          >
            {campanas.length === 0 && <option value="">Sin campañas</option>}
            {campanas.map(cc => <option key={cc.id} value={cc.id}>{cc.id}</option>)}
          </select>

          {/* Export buttons */}
          {campanaActual && (
            <div className="flex gap-2">
              <button onClick={() => handleExport('registros')} disabled={exporting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#004B83] text-[#004B83] hover:bg-blue-50 transition-colors disabled:opacity-50">
                ↓ Registros Excel
              </button>
              <button onClick={() => handleExport('respuestas')} disabled={exporting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-600 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50">
                ↓ Respuestas Excel
              </button>
            </div>
          )}
          {exportError && <p className="text-xs text-red-500">{exportError}</p>}

          {/* Auto-refresh indicator */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Actualiza en {countdown}s</span>
            <button onClick={refresh} className="text-[#004B83] dark:text-blue-400 underline hover:no-underline">
              Actualizar ahora
            </button>
          </div>
        </div>
      </div>

      {!c ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center text-gray-400">
          No hay campañas registradas aún.
        </div>
      ) : (
        <>
          {/* ── KPIs principales ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Enviados"      value={c.enviado}    sub={pct(c.enviado, c.total)}       color="blue"   />
            <KpiCard label="Accedieron"    value={c.accedieron} sub={pct(c.accedieron, c.enviado)}  color="yellow" />
            <KpiCard label="Completaron"   value={c.completado} sub={pct(c.completado, c.enviado)}  color="green"  />
            <KpiCard label="Sin responder" value={c.enviado - c.completado} sub={pct(c.enviado - c.completado, c.enviado)} color="gray" />
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    tab === t
                      ? 'border-b-2 border-[#004B83] text-[#004B83] dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-5">

              {/* ── Resumen ── */}
              {tab === 'Resumen' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Embudo de la campaña</h3>
                    <div className="space-y-3">
                      <BarRow label="Enviados"           value={c.enviado}    total={c.total}    color="#004B83" />
                      <BarRow label="Accedieron al link" value={c.accedieron} total={c.total}    color="#2563eb" />
                      <BarRow label="Completaron"        value={c.completado} total={c.total}    color="#16a34a" />
                      <BarRow label="Sin responder"      value={c.enviado - c.completado} total={c.total} color="#d1d5db" />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400">
                      "Accedieron" = abrieron el link de la encuesta · "Completaron" = finalizaron el formulario<br/>
                      Última actualización: {lastUpdated.toLocaleTimeString('es-CR')}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Eficiencia ── */}
              {tab === 'Eficiencia' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <InsightCard emoji="⚡" label="Primera respuesta" value={fmtMin(eficiencia.minutos_primer_respuesta)} sub="desde que se envió el correo" />
                    <InsightCard emoji="⏱️" label="Tiempo promedio" value={fmtMin(eficiencia.minutos_promedio)} sub="de envío a completar" />
                    <InsightCard emoji="✅" label="Conversión link→formulario" value={`${eficiencia.conversion_pct}%`} sub="de quienes abrieron el link" highlight={eficiencia.conversion_pct > 80} />
                    <InsightCard emoji="📊" label="Total respuestas" value={fmt(c.completado)} sub={`de ${fmt(c.enviado)} enviados`} />
                    <InsightCard emoji="📱" label="Desde móvil" value={`${eficiencia.pct_movil}%`} sub="de quienes respondieron" />
                    <InsightCard emoji="🕒" label="Tiempo transcurrido" value={fmtMin(eficiencia.minutos_transcurridos)} sub="desde el primer envío" />
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 p-4">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Referencia sectorial</p>
                    <div className="grid grid-cols-3 gap-3 text-xs text-center">
                      <div><p className="text-gray-400">Apertura correo salud</p><p className="font-semibold text-gray-700 dark:text-gray-200">20–30%</p></div>
                      <div><p className="text-gray-400">Conversión formularios</p><p className="font-semibold text-gray-700 dark:text-gray-200">3–5%</p></div>
                      <div><p className="text-gray-400">CLEO esta campaña</p><p className="font-semibold text-green-700 dark:text-green-400">{pct(c.completado, c.enviado)}</p></div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Especialidades ── */}
              {tab === 'Especialidades' && (
                <div>
                  {Object.keys(respuestas.especialidad).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Sin datos de especialidad aún.</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(respuestas.especialidad)
                        .sort((a, b) => b[1] - a[1])
                        .map(([esp, count]) => (
                          <BarRow key={esp} label={esp} value={count} total={respuestas.total} color="#004B83" />
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tecnología ── */}
              {tab === 'Tecnología' && (
                <div className="space-y-5">
                  {totalDisp === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Sin datos de dispositivo aún.</p>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Tipo de dispositivo</h3>
                        <div className="space-y-2">
                          {Object.entries(tipoCounts).sort((a,b) => b[1]-a[1]).map(([tipo, count]) => (
                            <BarRow key={tipo} label={tipo} value={count} total={totalDisp} color="#2563eb" />
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Sistema operativo</h3>
                        <div className="space-y-2">
                          {Object.entries(osCounts).sort((a,b) => b[1]-a[1]).map(([os, count]) => (
                            <BarRow key={os} label={os} value={count} total={totalDisp} color="#7c3aed" />
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Navegador</h3>
                        <div className="space-y-2">
                          {Object.entries(brCounts).sort((a,b) => b[1]-a[1]).map(([br, count]) => (
                            <BarRow key={br} label={br} value={count} total={totalDisp} color="#0891b2" />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Formulario ── */}
              {tab === 'Formulario' && (
                <div className="space-y-5">
                  {respuestas.total === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Sin respuestas aún.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCard label="Total respuestas" value={respuestas.total} color="blue" />
                        <KpiCard label="Autorizaron" value={respuestas.consentimiento} sub={pct(respuestas.consentimiento, respuestas.total)} color="green" />
                        <KpiCard label="Info correcta" value={respuestas.infoCorrecta} sub={pct(respuestas.infoCorrecta, respuestas.consentimiento)} color="green" />
                        <KpiCard label="Quieren seguir" value={respuestas.quiereSeguir} sub={pct(respuestas.quiereSeguir, respuestas.consentimiento)} color="yellow" />
                      </div>

                      {Object.keys(respuestas.medioPref).length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Canal de contacto preferido</h3>
                          <div className="space-y-2">
                            {Object.entries(respuestas.medioPref)
                              .sort((a, b) => b[1] - a[1])
                              .map(([medio, count]) => (
                                <BarRow key={medio} label={medio} value={count} total={respuestas.total} color="#004B83" />
                              ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* ── Tabla de todas las campañas ──────────────────────────────── */}
          {campanas.length > 1 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Historial de campañas</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/40 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      {['Campaña', 'Fecha inicio', 'Enviados', 'Accedieron', 'Completaron', '% Conv.'].map(h => (
                        <th key={h} className="px-4 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {campanas.map(cc => (
                      <tr key={cc.id} onClick={() => selectCampana(cc.id)}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${cc.id === campanaActual ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}>
                        <td className="px-4 py-2 font-mono text-xs text-[#004B83] dark:text-blue-400">{cc.id}</td>
                        <td className="px-4 py-2 text-gray-500">{fmtDate(cc.fecha_inicio)}</td>
                        <td className="px-4 py-2">{fmt(cc.enviado)}</td>
                        <td className="px-4 py-2">{fmt(cc.accedieron)} <span className="text-gray-400 text-xs">({pct(cc.accedieron, cc.enviado)})</span></td>
                        <td className="px-4 py-2">{fmt(cc.completado)}</td>
                        <td className="px-4 py-2 font-semibold text-green-700 dark:text-green-400">{pct(cc.completado, cc.enviado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

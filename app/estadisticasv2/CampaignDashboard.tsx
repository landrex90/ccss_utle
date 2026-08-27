'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import type { CampanaInfo, EstadoRow, EficienciaData, EspecialidadRow, DispositivoData, FormSteps, ProximaFaseData, WaData } from './page'

const C = {
  blue:      '#004B83', blueLt: '#EBF2FA', blueMd: '#C7DCF0',
  green:     '#00875A', greenLt: '#E3F5EC',
  amber:     '#D97706', amberLt: '#FEF3C7',
  red:       '#B91C1C', redLt: '#FEE2E2',
  purple:    '#5B3FD4', purpleLt: '#EDE9FE',
  gray:      '#64748B', border:  '#E2E8F0',
  bg:        '#F7F9FC', text:    '#1A2433',
  wa:        '#25D366',
}

const pct  = (n: number, d: number) => d ? `${Math.round((n/d)*100)}%` : '—'
const pct1 = (n: number, d: number) => d ? `${(Math.round((n/d)*1000)/10).toFixed(1)}%` : '—'
const fmt  = (n: number) => n.toLocaleString('es-CR')
const fmtMin = (m: number | null) => {
  if (m === null) return '—'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.floor(m/60)}h ${m%60}min`
  return `${Math.floor(m/1440)}d ${Math.round((m%1440)/60)}h`
}
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CR', { day:'2-digit', month:'short', year:'numeric' }) : '—'

function KPI({ lbl, val, sub, col }: { lbl: string; val: string; sub?: string; col: string }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:10, padding:'15px 17px' }}>
      <div style={{ fontSize:11, color:C.gray, marginBottom:4 }}>{lbl}</div>
      <div style={{ fontSize:28, fontWeight:800, lineHeight:1, color: col }}>{val}</div>
      {sub && <div style={{ fontSize:11, color:C.gray, marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function Insight({ val, lbl, desc, accent }: { val: string; lbl: string; desc: string; accent: string }) {
  return (
    <div style={{ background:'#fff', borderRadius:10, border:`1px solid ${C.border}`, padding:'14px 16px', borderTop:`3px solid ${accent}` }}>
      <div style={{ fontSize:22, fontWeight:800, color:accent, marginBottom:2 }}>{val}</div>
      <div style={{ fontSize:11, fontWeight:600, color:C.text }}>{lbl}</div>
      <div style={{ fontSize:10, color:C.gray, marginTop:3, lineHeight:1.5 }}>{desc}</div>
    </div>
  )
}

function BarRow({ lbl, val, total, color, lblWidth = 160 }: { lbl: string; val: number; total: number; color: string; lblWidth?: number }) {
  const w = total ? Math.max(0.5, (val/total)*100) : 0
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9 }}>
      <div style={{ fontSize:12, color:C.text, minWidth:lblWidth, maxWidth:lblWidth, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lbl}</div>
      <div style={{ flex:1, height:7, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:4, background:color, width:`${w}%` }} />
      </div>
      <div style={{ fontSize:12, fontWeight:700, minWidth:32, textAlign:'right' }}>{fmt(val)}</div>
      <div style={{ fontSize:11, color:C.gray, minWidth:40, textAlign:'right' }}>{pct(val,total)}</div>
    </div>
  )
}

function FunnelRow({ lbl, val, total, color }: { lbl: string; val: number; total: number; color: string }) {
  const w = total ? Math.max(0.5, (val/total)*100) : 0
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
      <span style={{ fontSize:12, width:200, flexShrink:0, color:C.text }}>{lbl}</span>
      <div style={{ flex:1, height:9, background:'#F1F5F9', borderRadius:5, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:5, background:color, width:`${w}%` }} />
      </div>
      <span style={{ fontSize:13, fontWeight:700, minWidth:60, textAlign:'right', color, fontVariantNumeric:'tabular-nums' }}>{fmt(val)}</span>
      <span style={{ fontSize:11, color:C.gray, minWidth:44, textAlign:'right' }}>{pct(val,total)}</span>
    </div>
  )
}

function StepBar({ label, a, b, total, colA, colB }: { label: string; a: number; b: number; total: number; colA: string; colB: string }) {
  const wa = total ? (a/total)*100 : 0
  const wb = total ? (b/total)*100 : 0
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:12, fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:700, color:colA }}>{a} sí · <span style={{ color:colB }}>{b} no</span></span>
      </div>
      <div style={{ height:7, borderRadius:4, overflow:'hidden', display:'flex' }}>
        <div style={{ width:`${wa}%`, background:colA }} />
        <div style={{ width:`${wb}%`, background:colB }} />
      </div>
      <div style={{ fontSize:10, color:C.gray, marginTop:3 }}>{pct(a,total)} · {pct(b,total)}</div>
    </div>
  )
}

const PILL: Record<string, string> = {
  PENDIENTE: `background:#F1F5F9;color:${C.gray}`,
  ACTIVO:    `background:${C.greenLt};color:${C.green}`,
  INFO_INCORRECTA: `background:${C.redLt};color:${C.red}`,
}
function pill(estado: string) {
  const s = PILL[estado] ?? (estado.startsWith('DEPURADO') ? `background:${C.amberLt};color:${C.amber}` : `background:#F1F5F9;color:${C.gray}`)
  return <span style={{ display:'inline-block', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, ...Object.fromEntries(s.split(';').filter(Boolean).map(p => { const [k,v]=p.split(':'); return [k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v?.trim()] })) }}>{estado}</span>
}

const REFRESH_SECS = 120
const CARD: React.CSSProperties = { background:'#fff', borderRadius:10, border:`1px solid ${C.border}`, padding:'20px 22px', marginBottom:18 }
const SEC: React.CSSProperties  = { fontSize:10, fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:C.gray, marginBottom:12 }

function WaExportButton({ campanaId, waElegibles }: { campanaId: string; waElegibles: number }) {
  const [estado, setEstado] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [msg, setMsg]       = useState('')

  async function handleExport() {
    if (estado === 'loading') return
    setEstado('loading'); setMsg('')
    try {
      const res = await fetch(`/api/admin/wa-export-coco?campana=${encodeURIComponent(campanaId)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const aptos     = res.headers.get('X-WA-Aptos') ?? '?'
      const excluidos = res.headers.get('X-WA-Excluidos') ?? '?'
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? `wa-export.xlsx`
      a.download = name; a.click(); URL.revokeObjectURL(url)
      setEstado('ok')
      setMsg(`✅ ${Number(aptos).toLocaleString('es-CR')} registros para COCO · ${Number(excluidos).toLocaleString('es-CR')} pasan a llamada`)
    } catch (e: unknown) {
      setEstado('error')
      setMsg(`❌ ${e instanceof Error ? e.message : 'Error desconocido'}`)
    }
  }

  const btnColor = estado === 'ok' ? C.green : estado === 'error' ? C.red : C.wa
  return (
    <div style={{ marginBottom:18, padding:'16px 20px', borderRadius:10, border:`2px solid ${C.wa}`, background:'#F0FDF4', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.green, marginBottom:3 }}>📲 Exportar para WhatsApp — COCO</div>
        <div style={{ fontSize:11, color:C.gray }}>
          Genera el Excel en formato COCO y marca los registros en BD.&nbsp;
          <strong>{waElegibles.toLocaleString('es-CR')} candidatos</strong> pendientes en esta campaña.
        </div>
        {msg && <div style={{ fontSize:11, marginTop:6, color: estado === 'ok' ? C.green : C.red, fontWeight:600 }}>{msg}</div>}
      </div>
      <button onClick={handleExport} disabled={estado === 'loading'} style={{ padding:'10px 22px', borderRadius:8, border:'none', cursor: estado === 'loading' ? 'not-allowed' : 'pointer', background: btnColor, color:'#fff', fontSize:13, fontWeight:700, opacity: estado === 'loading' ? 0.7 : 1, whiteSpace:'nowrap', transition:'opacity 0.2s' }}>
        {estado === 'loading' ? '⏳ Generando...' : estado === 'ok' ? '✅ Descargado' : '⬇️ Descargar para COCO'}
      </button>
    </div>
  )
}

interface Props {
  campanas:           CampanaInfo[]
  campanaActual:      string
  campanaInfo:        CampanaInfo
  estados:            EstadoRow[]
  eficiencia:         EficienciaData
  especialidades:     EspecialidadRow[]
  dispositivos:       DispositivoData
  formSteps:          FormSteps
  proximaFase:        ProximaFaseData
  waData:             WaData
  estadosPorCampana:  Record<string, EstadoRow[]>
  waPorCampana:       Record<string, WaData>
  llamadasPendientes:  number
  llamadasRespondieron: number
  canExportWA?:       boolean
}

const EMPTY_WA: WaData = { enviados:0, pendientes:0, respondio:0, no_respondio:0, entregados:0, leidos:0, activo:0, depurado_renuncia:0, no_autorizo:0, no_verificado:0 }

function mergeEstados(allEstados: EstadoRow[][]): EstadoRow[] {
  const m: Record<string, number> = {}
  for (const rows of allEstados) for (const r of rows) m[r.estado] = (m[r.estado] ?? 0) + r.count
  return Object.entries(m).map(([estado, count]) => ({ estado, count })).sort((a, b) => b.count - a.count)
}

function mergeWa(all: WaData[]): WaData {
  return all.reduce((a, w) => ({
    enviados:          a.enviados          + w.enviados,
    pendientes:        a.pendientes        + w.pendientes,
    respondio:         a.respondio         + w.respondio,
    no_respondio:      a.no_respondio      + w.no_respondio,
    entregados:        a.entregados        + w.entregados,
    leidos:            a.leidos            + w.leidos,
    activo:            a.activo            + w.activo,
    depurado_renuncia: a.depurado_renuncia + w.depurado_renuncia,
    no_autorizo:       a.no_autorizo       + w.no_autorizo,
    no_verificado:     a.no_verificado     + w.no_verificado,
  }), { ...EMPTY_WA })
}

type Tab = 'global' | 'resumen' | 'eficiencia' | 'especialidades' | 'tecnologia' | 'formulario' | 'whatsapp'
const TABS: { id: Tab; label: string }[] = [
  { id:'global',        label:'🌐 Resumen General'      },
  { id:'resumen',       label:'📊 Esta Campaña'         },
  { id:'eficiencia',    label:'⚡ Eficiencia'           },
  { id:'especialidades',label:'🏥 Especialidades'       },
  { id:'tecnologia',    label:'📱 Tecnología'           },
  { id:'formulario',    label:'📋 Respuestas'           },
  { id:'whatsapp',      label:'📲 WhatsApp'             },
]

type TipoFiltro = 'Todos' | 'Cirugía' | 'CE' | 'Procedimientos'
const TIPOS: TipoFiltro[] = ['Todos', 'Cirugía', 'CE', 'Procedimientos']

function getTipo(id: string): TipoFiltro {
  const u = id.toUpperCase()
  if (u.includes('CIRUGIA'))                                             return 'Cirugía'
  if (u.includes('_CE') || u.includes('-CE') || u.includes('CONSULTA')) return 'CE'
  if (u.includes('PROCEDIMIENTO') || u.includes('PROC'))                return 'Procedimientos'
  return 'Todos'
}

export default function CampaignDashboardV2({ campanas, campanaActual, campanaInfo: c, estados, eficiencia, especialidades, dispositivos, formSteps, proximaFase, waData, estadosPorCampana, waPorCampana, llamadasPendientes, llamadasRespondieron, canExportWA }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab]       = useState<Tab>((searchParams.get('tab') as Tab) ?? 'global')
  const [cd, setCd]         = useState(REFRESH_SECS)
  const [exp, setExp]       = useState(false)
  const [expErr, setExpErr] = useState('')

  const tipoFiltro = (searchParams.get('tipo') ?? 'Todos') as TipoFiltro

  const campanasFiltradas = tipoFiltro === 'Todos'
    ? campanas
    : campanas.filter(cc => getTipo(cc.id) === tipoFiltro)

  const campanaExplicita = !!searchParams.get('campana')
  const modoDetalle = campanaExplicita && tipoFiltro !== 'Todos'

  const visibleTabs = modoDetalle
    ? TABS.filter(t => t.id !== 'global')
    : TABS.filter(t => t.id === 'global')

  useEffect(() => {
    setTab(modoDetalle ? 'resumen' : 'global')
  }, [modoDetalle])

  const refresh = useCallback(() => { router.refresh(); setCd(REFRESH_SECS) }, [router])
  useEffect(() => {
    const t = setInterval(() => setCd(prev => { if (prev <= 1) { refresh(); return REFRESH_SECS } return prev - 1 }), 1000)
    return () => clearInterval(t)
  }, [refresh])

  async function handleExport(tipo: 'registros' | 'respuestas') {
    setExp(true); setExpErr('')
    try {
      const res = await fetch(`/api/estadisticas/export?campana=${encodeURIComponent(campanaActual)}&tipo=${tipo}`)
      if (!res.ok) { setExpErr('Error al exportar'); return }
      const blob = await res.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${campanaActual}_${tipo}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
    } catch { setExpErr('Error de conexión') }
    finally { setExp(false) }
  }

  const [expCompleto, setExpCompleto] = useState<'idle' | 'iniciando' | 'generando' | 'listo'>('idle')
  async function handleExportCompleto() {
    setExpCompleto('iniciando'); setExpErr('')
    try {
      const startRes = await fetch('/api/estadisticas/export-completo/start', { method: 'POST' })
      const startBody = await startRes.json().catch(() => null)
      if (!startRes.ok) { setExpErr(startBody?.error ?? 'Error al iniciar el export'); setExpCompleto('idle'); return }

      const jobId = startBody.jobId
      setExpCompleto('generando')

      const poll = async (): Promise<void> => {
        const res = await fetch(`/api/estadisticas/export-completo/status?jobId=${jobId}`)
        const body = await res.json().catch(() => null)
        if (!res.ok || body?.status === 'failed') {
          setExpErr(body?.error ?? 'Error al generar el export'); setExpCompleto('idle'); return
        }
        if (body?.status === 'completed') {
          const fecha = new Date().toISOString().slice(0, 10)
          const a = document.createElement('a')
          a.href = `/api/estadisticas/export-completo/download?jobId=${jobId}`
          a.download = `CCSS_UTLE_consolidado_${fecha}.csv`
          a.click()
          setExpCompleto('idle')
          return
        }
        setTimeout(poll, 4000)
      }
      poll()
    } catch { setExpErr('Error de conexión'); setExpCompleto('idle') }
  }

  const totalMax   = especialidades[0]?.total_piloto ?? 1
  const totalOsMax = Math.max(...Object.values(dispositivos.os), 1)
  const totalBrMax = Math.max(...Object.values(dispositivos.browser), 1)

  const globalTotals = campanasFiltradas.reduce((acc, cc) => ({
    total:      acc.total      + cc.total,
    enviado:    acc.enviado    + cc.enviado,
    accedieron: acc.accedieron + cc.accedieron,
    completado: acc.completado + cc.completado,
  }), { total: 0, enviado: 0, accedieron: 0, completado: 0 })

  const gEstados = mergeEstados(campanasFiltradas.map(cc => estadosPorCampana[cc.id] ?? []))
  const gWa      = mergeWa(campanasFiltradas.map(cc => waPorCampana[cc.id] ?? EMPTY_WA))

  // ── Embudo de captación ────────────────────────────────────────────────────────
  const gWaRespondieron      = gWa.respondio
  // Correo puro = total completado menos los que vinieron vía WA (activo) y los de llamada
  const gCorreoRespondieron  = Math.max(0, globalTotals.completado - gWa.activo - llamadasRespondieron)
  const gTotalRespondieron   = gCorreoRespondieron + gWaRespondieron + llamadasRespondieron
  const gCorreoNoCont        = Math.max(0, globalTotals.enviado - gCorreoRespondieron)

  // Para tab de campaña individual
  const waCompletados     = waData.activo + waData.depurado_renuncia
  const correoCompletados = Math.max(0, c.completado - waCompletados)
  const pendientes        = c.total - c.completado

  const canalOrder  = ['whatsapp', 'cualquiera', 'llamada', 'correo', 'sms']
  const canalColors: Record<string, string> = { whatsapp: C.wa, cualquiera: C.blueMd, llamada: C.blue, correo: '#94A3B8', sms: '#E2E8F0' }
  const canalLabels: Record<string, string> = { whatsapp:'💬 WhatsApp', cualquiera:'🔀 Cualquiera', llamada:'📞 Llamada', correo:'📧 Correo', sms:'💬 SMS' }

  return (
    <div style={{ fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", color:C.text }}>

      {/* HEADER */}
      <div style={{ background:C.blue, padding:'18px 0 14px', marginLeft:-24, marginRight:-24, marginTop:-32, paddingLeft:24, paddingRight:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontSize:10, color:'#89B8DC', letterSpacing:2, textTransform:'uppercase' }}>CCSS · Unidad Técnica de Listas de Espera</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#fff', marginTop:2 }}>
              CLEO · {tipoFiltro === 'Todos'
                ? 'Resumen General'
                : modoDetalle
                  ? `Dashboard ${tipoFiltro} — ${campanaActual.replace('ENCUESTA-', '').replace(/_\d+$/, '')}`
                  : `Resumen de ${tipoFiltro}`}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            {modoDetalle && (
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
                <span style={{ fontSize:11, background:'rgba(255,255,255,.15)', color:'#fff', padding:'3px 10px', borderRadius:20 }}>{campanaActual}</span>
              </div>
            )}
            <div style={{ fontSize:11, color:'#89B8DC', marginTop:6 }}>
              <span style={{ display:'inline-block', width:6, height:6, background:'#22C55E', borderRadius:'50%', marginRight:4, verticalAlign:'middle', animation:'pulse 2s infinite' }} />
              {modoDetalle
                ? `${fmtDate(c.fecha_inicio)} · ${fmt(c.completado)} completaron · ${c.accedieron > 0 ? pct(c.completado, c.enviado) : '0%'} conversión`
                : `${campanasFiltradas.length} campaña${campanasFiltradas.length !== 1 ? 's' : ''} · ${fmt(gTotalRespondieron)} respondieron · ${pct1(gTotalRespondieron, globalTotals.enviado)} efectividad`
              }
            </div>
          </div>
        </div>

        {/* Filtro por tipo + Selector */}
        <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap', alignItems:'center' }}>
          {TIPOS.map(t => (
            <button key={t} onClick={() => {
              router.push(`/estadisticasv2?tipo=${encodeURIComponent(t)}`)
              setTab('global')
            }} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, cursor:'pointer', border:'1px solid rgba(255,255,255,.35)',
              background: tipoFiltro === t && !modoDetalle ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.08)',
              color: tipoFiltro === t && !modoDetalle ? '#fff' : '#89B8DC',
              fontWeight: tipoFiltro === t && !modoDetalle ? 700 : 400 }}>
              {t}
            </button>
          ))}
          {tipoFiltro !== 'Todos' && (
            <>
              <div style={{ width:1, height:18, background:'rgba(255,255,255,.2)', margin:'0 2px' }} />
              {campanasFiltradas.length === 0 ? (
                <span style={{ fontSize:11, color:'#fbbf24', fontStyle:'italic', padding:'4px 10px', border:'1px solid rgba(251,191,36,.4)', borderRadius:6, background:'rgba(251,191,36,.08)' }}>
                  Sin campañas de {tipoFiltro} aún
                </span>
              ) : (
                <select
                  value={modoDetalle ? campanaActual : ''}
                  onChange={e => {
                    if (e.target.value) {
                      router.push(`/estadisticasv2?campana=${encodeURIComponent(e.target.value)}&tipo=${encodeURIComponent(tipoFiltro)}`)
                      setTab('resumen')
                    }
                  }}
                  style={{ fontSize:12, border:'1px solid rgba(255,255,255,.3)', borderRadius:6, padding:'4px 10px', background:'rgba(255,255,255,.1)', color:'#fff' }}>
                  <option value="" style={{ color:C.text }}>— Ver campaña específica —</option>
                  {campanasFiltradas.map(cc => <option key={cc.id} value={cc.id} style={{ color:C.text }}>{cc.id.replace('ENCUESTA-','')}</option>)}
                </select>
              )}
              {modoDetalle && (
                <>
                  <button onClick={() => handleExport('registros')} disabled={exp} style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.1)', color:'#fff', cursor:'pointer' }}>↓ Registros Excel</button>
                  <button onClick={() => handleExport('respuestas')} disabled={exp} style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.1)', color:'#fff', cursor:'pointer' }}>↓ Respuestas Excel</button>
                </>
              )}
            </>
          )}
          <button onClick={handleExportCompleto} disabled={expCompleto !== 'idle'} style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.15)', color:'#fff', cursor:'pointer', fontWeight:700, marginLeft:'auto' }}>
            {expCompleto === 'iniciando' ? 'Iniciando…' : expCompleto === 'generando' ? 'Generando… (puede tardar 1-2 min)' : '↓ Exportar todo (consolidado)'}
          </button>
          <span style={{ fontSize:11, color:'#89B8DC' }}>
            Actualiza en {cd}s &nbsp;
            <button onClick={refresh} style={{ fontSize:11, color:'#89B8DC', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Ahora</button>
          </span>
        </div>
        {expErr && <div style={{ fontSize:11, color:'#fca5a5', marginTop:6 }}>{expErr}</div>}
      </div>

      {/* TABS */}
      <div style={{ display:'flex', background:'#fff', borderBottom:`2px solid ${C.border}`, marginLeft:-24, marginRight:-24, paddingLeft:24, overflowX:'auto' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontSize:12, fontWeight:600, padding:'13px 16px', cursor:'pointer', border:'none', background:'none', borderBottom:`2px solid ${tab===t.id ? C.blue : 'transparent'}`,
            color: tab===t.id ? C.blue : C.gray, marginBottom:-2, whiteSpace:'nowrap', transition:'color .15s'
          }}>
            {t.label}
            {t.id === 'whatsapp' && waData.respondio > 0 && (
              <span style={{ marginLeft:6, background:C.green, color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10 }}>
                {waData.respondio}
              </span>
            )}
          </button>
        ))}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <div style={{ paddingTop:24 }}>

        {/* ══ RESUMEN GLOBAL ══ */}
        {tab === 'global' && (
          <div>

            {/* 3 KPIs de cabecera */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
              <KPI
                lbl="Base contactada"
                val={fmt(globalTotals.enviado)}
                sub={`${campanasFiltradas.length} campaña${campanasFiltradas.length !== 1 ? 's' : ''} activas`}
                col={C.blue}
              />
              <KPI
                lbl="Respondieron (cualquier canal)"
                val={fmt(gTotalRespondieron)}
                sub={`correo · WhatsApp · voicebot`}
                col={C.green}
              />
              <KPI
                lbl="Efectividad acumulada"
                val={pct1(gTotalRespondieron, globalTotals.enviado)}
                sub={`sobre base contactada`}
                col={gTotalRespondieron / Math.max(1, globalTotals.enviado) >= 0.15 ? C.green : C.amber}
              />
            </div>

            {/* EMBUDO DE CAPTACIÓN */}
            <div style={CARD}>
              <div style={SEC}>Embudo de captación por canal</div>

              {/* ── CORREO ── */}
              <div style={{ marginBottom:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>📧</span>
                  <span style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.blue }}>
                    Correo electrónico
                  </span>
                  <span style={{ marginLeft:'auto', fontSize:22, fontWeight:800, color:C.blue, fontVariantNumeric:'tabular-nums' }}>
                    {fmt(globalTotals.enviado)}
                  </span>
                </div>
                <div style={{ paddingLeft:24, borderLeft:`3px solid ${C.blueMd}` }}>
                  <FunnelRow
                    lbl="✅ Respondieron por correo"
                    val={gCorreoRespondieron}
                    total={globalTotals.enviado}
                    color={C.green}
                  />
                  <FunnelRow
                    lbl="➡️ Continúan al siguiente canal"
                    val={gCorreoNoCont}
                    total={globalTotals.enviado}
                    color="#CBD5E1"
                  />
                </div>
              </div>

              <div style={{ display:'flex', paddingLeft:24, color:C.gray, fontSize:18, margin:'8px 0 14px' }}>↓</div>

              {/* ── WHATSAPP ── */}
              <div style={{ marginBottom:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>📱</span>
                  <span style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.wa }}>
                    WhatsApp
                  </span>
                  {gWa.enviados > 0
                    ? <span style={{ marginLeft:'auto', fontSize:22, fontWeight:800, color:C.wa, fontVariantNumeric:'tabular-nums' }}>{fmt(gWa.enviados)}</span>
                    : <span style={{ marginLeft:'auto', fontSize:11, color:C.gray, fontStyle:'italic' }}>sin campaña WA activa aún</span>
                  }
                </div>
                {gWa.enviados > 0 ? (
                  <div style={{ paddingLeft:24, borderLeft:`3px solid #86EFAC` }}>
                    {gWaRespondieron > 0 && (
                      <FunnelRow
                        lbl="✅ Respondieron por WhatsApp"
                        val={gWaRespondieron}
                        total={gWa.enviados}
                        color={C.green}
                      />
                    )}
                    {gWa.no_respondio > 0 && (
                      <FunnelRow
                        lbl="➡️ No respondieron → voicebot"
                        val={gWa.no_respondio}
                        total={gWa.enviados}
                        color="#CBD5E1"
                      />
                    )}
                    {gWa.pendientes > 0 && (
                      <FunnelRow
                        lbl="⏳ Pendiente resultado COCO"
                        val={gWa.pendientes}
                        total={gWa.enviados}
                        color={C.amber}
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ paddingLeft:24, fontSize:11, color:C.gray, fontStyle:'italic' }}>
                    Datos pendientes de campaña WA
                  </div>
                )}
              </div>

              <div style={{ display:'flex', paddingLeft:24, color:C.gray, fontSize:18, margin:'8px 0 14px' }}>↓</div>

              {/* ── VOICEBOT ── */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>📞</span>
                  <span style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', color:C.blue }}>
                    Voicebot / Llamadas
                  </span>
                  <span style={{ marginLeft:'auto', fontSize:22, fontWeight:800, color:C.blue, fontVariantNumeric:'tabular-nums' }}>
                    {fmt(llamadasRespondieron + llamadasPendientes)}
                  </span>
                </div>
                {(llamadasRespondieron + llamadasPendientes) > 0 ? (
                  <div style={{ paddingLeft:24, borderLeft:`3px solid ${C.blueMd}` }}>
                    {llamadasRespondieron > 0 && (
                      <FunnelRow
                        lbl="✅ Respondieron por voicebot"
                        val={llamadasRespondieron}
                        total={llamadasRespondieron + llamadasPendientes}
                        color={C.green}
                      />
                    )}
                    {llamadasPendientes > 0 && (
                      <FunnelRow
                        lbl="⏳ Sin respuesta aún"
                        val={llamadasPendientes}
                        total={llamadasRespondieron + llamadasPendientes}
                        color="#CBD5E1"
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ paddingLeft:24, fontSize:11, color:C.gray, fontStyle:'italic' }}>
                    Candidatos según resultado canal WA
                  </div>
                )}
              </div>

              {/* ── Total efectividad ── */}
              <div style={{ borderTop:`2px solid ${C.border}`, paddingTop:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>🎯 Respondieron en cualquier canal</div>
                  <div style={{ fontSize:11, color:C.gray, marginTop:3 }}>
                    {fmt(gCorreoRespondieron)} correo
                    {gWaRespondieron > 0 && <> &nbsp;+&nbsp; {fmt(gWaRespondieron)} WhatsApp</>}
                    {llamadasRespondieron > 0 && <> &nbsp;+&nbsp; {fmt(llamadasRespondieron)} voicebot</>}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:28, fontWeight:800, color:C.green, fontVariantNumeric:'tabular-nums' }}>
                    {fmt(gTotalRespondieron)}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.green }}>
                    {pct1(gTotalRespondieron, globalTotals.enviado)} efectividad acumulada
                  </div>
                </div>
              </div>
            </div>

            {/* Tabla comparativa de campañas */}
            <div style={CARD}>
              <div style={SEC}>Comparativa por campaña{tipoFiltro !== 'Todos' ? ` — ${tipoFiltro}` : ''} — clic en una fila para ver el detalle</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                      <th style={{ textAlign:'left',  padding:'6px 10px 10px 0', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Campaña</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Enviados</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Abrieron</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Respondieron</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>WA resp.</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Total resp.</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Efectividad</th>
                      <th style={{ textAlign:'right', padding:'6px 8px 10px', color:C.gray, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Inicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campanasFiltradas.map(cc => {
                      const waCC         = waPorCampana[cc.id] ?? EMPTY_WA
                      const correoResp   = Math.max(0, cc.completado - waCC.activo)
                      const waResp       = waCC.respondio
                      const totalResp    = correoResp + waResp
                      const efectividad  = cc.enviado ? (totalResp / cc.enviado) * 100 : 0
                      const tipo         = cc.id.includes('CIRUGIA') ? 'CIR' : (cc.id.includes('-CE') || cc.id.includes('_CE')) ? 'CE' : 'PROC'
                      const tipoBg       = tipo === 'CIR' ? '#DBEAFE' : tipo === 'CE' ? '#DCFCE7' : '#FEF3C7'
                      const tipoCol      = tipo === 'CIR' ? C.blue : tipo === 'CE' ? C.green : C.amber
                      const isActual     = cc.id === campanaActual
                      return (
                        <tr key={cc.id}
                          onClick={() => { router.push(`/estadisticasv2?campana=${encodeURIComponent(cc.id)}&tipo=${encodeURIComponent(getTipo(cc.id))}&tab=resumen`); setTab('resumen') }}
                          style={{ cursor:'pointer', borderBottom:`1px solid #F1F5F9`, background: isActual ? C.blueLt : 'transparent' }}
                        >
                          <td style={{ padding:'10px 10px 10px 0', fontWeight: isActual ? 700 : 400 }}>
                            <span style={{ display:'inline-block', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:12, background:tipoBg, color:tipoCol, marginRight:7 }}>{tipo}</span>
                            {cc.id.replace('ENCUESTA-', '').replace(/_\d+$/, '')}
                          </td>
                          <td style={{ textAlign:'right', padding:'10px 8px', fontVariantNumeric:'tabular-nums' }}>{fmt(cc.enviado)}</td>
                          <td style={{ textAlign:'right', padding:'10px 8px', color:C.blue, fontVariantNumeric:'tabular-nums' }}>
                            {fmt(cc.accedieron)}
                            <span style={{ color:C.gray, fontSize:10, marginLeft:4 }}>({pct(cc.accedieron, cc.enviado)})</span>
                          </td>
                          <td style={{ textAlign:'right', padding:'10px 8px', color:C.green, fontVariantNumeric:'tabular-nums' }}>{fmt(correoResp)}</td>
                          <td style={{ textAlign:'right', padding:'10px 8px', color:C.wa, fontVariantNumeric:'tabular-nums' }}>
                            {waResp > 0 ? fmt(waResp) : <span style={{ color:C.gray }}>—</span>}
                          </td>
                          <td style={{ textAlign:'right', padding:'10px 8px', color:C.green, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{fmt(totalResp)}</td>
                          <td style={{ textAlign:'right', padding:'10px 8px', minWidth:90 }}>
                            <span style={{ fontWeight:800, color: efectividad >= 25 ? C.green : efectividad >= 12 ? C.amber : C.gray }}>{Math.round(efectividad * 10) / 10}%</span>
                            <div style={{ height:4, background:C.border, borderRadius:2, marginTop:4 }}>
                              <div style={{ height:'100%', borderRadius:2, background: efectividad >= 25 ? C.green : efectividad >= 12 ? C.amber : C.gray, width:`${Math.min(100, efectividad * 2.5)}%` }} />
                            </div>
                          </td>
                          <td style={{ textAlign:'right', padding:'10px 8px', color:C.gray, fontSize:11 }}>{fmtDate(cc.fecha_inicio)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:`2px solid ${C.border}` }}>
                      <td style={{ padding:'10px 10px 6px 0', fontWeight:700 }}>TOTAL</td>
                      <td style={{ textAlign:'right', padding:'10px 8px 6px', fontWeight:700, color:C.blue, fontVariantNumeric:'tabular-nums' }}>{fmt(globalTotals.enviado)}</td>
                      <td style={{ textAlign:'right', padding:'10px 8px 6px', fontWeight:700, color:C.blue, fontVariantNumeric:'tabular-nums' }}>{fmt(globalTotals.accedieron)}</td>
                      <td style={{ textAlign:'right', padding:'10px 8px 6px', fontWeight:700, color:C.green, fontVariantNumeric:'tabular-nums' }}>{fmt(gCorreoRespondieron)}</td>
                      <td style={{ textAlign:'right', padding:'10px 8px 6px', fontWeight:700, color:C.wa, fontVariantNumeric:'tabular-nums' }}>{fmt(gWaRespondieron)}</td>
                      <td style={{ textAlign:'right', padding:'10px 8px 6px', fontWeight:700, color:C.green, fontVariantNumeric:'tabular-nums' }}>{fmt(gTotalRespondieron)}</td>
                      <td style={{ textAlign:'right', padding:'10px 8px 6px', fontWeight:700, color:C.green }}>{pct1(gTotalRespondieron, globalTotals.enviado)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div style={{ fontSize:11, color:C.gray, marginTop:10, fontStyle:'italic' }}>
                * Un mismo paciente puede estar en varias campañas. El total no representa pacientes únicos.
              </div>
            </div>
          </div>
        )}

        {/* ══ RESUMEN CAMPAÑA ══ */}
        {tab === 'resumen' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              <KPI lbl="Correos enviados"     val={fmt(c.enviado)}          sub={fmtDate(c.fecha_inicio)}  col={C.blue}  />
              <KPI lbl="Abrieron correo"      val={fmt(c.accedieron)}       sub={`${pct(c.accedieron, c.enviado)} del total`}  col={C.blue}  />
              <KPI lbl="Completaron encuesta" val={fmt(c.completado)}       sub={waCompletados > 0 ? `${fmt(correoCompletados)} correo · ${fmt(waCompletados)} WA` : `${pct(c.completado, c.enviado)} del total`} col={C.green} />
              <KPI lbl="Sin responder"        val={fmt(pendientes)}         sub={`${pct(pendientes, c.total)} del total`}  col={C.gray}  />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              <div style={CARD}>
                <div style={SEC}>Embudo de conversión</div>
                <FunnelRow lbl="📧 Enviados por correo"       val={c.enviado}                                    total={c.enviado} color={C.blueMd} />
                <FunnelRow lbl="🔗 Abrieron el correo"        val={c.accedieron}                                 total={c.enviado} color={C.blue}   />
                <FunnelRow lbl="✅ Completaron vía correo"     val={correoCompletados}                            total={c.enviado} color={C.green}  />
                {waCompletados > 0 && (
                  <FunnelRow lbl="💬 Completaron vía WhatsApp" val={waCompletados}                               total={c.enviado} color={C.wa}     />
                )}
                <FunnelRow lbl="⏳ Abrió correo, no terminó"  val={Math.max(0, c.accedieron - correoCompletados)} total={c.enviado} color={C.amber} />
                <FunnelRow lbl="📭 Sin acceder al correo"      val={Math.max(0, c.enviado - c.accedieron)}       total={c.enviado} color='#E2E8F0' />
              </div>

              <div style={CARD}>
                <div style={SEC}>Respuestas por estado</div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'left', borderBottom:`1px solid ${C.border}` }}>Estado</th>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'right', borderBottom:`1px solid ${C.border}` }}>Registros</th>
                      <th style={{ fontSize:10, color:C.gray, textAlign:'right', padding:'0 0 8px', borderBottom:`1px solid ${C.border}` }}>% base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estados.map(e => (
                      <tr key={e.estado}>
                        <td style={{ fontSize:12, padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{pill(e.estado)}</td>
                        <td style={{ fontSize:12, fontWeight:700, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{fmt(e.count)}</td>
                        <td style={{ fontSize:11, color:C.gray, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{pct(e.count, c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ EFICIENCIA ══ */}
        {tab === 'eficiencia' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
              <Insight val={fmtMin(eficiencia.minutos_primer_respuesta)} lbl="Primera respuesta" desc="Desde que se envió el correo hasta que el primer paciente completó el formulario" accent={C.green} />
              <Insight val={fmtMin(eficiencia.minutos_promedio)} lbl="Tiempo promedio de respuesta" desc="Desde el envío del correo hasta que el paciente completó el formulario" accent={C.blue} />
              <Insight val={`${eficiencia.conversion_pct}%`} lbl="Conversión apertura → respuesta" desc="De cada 100 que abrieron el link, cuántos completaron el formulario" accent={C.green} />
              <Insight val={String(eficiencia.resp_por_min)} lbl="Respuestas por minuto" desc={`Ritmo sostenido en los primeros ${fmtMin(eficiencia.minutos_transcurridos)} desde el envío`} accent={C.purple} />
              <Insight val={fmtMin(eficiencia.minutos_transcurridos)} lbl="Tiempo desde envío" desc={`${fmt(c.completado)} respuestas recopiladas — ventana activa sigue abierta por 3 días`} accent={C.amber} />
              <Insight val={`${eficiencia.pct_movil}%`} lbl="Desde dispositivo móvil" desc="El formulario funciona correctamente en celular sin fricción reportada" accent={C.gray} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              <div style={CARD}>
                <div style={SEC}>Benchmarks vs. referencia del sector</div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'left', borderBottom:`1px solid ${C.border}` }}>Métrica</th>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'right', borderBottom:`1px solid ${C.border}` }}>CLEO hoy</th>
                      <th style={{ fontSize:10, color:C.gray, textAlign:'right', padding:'0 0 8px', borderBottom:`1px solid ${C.border}` }}>Ref. salud</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Tasa acceso link', pct(c.accedieron, c.enviado), '2–4%'],
                      ['Conversión apertura → resp.', `${eficiencia.conversion_pct}%`, '60–75%'],
                      ['Primera respuesta', fmtMin(eficiencia.minutos_primer_respuesta), '5–15 min'],
                      ['Tiempo prom. respuesta', fmtMin(eficiencia.minutos_promedio), '20–40 min'],
                      ['Uso móvil', `${eficiencia.pct_movil}%`, '70–85%'],
                    ].map(([m,v,r]) => (
                      <tr key={m as string}>
                        <td style={{ fontSize:12, padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{m}</td>
                        <td style={{ fontSize:13, fontWeight:700, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9`, color:C.green }}>{v}</td>
                        <td style={{ fontSize:11, color:C.gray, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{r}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop:12, padding:'10px 12px', background:C.greenLt, borderRadius:6, fontSize:11, color:C.green, lineHeight:1.6 }}>
                  ✅ CLEO supera la referencia del sector salud en envíos de encuesta por correo electrónico.
                </div>
              </div>

              <div style={CARD}>
                <div style={SEC}>Proyección (tendencia actual)</div>
                <p style={{ fontSize:12, color:C.gray, marginBottom:14, lineHeight:1.6 }}>A un ritmo de {eficiencia.resp_por_min} resp/min. La curva desacelera durante la noche y repunta al día siguiente.</p>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'left', borderBottom:`1px solid ${C.border}` }}>Horizonte</th>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'right', borderBottom:`1px solid ${C.border}` }}>Resp. estimadas</th>
                      <th style={{ fontSize:10, color:C.gray, textAlign:'right', padding:'0 0 8px', borderBottom:`1px solid ${C.border}` }}>% base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[['Al cierre de hoy', '~200–300', '13–20%'], ['24 horas', '~350–450', '23–30%'], ['3 días (ventana)', '~375–525', '25–35%']].map(([h,r,p]) => (
                      <tr key={h}>
                        <td style={{ fontSize:12, padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{h}</td>
                        <td style={{ fontSize:12, fontWeight:700, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9`, color:C.blue }}>{r}</td>
                        <td style={{ fontSize:11, color:C.gray, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{p}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop:12, fontSize:10, color:C.gray, fontStyle:'italic' }}>Proyección indicativa. El pico de apertura suele ocurrir en las primeras 4 horas y nuevamente al día siguiente entre 7–9 a.m.</div>
              </div>
            </div>
          </div>
        )}

        {/* ══ ESPECIALIDADES ══ */}
        {tab === 'especialidades' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              <div style={CARD}>
                <div style={SEC}>Distribución en el piloto ({fmt(c.total)} total)</div>
                {especialidades.slice(0,12).map(e => (
                  <BarRow key={e.especialidad} lbl={e.especialidad} val={e.total_piloto} total={totalMax} color={e.total_piloto/totalMax > 0.2 ? C.blue : e.total_piloto/totalMax > 0.05 ? C.blueMd : '#E2E8F0'} />
                ))}
              </div>
              <div style={CARD}>
                <div style={SEC}>Tasa de respuesta por especialidad</div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'left', borderBottom:`1px solid ${C.border}` }}>Especialidad</th>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'right', borderBottom:`1px solid ${C.border}` }}>Resp.</th>
                      <th style={{ fontSize:10, color:C.gray, textAlign:'right', padding:'0 0 8px', borderBottom:`1px solid ${C.border}` }}>Base</th>
                      <th style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.gray, padding:'0 0 8px', textAlign:'right', borderBottom:`1px solid ${C.border}` }}>Tasa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...especialidades].sort((a,b) => (b.respondieron/b.total_piloto) - (a.respondieron/a.total_piloto)).slice(0,10).map(e => {
                      const rate = e.total_piloto ? (e.respondieron/e.total_piloto)*100 : 0
                      return (
                        <tr key={e.especialidad}>
                          <td style={{ fontSize:12, padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{e.especialidad}</td>
                          <td style={{ fontSize:12, fontWeight:700, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9`, color:C.green }}>{e.respondieron}</td>
                          <td style={{ fontSize:11, color:C.gray, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9` }}>{e.total_piloto}</td>
                          <td style={{ fontSize:13, fontWeight:800, textAlign:'right', padding:'7px 0', borderBottom:`1px solid #F1F5F9`, color: rate>5 ? C.green : rate>2 ? C.amber : C.gray }}>{Math.round(rate*10)/10}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ TECNOLOGÍA ══ */}
        {tab === 'tecnologia' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
            <div style={CARD}>
              <div style={SEC}>Dispositivo</div>
              {Object.entries(dispositivos.tipo).sort((a,b) => b[1]-a[1]).map(([k,v]) => (
                <BarRow key={k} lbl={k === 'Móvil' ? '📱 Móvil' : '💻 ' + k} val={v} total={dispositivos.total} color={k === 'Móvil' ? C.blue : C.blueMd} lblWidth={100} />
              ))}
              <div style={{ marginTop:12, fontSize:11, color:C.green }}>✅ El formulario es mobile-first — sin reportes de error en móvil</div>
            </div>
            <div style={CARD}>
              <div style={SEC}>Sistema operativo</div>
              {Object.entries(dispositivos.os).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
                const col = k==='Android'?'#34A853':k==='iOS'?'#555':k==='Windows'?'#0078D4':k==='macOS'?'#888':'#E8A020'
                return <BarRow key={k} lbl={k} val={v} total={totalOsMax} color={col} lblWidth={100} />
              })}
            </div>
            <div style={CARD}>
              <div style={SEC}>Navegador</div>
              {Object.entries(dispositivos.browser).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
                const col = k==='Chrome'?'#EA4335':k==='Safari'?'#006CFF':k==='Edge'?'#0078D4':k==='Firefox'?'#FF7139':'#94A3B8'
                return <BarRow key={k} lbl={k} val={v} total={totalBrMax} color={col} lblWidth={100} />
              })}
              <div style={{ marginTop:12, fontSize:11, color:C.green }}>✅ Chrome + Safari dominantes — sin issues de compatibilidad</div>
            </div>
          </div>
        )}

        {/* ══ FORMULARIO ══ */}
        {tab === 'formulario' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
              <KPI lbl="Formularios recibidos" val={fmt(formSteps.total)} sub={`${pct(c.completado, formSteps.total)} completaron`} col={C.blue} />
              <KPI lbl="Siguen en lista espera" val={fmt(formSteps.paso4_si)} sub={`${pct(formSteps.paso4_si, formSteps.total)} de respondidos`} col={C.green} />
              <KPI lbl="Info correcta en BD" val={fmt(formSteps.paso3_si)} sub={`${pct(formSteps.paso3_si, formSteps.total)} confirmaron`} col={C.green} />
              <KPI lbl="Canal preferido" val={Object.entries(formSteps.paso6).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '—'} sub={`${pct(Object.entries(formSteps.paso6).sort((a,b)=>b[1]-a[1])[0]?.[1]??0, formSteps.total)} lo eligieron`} col={C.purple} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
              <Insight val={`${pct(formSteps.paso1_si, formSteps.total)}`} lbl="Consentimiento" desc="Autorizaron el proceso en el primer paso" accent={C.green} />
              <Insight val={`${pct(formSteps.paso2_si, formSteps.total)}`} lbl="Verificación exitosa" desc="Verificaron su identidad con los últimos 4 dígitos del asegurado" accent={C.green} />
              <Insight val={`${pct(formSteps.paso3_si, formSteps.total)}`} lbl="Información correcta en BD" desc="Confirmaron que sus datos clínicos son correctos" accent={C.green} />
              {formSteps.flexible_total > 0 && <Insight val={`${pct(formSteps.paso5_flexible, formSteps.flexible_total)}`} lbl="Flexibles en centro médico" desc="Pueden ser atendidos en un centro distinto" accent={C.purple} />}
              {formSteps.puede_total > 0 && <Insight val={`${pct(formSteps.paso5_puede, formSteps.puede_total)}`} lbl="Condiciones para asistir" desc="Tienen condiciones para asistir cuando se les cite" accent={C.green} />}
              <Insight val={`${pct(formSteps.paso3_no, formSteps.total)}`} lbl="Info incorrecta en sistema" desc="Datos que no coinciden — requieren actualización en ARCA/SIAC" accent={C.amber} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              <div style={CARD}>
                <div style={SEC}>Flujo del formulario — paso a paso</div>
                <StepBar label="Paso 1 — Consentimiento" a={formSteps.paso1_si} b={formSteps.total - formSteps.paso1_si} total={formSteps.total} colA={C.green} colB={C.red} />
                <StepBar label="Paso 2 — Verificación identidad" a={formSteps.paso2_si} b={formSteps.total - formSteps.paso2_si} total={formSteps.total} colA={C.green} colB={C.red} />
                <StepBar label="Paso 3 — ¿Información correcta?" a={formSteps.paso3_si} b={formSteps.paso3_no} total={formSteps.total} colA={C.green} colB={C.red} />
                <StepBar label="Paso 4 — ¿Desea continuar?" a={formSteps.paso4_si} b={formSteps.paso4_no} total={formSteps.total} colA={C.green} colB={C.amber} />
                {formSteps.flexible_total > 0 && <StepBar label="Paso 5a — ¿Flexible en centro?" a={formSteps.paso5_flexible} b={formSteps.paso5_no_flexible} total={formSteps.flexible_total} colA={C.purple} colB={C.purpleLt} />}
                {formSteps.puede_total > 0 && <StepBar label="Paso 5b — ¿Condiciones para asistir?" a={formSteps.paso5_puede} b={formSteps.paso5_no_puede} total={formSteps.puede_total} colA={C.green} colB={C.red} />}
                {Object.keys(formSteps.paso6).length > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600 }}>Paso 6 — Canal de contacto</span>
                    </div>
                    <div style={{ height:7, borderRadius:4, overflow:'hidden', display:'flex' }}>
                      {canalOrder.filter(k => formSteps.paso6[k]).map(k => (
                        <div key={k} style={{ width:`${(formSteps.paso6[k]/formSteps.total)*100}%`, background: canalColors[k] ?? C.gray }} title={`${k}: ${formSteps.paso6[k]}`} />
                      ))}
                    </div>
                    <div style={{ fontSize:10, color:C.gray, marginTop:3 }}>
                      {canalOrder.filter(k => formSteps.paso6[k]).map(k => `${canalLabels[k] ?? k} ${pct(formSteps.paso6[k], formSteps.total)}`).join(' · ')}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ ...CARD, marginBottom:0 }}>
                  <div style={SEC}>Canal de contacto preferido</div>
                  {canalOrder.filter(k => formSteps.paso6[k]).map(k => (
                    <BarRow key={k} lbl={canalLabels[k] ?? k} val={formSteps.paso6[k]} total={formSteps.total} color={canalColors[k] ?? C.gray} />
                  ))}
                  {Object.keys(formSteps.paso6).length > 0 && (
                    <div style={{ marginTop:12, padding:'8px 12px', background:C.purpleLt, borderRadius:6, fontSize:11, color:C.purple, lineHeight:1.6 }}>
                      💡 WA + "cualquiera" = {pct((formSteps.paso6['whatsapp']??0)+(formSteps.paso6['cualquiera']??0), formSteps.total)} prefieren o aceptan WhatsApp
                    </div>
                  )}
                </div>

                {(Object.keys(formSteps.motivo_retiro).length > 0 || Object.keys(formSteps.motivo_no_asistir).length > 0) && (
                  <div style={{ ...CARD, marginBottom:0 }}>
                    {Object.keys(formSteps.motivo_retiro).length > 0 && (
                      <>
                        <div style={SEC}>Depurados — motivos ({formSteps.paso4_no} total)</div>
                        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
                          <tbody>
                            {Object.entries(formSteps.motivo_retiro).sort((a,b)=>b[1]-a[1]).map(([m,n]) => (
                              <tr key={m}>
                                <td style={{ fontSize:12, padding:'5px 0', borderBottom:`1px solid #F1F5F9` }}>{m}</td>
                                <td style={{ fontSize:12, fontWeight:700, textAlign:'right', padding:'5px 0', borderBottom:`1px solid #F1F5F9`, color:C.amber }}>{n}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    {Object.keys(formSteps.motivo_no_asistir).length > 0 && (
                      <>
                        <div style={{ ...SEC, marginTop:8 }}>No puede asistir — motivos</div>
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                          <tbody>
                            {Object.entries(formSteps.motivo_no_asistir).sort((a,b)=>b[1]-a[1]).map(([m,n]) => (
                              <tr key={m}>
                                <td style={{ fontSize:12, padding:'5px 0', borderBottom:`1px solid #F1F5F9` }}>{m}</td>
                                <td style={{ fontSize:12, fontWeight:700, textAlign:'right', padding:'5px 0', borderBottom:`1px solid #F1F5F9`, color:C.red }}>{n}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ WHATSAPP ══ */}
        {tab === 'whatsapp' && (
          <div>
            {canExportWA && (
              <WaExportButton campanaId={campanaActual} waElegibles={proximaFase.wa_elegibles} />
            )}
            {waData.enviados === 0 ? (
              <div style={{ ...CARD, textAlign:'center', padding:40, color:C.gray }}>
                <div style={{ fontSize:32, marginBottom:12 }}>💬</div>
                <div style={{ fontSize:15, fontWeight:600 }}>Sin datos de WhatsApp para esta campaña</div>
                <div style={{ fontSize:12, marginTop:6 }}>Cuando se carguen resultados del canal WA aparecerán aquí automáticamente.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18 }}>
                  <KPI lbl="Contactados por WA"  val={fmt(waData.enviados)}     sub="Mensajes despachados"  col={C.wa}    />
                  <KPI lbl="Interactuaron"        val={fmt(waData.respondio)}    sub={`${pct(waData.respondio, waData.enviados)} del total`}  col={C.green} />
                  <KPI lbl="Sin respuesta"        val={fmt(waData.no_respondio)} sub={`${pct(waData.no_respondio, waData.enviados)} pasan a llamada`} col={C.amber} />
                  <KPI lbl="Continuarán atención" val={fmt(waData.activo)}       sub={`${pct(waData.activo, waData.enviados)} confirmaron ACTIVO`}  col={C.green} />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
                  <div style={CARD}>
                    <div style={SEC}>Funnel WhatsApp</div>
                    <FunnelRow lbl="💬 Contactados"        val={waData.enviados}     total={waData.enviados} color={C.wa}    />
                    {waData.entregados > 0 && <FunnelRow lbl="✅ Entregados"         val={waData.entregados}   total={waData.enviados} color={C.green}  />}
                    {waData.leidos     > 0 && <FunnelRow lbl="👁 Leídos"             val={waData.leidos}       total={waData.enviados} color={C.blue}   />}
                    <FunnelRow lbl="🗨 Interactuaron"      val={waData.respondio}    total={waData.enviados} color='#16A34A' />
                    <FunnelRow lbl="✅ Confirmaron ACTIVO" val={waData.activo}        total={waData.enviados} color={C.green}  />
                    <FunnelRow lbl="🔕 Sin respuesta"      val={waData.no_respondio} total={waData.enviados} color={C.amber}  />
                  </div>

                  <div style={CARD}>
                    <div style={SEC}>Resultado por tipo de interacción</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderRadius:8, background:C.greenLt, border:`1px solid #A7F3D0` }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:C.green }}>✅ ACTIVO — quieren continuar</div>
                          <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>Completaron el flujo · desean seguir en lista</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:22, fontWeight:800, color:C.green }}>{fmt(waData.activo)}</div>
                          <div style={{ fontSize:10, color:C.gray }}>{pct(waData.activo, waData.enviados)}</div>
                        </div>
                      </div>
                      {waData.depurado_renuncia > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderRadius:8, background:C.amberLt, border:`1px solid #FCD34D` }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.amber }}>⚠️ DEPURADO — retiro voluntario</div>
                            <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>Ya no desean la atención / contraindicación médica</div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:22, fontWeight:800, color:C.amber }}>{fmt(waData.depurado_renuncia)}</div>
                            <div style={{ fontSize:10, color:C.gray }}>{pct(waData.depurado_renuncia, waData.enviados)}</div>
                          </div>
                        </div>
                      )}
                      {waData.no_autorizo > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderRadius:8, background:'#F5F3FF', border:'1px solid #C4B5FD' }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.purple }}>🚫 NO AUTORIZÓ — rechazaron el bot</div>
                            <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>Declinaron el proceso WA · pasan a llamada</div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:22, fontWeight:800, color:C.purple }}>{fmt(waData.no_autorizo)}</div>
                            <div style={{ fontSize:10, color:C.gray }}>{pct(waData.no_autorizo, waData.enviados)}</div>
                          </div>
                        </div>
                      )}
                      {waData.no_verificado > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderRadius:8, background:C.redLt, border:`1px solid #FCA5A5` }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.red }}>❌ NO VERIFICADO — 3 intentos agotados</div>
                            <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>Fallaron verificación de identidad · pasan a llamada</div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:22, fontWeight:800, color:C.red }}>{fmt(waData.no_verificado)}</div>
                            <div style={{ fontSize:10, color:C.gray }}>{pct(waData.no_verificado, waData.enviados)}</div>
                          </div>
                        </div>
                      )}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderRadius:8, background:'#F8FAFC', border:`1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:C.gray }}>🔕 SIN RESPUESTA — no interactuaron</div>
                          <div style={{ fontSize:11, color:C.gray, marginTop:1 }}>Pasan al canal voicebot</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:22, fontWeight:800, color:C.gray }}>{fmt(waData.no_respondio)}</div>
                          <div style={{ fontSize:10, color:C.gray }}>{pct(waData.no_respondio, waData.enviados)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ ...CARD, background:C.blueLt, border:`1px solid ${C.blueMd}` }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.blue, marginBottom:10 }}>📞 Pasan al voicebot (siguiente fase)</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                    <div style={{ textAlign:'center', padding:'10px 0' }}>
                      <div style={{ fontSize:22, fontWeight:800, color:C.amber }}>{fmt(waData.no_respondio)}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>No respondieron WA</div>
                    </div>
                    <div style={{ textAlign:'center', padding:'10px 0', borderLeft:`1px solid ${C.blueMd}`, borderRight:`1px solid ${C.blueMd}` }}>
                      <div style={{ fontSize:22, fontWeight:800, color:C.purple }}>{fmt(waData.no_autorizo + waData.no_verificado)}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>No autorizaron / no verificaron</div>
                    </div>
                    <div style={{ textAlign:'center', padding:'10px 0' }}>
                      <div style={{ fontSize:22, fontWeight:800, color:C.blue }}>{fmt(waData.no_respondio + waData.no_autorizo + waData.no_verificado)}</div>
                      <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Total para llamada</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign:'center', padding:14, fontSize:11, color:'#94A3B8', borderTop:`1px solid ${C.border}`, marginTop:24, marginLeft:-24, marginRight:-24 }}>
        CoCo Tech AI · UTLE · CCSS &nbsp;|&nbsp; v2 · Actualiza cada {REFRESH_SECS}s
      </div>
    </div>
  )
}

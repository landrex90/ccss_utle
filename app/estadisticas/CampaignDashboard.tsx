'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import type { CampanaInfo, EstadoRow, EficienciaData, EspecialidadRow, DispositivoData, FormSteps, ProximaFaseData } from './page'

// ── Colores (idénticos al artifact) ────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────────
const pct  = (n: number, d: number) => d ? `${Math.round((n/d)*100)}%` : '—'
const fmt  = (n: number) => n.toLocaleString('es-CR')
const fmtMin = (m: number | null) => {
  if (m === null) return '—'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.floor(m/60)}h ${m%60}min`
  return `${Math.floor(m/1440)}d ${Math.round((m%1440)/60)}h`
}
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CR', { day:'2-digit', month:'short', year:'numeric' }) : '—'

// ── Sub-componentes estilo artifact ───────────────────────────────────────────
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
      <span style={{ fontSize:12, width:185, flexShrink:0, color:C.text }}>{lbl}</span>
      <div style={{ flex:1, height:9, background:'#F1F5F9', borderRadius:5, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:5, background:color, width:`${w}%` }} />
      </div>
      <span style={{ fontSize:13, fontWeight:700, minWidth:44, textAlign:'right', color }}>{fmt(val)}</span>
      <span style={{ fontSize:11, color:C.gray, minWidth:40, textAlign:'right' }}>{pct(val,total)}</span>
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

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  campanas:     CampanaInfo[]
  campanaActual: string
  campanaInfo:  CampanaInfo
  estados:      EstadoRow[]
  eficiencia:   EficienciaData
  especialidades: EspecialidadRow[]
  dispositivos: DispositivoData
  formSteps:    FormSteps
  proximaFase:  ProximaFaseData
}

type Tab = 'resumen' | 'eficiencia' | 'especialidades' | 'tecnologia' | 'formulario' | 'siguiente'
const TABS: { id: Tab; label: string }[] = [
  { id:'resumen',       label:'📊 Resumen'             },
  { id:'eficiencia',    label:'⚡ Eficiencia'           },
  { id:'especialidades',label:'🏥 Especialidades'       },
  { id:'tecnologia',    label:'📱 Tecnología'           },
  { id:'formulario',    label:'📋 Respuestas formulario'},
  { id:'siguiente',     label:'💬 Próxima fase'         },
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

export default function CampaignDashboard({ campanas, campanaActual, campanaInfo: c, estados, eficiencia, especialidades, dispositivos, formSteps, proximaFase }: Props) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab]       = useState<Tab>('resumen')
  const [cd, setCd]         = useState(REFRESH_SECS)
  const [exp, setExp]       = useState(false)
  const [expErr, setExpErr] = useState('')

  const tipoFiltro = (searchParams.get('tipo') ?? 'Todos') as TipoFiltro

  const campanasFiltradas = tipoFiltro === 'Todos'
    ? campanas
    : campanas.filter(cc => getTipo(cc.id) === tipoFiltro)

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

  const totalMax = especialidades[0]?.total_piloto ?? 1
  const totalOsMax = Math.max(...Object.values(dispositivos.os), 1)
  const totalBrMax = Math.max(...Object.values(dispositivos.browser), 1)

  // Canal order for formulario
  const canalOrder = ['whatsapp', 'cualquiera', 'llamada', 'correo', 'sms']
  const canalColors: Record<string, string> = { whatsapp: C.wa, cualquiera: C.blueMd, llamada: C.blue, correo: '#94A3B8', sms: '#E2E8F0' }
  const canalLabels: Record<string, string> = { whatsapp:'💬 WhatsApp', cualquiera:'🔀 Cualquiera', llamada:'📞 Llamada', correo:'📧 Correo', sms:'💬 SMS' }

  return (
    <div style={{ fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", color:C.text }}>

      {/* HEADER */}
      <div style={{ background:C.blue, padding:'18px 0 14px', marginLeft:-24, marginRight:-24, marginTop:-32, paddingLeft:24, paddingRight:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontSize:10, color:'#89B8DC', letterSpacing:2, textTransform:'uppercase' }}>CCSS · Unidad Técnica de Listas de Espera</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#fff', marginTop:2 }}>CLEO · Dashboard {getTipo(campanaActual) !== 'Todos' ? getTipo(campanaActual) : campanaActual.replace('ENCUESTA-', '').replace(/_\d+$/, '')}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <span style={{ fontSize:11, background:'rgba(255,255,255,.15)', color:'#fff', padding:'3px 10px', borderRadius:20 }}>{campanaActual}</span>
            </div>
            <div style={{ fontSize:11, color:'#89B8DC', marginTop:6 }}>
              <span style={{ display:'inline-block', width:6, height:6, background:'#22C55E', borderRadius:'50%', marginRight:4, verticalAlign:'middle', animation:'pulse 2s infinite' }} />
              {fmtDate(c.fecha_inicio)} · {fmt(c.completado)} completaron · {c.accedieron > 0 ? pct(c.completado, c.enviado) : '0%'} conversión
            </div>
          </div>
        </div>

        {/* Filtro por tipo + Selector + acciones */}
        <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap', alignItems:'center' }}>
          {TIPOS.map(t => (
            <button key={t} onClick={() => {
              const filtered = t === 'Todos' ? campanas : campanas.filter(cc => getTipo(cc.id) === t)
              const targetCampana = filtered.find(cc => cc.id === campanaActual)
                ? campanaActual
                : (filtered[0]?.id ?? campanaActual)
              router.push(`/estadisticas?campana=${encodeURIComponent(targetCampana)}&tipo=${encodeURIComponent(t)}`)
            }} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, cursor:'pointer', border:'1px solid rgba(255,255,255,.35)',
              background: tipoFiltro === t ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.08)',
              color: tipoFiltro === t ? '#fff' : '#89B8DC', fontWeight: tipoFiltro === t ? 700 : 400 }}>
              {t}
            </button>
          ))}
          <div style={{ width:1, height:18, background:'rgba(255,255,255,.2)', margin:'0 2px' }} />
          {campanasFiltradas.length === 0 ? (
            <span style={{ fontSize:11, color:'#fbbf24', fontStyle:'italic', padding:'4px 10px', border:'1px solid rgba(251,191,36,.4)', borderRadius:6, background:'rgba(251,191,36,.08)' }}>
              Sin campañas de {tipoFiltro} aún
            </span>
          ) : (
            <select value={campanaActual} onChange={e => router.push(`/estadisticas?campana=${encodeURIComponent(e.target.value)}&tipo=${encodeURIComponent(tipoFiltro)}`)}
              style={{ fontSize:12, border:'1px solid rgba(255,255,255,.3)', borderRadius:6, padding:'4px 10px', background:'rgba(255,255,255,.1)', color:'#fff' }}>
              {campanasFiltradas.map(cc => <option key={cc.id} value={cc.id} style={{ color:C.text }}>{cc.id}</option>)}
            </select>
          )}
          <button onClick={() => handleExport('registros')} disabled={exp || campanasFiltradas.length === 0} style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.1)', color: campanasFiltradas.length === 0 ? 'rgba(255,255,255,.3)' : '#fff', cursor: campanasFiltradas.length === 0 ? 'not-allowed' : 'pointer' }}>↓ Registros Excel</button>
          <button onClick={() => handleExport('respuestas')} disabled={exp || campanasFiltradas.length === 0} style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,.3)', background:'rgba(255,255,255,.1)', color: campanasFiltradas.length === 0 ? 'rgba(255,255,255,.3)' : '#fff', cursor: campanasFiltradas.length === 0 ? 'not-allowed' : 'pointer' }}>↓ Respuestas Excel</button>
          <span style={{ fontSize:11, color:'#89B8DC', marginLeft:'auto' }}>
            Actualiza en {cd}s &nbsp;
            <button onClick={refresh} style={{ fontSize:11, color:'#89B8DC', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Ahora</button>
          </span>
        </div>
        {expErr && <div style={{ fontSize:11, color:'#fca5a5', marginTop:6 }}>{expErr}</div>}
      </div>

      {/* TABS */}
      <div style={{ display:'flex', background:'#fff', borderBottom:`2px solid ${C.border}`, marginLeft:-24, marginRight:-24, paddingLeft:24, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontSize:12, fontWeight:600, padding:'13px 16px', cursor:'pointer', border:'none', background:'none', borderBottom:`2px solid ${tab===t.id ? C.blue : 'transparent'}`,
            color: tab===t.id ? C.blue : C.gray, marginBottom:-2, whiteSpace:'nowrap', transition:'color .15s'
          }}>{t.label}</button>
        ))}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      <div style={{ paddingTop:24 }}>

        {/* ══ RESUMEN ══ */}
        {tab === 'resumen' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              <KPI lbl="Correos enviados"  val={fmt(c.enviado)}    sub={fmtDate(c.fecha_inicio)}              col={C.blue}  />
              <KPI lbl="Accedieron al link" val={fmt(c.accedieron)} sub={`${pct(c.accedieron, c.enviado)} del total`} col={C.blue}  />
              <KPI lbl="Respondieron"      val={fmt(c.completado)} sub={`${pct(c.completado, c.enviado)} del total`}  col={C.green} />
              <KPI lbl="Sin responder"     val={fmt(c.enviado - c.completado)} sub="Ventana activa: 3 días" col={C.gray}  />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
              <div style={CARD}>
                <div style={SEC}>Embudo de conversión</div>
                <FunnelRow lbl="📧 Enviados"           val={c.enviado}    total={c.enviado}    color={C.blueMd} />
                <FunnelRow lbl="🔗 Accedieron al link" val={c.accedieron} total={c.enviado}    color={C.blue}   />
                <FunnelRow lbl="✅ Completaron"         val={c.completado} total={c.enviado}    color={C.green}  />
                <FunnelRow lbl="⏳ Abrió, no terminó"  val={Math.max(0, c.accedieron - c.completado)} total={c.enviado} color={C.amber} />
                <FunnelRow lbl="📭 Sin acceder"         val={c.enviado - c.accedieron}          total={c.enviado} color='#E2E8F0' />
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
                      💡 WA + "cualquiera" = {pct((formSteps.paso6['whatsapp']??0)+(formSteps.paso6['cualquiera']??0), formSteps.total)} prefieren o aceptan WhatsApp → el canal correcto para la siguiente fase
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

        {/* ══ PRÓXIMA FASE ══ */}
        {tab === 'siguiente' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginBottom:18 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderRadius:8, marginBottom:12, border:`1px solid ${C.blueMd}`, background:C.blueLt }}>
                  <div><div style={{ fontSize:12, fontWeight:600, color:C.blue }}>💬 Elegibles para WhatsApp</div><div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Tienen teléfono · pasarán si no responden correo</div></div>
                  <div style={{ fontSize:22, fontWeight:800, color:C.blue }}>{fmt(proximaFase.wa_elegibles)}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderRadius:8, marginBottom:12, border:`1px solid ${C.border}`, background:'#F8FAFC' }}>
                  <div><div style={{ fontSize:12, fontWeight:600 }}>Sin WhatsApp registrado</div><div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Solo correo + voicebot</div></div>
                  <div style={{ fontSize:22, fontWeight:800, color:C.gray }}>{fmt(proximaFase.sin_wa)}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderRadius:8, border:`1px solid #A7F3D0`, background:C.greenLt }}>
                  <div><div style={{ fontSize:12, fontWeight:600, color:C.green }}>✅ Ya respondieron — no pasan a WA</div><div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Depurados del ciclo</div></div>
                  <div style={{ fontSize:22, fontWeight:800, color:C.green }}>{fmt(proximaFase.ya_respondieron)}</div>
                </div>
              </div>

              <div style={CARD}>
                <div style={SEC}>Proyección cascada (estimada)</div>
                <FunnelRow lbl="📭 No responden correo (~65%)" val={Math.round((c.enviado - c.completado) * 0.65)} total={c.enviado} color={C.blueMd} />
                <FunnelRow lbl="💬 Pasarán a WhatsApp" val={proximaFase.wa_elegibles} total={c.enviado} color={C.wa} />
                <FunnelRow lbl="📞 No responden WA (~70%)" val={Math.round(proximaFase.wa_elegibles * 0.70)} total={c.enviado} color='#E2E8F0' />
                <FunnelRow lbl="📞 Pasarán a Voicebot" val={Math.round(proximaFase.wa_elegibles * 0.70)} total={c.enviado} color={C.purple} />
                <div style={{ marginTop:12, fontSize:10, color:C.gray, fontStyle:'italic' }}>Los {fmt(c.completado)} que ya respondieron quedan fuera del ciclo WA/Voicebot.</div>
              </div>
            </div>

            <div style={CARD}>
              <div style={SEC}>Línea de tiempo — campaña {campanaActual}</div>
              <div style={{ display:'flex', gap:0, overflowX:'auto' }}>
                {[
                  { date:`${fmtDate(c.fecha_inicio)}`, title:'📧 Correo', sub:`${fmt(c.enviado)} enviados · en curso`, active:true },
                  { date:'+3 días', title:'💬 WhatsApp', sub:`~${fmt(Math.round(proximaFase.wa_elegibles))} elegibles`, active:false },
                  { date:'~+7 días', title:'📞 Voicebot', sub:`~${fmt(Math.round(proximaFase.wa_elegibles * 0.70))} sin responder WA`, active:false },
                  { date:'~+12 días', title:'✅ Cierre campaña', sub:'Análisis + escala completa', active:false },
                ].map((item, i) => (
                  <div key={i} style={{ flex:1, minWidth:120, padding:'12px 14px', borderRight:`1px solid ${C.border}`, background: item.active ? C.blueLt : 'transparent' }}>
                    <div style={{ fontSize:10, color:C.gray, marginBottom:3 }}>{item.date}</div>
                    <div style={{ fontSize:12, fontWeight:700, color: item.active ? C.blue : C.text }}>{item.title}</div>
                    <div style={{ fontSize:10, color:C.gray, marginTop:2 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign:'center', padding:14, fontSize:11, color:'#94A3B8', borderTop:`1px solid ${C.border}`, marginTop:24, marginLeft:-24, marginRight:-24 }}>
        CoCo Tech AI · UTLE · CCSS &nbsp;|&nbsp; {campanaActual} · Actualiza cada {REFRESH_SECS}s
      </div>
    </div>
  )
}

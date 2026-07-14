import { createClient } from '@/lib/supabase/server'
import CampaignDashboard from './CampaignDashboard'

export const dynamic = 'force-dynamic'

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface CampanaInfo {
  id: string
  total: number
  enviado: number
  accedieron: number
  completado: number
  fecha_inicio: string | null
}

export interface EstadoRow { estado: string; count: number }

export interface EficienciaData {
  minutos_primer_respuesta: number | null
  minutos_promedio: number | null
  conversion_pct: number
  resp_por_min: number
  minutos_transcurridos: number | null
  pct_movil: number
}

export interface EspecialidadRow {
  especialidad: string
  total_piloto: number
  respondieron: number
}

export interface DispositivoData {
  tipo:    Record<string, number>
  os:      Record<string, number>
  browser: Record<string, number>
  total:   number
}

export interface FormSteps {
  total: number
  paso1_si: number
  paso2_si: number
  paso3_si: number
  paso3_no: number
  paso4_si: number
  paso4_no: number
  paso5_flexible: number
  paso5_no_flexible: number
  paso5_puede: number
  paso5_no_puede: number
  paso6: Record<string, number>
  motivo_retiro: Record<string, number>
  motivo_no_asistir: Record<string, number>
  flexible_total: number
  puede_total: number
}

export interface ProximaFaseData {
  wa_elegibles: number
  sin_wa: number
  ya_respondieron: number
}

// ── Helpers de paginación ──────────────────────────────────────────────────────
async function paginateRegistros(sb: ReturnType<typeof createClient>, campanaId: string, columns: string) {
  const rows: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data } = await sb.from('registros').select(columns)
      .eq('encuesta_campana_id', campanaId).range(from, from + 999)
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function paginateRespuestas(sb: ReturnType<typeof createClient>, ids: string[], columns: string) {
  if (ids.length === 0) return []
  const rows: Record<string, unknown>[] = []
  const CHUNK = 200  // avoid PostgREST URL length limit with large IN clauses
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    let from = 0
    while (true) {
      const { data } = await sb.from('respuestas').select(columns)
        .in('id_registro', chunk).range(from, from + 999)
      if (!data || data.length === 0) break
      rows.push(...(data as unknown as Record<string, unknown>[]))
      if (data.length < 1000) break
      from += 1000
    }
  }
  return rows
}

// ── Queries ────────────────────────────────────────────────────────────────────
async function getCampanas(): Promise<CampanaInfo[]> {
  const sb = createClient()
  const { data: ids } = await sb.from('registros').select('encuesta_campana_id').not('encuesta_campana_id', 'is', null)
  if (!ids || ids.length === 0) return []
  const uniqueIds = Array.from(new Set(ids.map(r => r.encuesta_campana_id as string)))

  const campanas = await Promise.all(uniqueIds.map(async id => {
    const [{ count: total }, { count: enviado }, { count: accedieron }, { count: completado }, { data: f }] = await Promise.all([
      sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', id),
      sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', id).eq('correo_estado', 'enviado'),
      sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', id).not('primer_acceso_at', 'is', null),
      sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', id).not('encuesta_completada_at', 'is', null),
      sb.from('registros').select('correo_enviado_at').eq('encuesta_campana_id', id).not('correo_enviado_at', 'is', null).order('correo_enviado_at', { ascending: true }).limit(1),
    ])
    return { id, total: total ?? 0, enviado: enviado ?? 0, accedieron: accedieron ?? 0, completado: completado ?? 0, fecha_inicio: f?.[0]?.correo_enviado_at ?? null }
  }))
  return campanas.sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''))
}

async function getEstados(sb: ReturnType<typeof createClient>, campanaId: string): Promise<EstadoRow[]> {
  const rows = await paginateRegistros(sb, campanaId, 'estado')
  const map: Record<string, number> = {}
  for (const r of rows) {
    const e = (r.estado as string) ?? 'DESCONOCIDO'
    map[e] = (map[e] ?? 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([estado, count]) => ({ estado, count }))
}

async function getEficiencia(sb: ReturnType<typeof createClient>, campanaId: string, c: CampanaInfo): Promise<EficienciaData> {
  const tiempos = (await paginateRegistros(sb, campanaId, 'correo_enviado_at,encuesta_completada_at,primer_acceso_dispositivo'))
    .filter(r => r.encuesta_completada_at !== null && r.correo_enviado_at !== null)

  let minutos_primer_respuesta: number | null = null
  let minutos_promedio: number | null = null
  let pct_movil = 0
  let resp_por_min = 0

  if (tiempos && tiempos.length > 0) {
    const diffs = tiempos.map(r => (new Date(r.encuesta_completada_at as string).getTime() - new Date(r.correo_enviado_at as string).getTime()) / 60000)
      .filter(d => d > 0 && d < 10080)
    if (diffs.length > 0) {
      minutos_primer_respuesta = Math.round(Math.min(...diffs))
      minutos_promedio = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
    }
    const moviles = tiempos.filter(r => typeof r.primer_acceso_dispositivo === 'string' && (r.primer_acceso_dispositivo as string).startsWith('Móvil')).length
    pct_movil = Math.round((moviles / tiempos.length) * 100)
  }

  let minutos_transcurridos: number | null = null
  if (c.fecha_inicio) {
    minutos_transcurridos = Math.round((Date.now() - new Date(c.fecha_inicio).getTime()) / 60000)
    if (minutos_transcurridos > 0 && c.completado > 0) {
      resp_por_min = Math.round((c.completado / minutos_transcurridos) * 100) / 100
    }
  }

  const conversion_pct = c.accedieron > 0 ? Math.round((c.completado / c.accedieron) * 100) : 0
  return { minutos_primer_respuesta, minutos_promedio, conversion_pct, resp_por_min, minutos_transcurridos, pct_movil }
}

async function getEspecialidades(sb: ReturnType<typeof createClient>, campanaId: string): Promise<EspecialidadRow[]> {
  const todos = await paginateRegistros(sb, campanaId, 'id_registro,especialidad,encuesta_completada_at')
  const map: Record<string, { total: number; resp: number }> = {}
  for (const r of todos) {
    const esp = (r.especialidad as string) ?? 'Sin datos'
    if (!map[esp]) map[esp] = { total: 0, resp: 0 }
    map[esp].total++
    if (r.encuesta_completada_at) map[esp].resp++
  }
  return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
    .map(([especialidad, v]) => ({ especialidad, total_piloto: v.total, respondieron: v.resp }))
}

async function getDispositivos(sb: ReturnType<typeof createClient>, campanaId: string): Promise<DispositivoData> {
  const rows = await paginateRegistros(sb, campanaId, 'primer_acceso_dispositivo')
  const data = rows.filter(r => r.primer_acceso_dispositivo !== null)
  const tipo: Record<string, number> = {}
  const os:   Record<string, number> = {}
  const browser: Record<string, number> = {}
  let total = 0
  for (const r of data) {
    const d = (r.primer_acceso_dispositivo as string).split(' / ')
    const t = d[0] ?? 'Desconocido'
    const o = d[1] ?? 'Desconocido'
    const b = d[2] ?? 'Desconocido'
    tipo[t]    = (tipo[t]    ?? 0) + 1
    os[o]      = (os[o]      ?? 0) + 1
    browser[b] = (browser[b] ?? 0) + 1
    total++
  }
  return { tipo, os, browser, total }
}

async function getFormSteps(sb: ReturnType<typeof createClient>, campanaId: string): Promise<FormSteps> {
  const idRows = await paginateRegistros(sb, campanaId, 'id_registro')
  const idList = idRows.map(r => r.id_registro as string)
  if (!idList.length) return { total:0, paso1_si:0, paso2_si:0, paso3_si:0, paso3_no:0, paso4_si:0, paso4_no:0, paso5_flexible:0, paso5_no_flexible:0, paso5_puede:0, paso5_no_puede:0, paso6:{}, motivo_retiro:{}, motivo_no_asistir:{}, flexible_total:0, puede_total:0 }

  const rows = await paginateRespuestas(sb, idList,
    'paso_1_consentimiento,paso_2_verificacion,paso_3_info_correcta,paso_4_desea_continuar,motivo_retiro,paso_5a_flexibilidad_centro,paso_5b_condiciones_asistir,paso_5b_motivo_no_asistir,paso_6_medio_contacto'
  )

  let paso1_si=0, paso2_si=0, paso3_si=0, paso3_no=0, paso4_si=0, paso4_no=0
  let paso5_flexible=0, paso5_no_flexible=0, paso5_puede=0, paso5_no_puede=0
  let flexible_total=0, puede_total=0
  const paso6: Record<string, number> = {}
  const motivo_retiro: Record<string, number> = {}
  const motivo_no_asistir: Record<string, number> = {}

  for (const r of rows) {
    if (r.paso_1_consentimiento    === 'si_autorizo') paso1_si++
    if (r.paso_2_verificacion      === 'exitosa') paso2_si++
    if (r.paso_3_info_correcta     === 'si') paso3_si++
    else if (r.paso_3_info_correcta === 'no') paso3_no++
    if (r.paso_4_desea_continuar   === 'si') {
      paso4_si++
      if (r.paso_5a_flexibilidad_centro !== undefined && r.paso_5a_flexibilidad_centro !== null) {
        flexible_total++
        if (r.paso_5a_flexibilidad_centro === 'si') paso5_flexible++
        else paso5_no_flexible++
      }
      if (r.paso_5b_condiciones_asistir !== undefined && r.paso_5b_condiciones_asistir !== null) {
        puede_total++
        if (r.paso_5b_condiciones_asistir === 'si') paso5_puede++
        else paso5_no_puede++
      }
    } else if (r.paso_4_desea_continuar === 'no_ya_no_deseo' || r.paso_4_desea_continuar === 'no_asegurado') {
      paso4_no++
      const m = (r.motivo_retiro as string) ?? 'Sin especificar'
      if (m) motivo_retiro[m] = (motivo_retiro[m] ?? 0) + 1
    }
    if (r.paso_5b_motivo_no_asistir) {
      const m = r.paso_5b_motivo_no_asistir as string
      motivo_no_asistir[m] = (motivo_no_asistir[m] ?? 0) + 1
    }
    const medio = (r.paso_6_medio_contacto as string) ?? null
    if (medio) paso6[medio] = (paso6[medio] ?? 0) + 1
  }

  return { total: rows.length, paso1_si, paso2_si, paso3_si, paso3_no, paso4_si, paso4_no, paso5_flexible, paso5_no_flexible, paso5_puede, paso5_no_puede, paso6, motivo_retiro, motivo_no_asistir, flexible_total, puede_total }
}

async function getProximaFase(sb: ReturnType<typeof createClient>, campanaId: string, completado: number): Promise<ProximaFaseData> {
  // Pendientes con teléfono registrado → elegibles para WhatsApp
  const { count: con_tel } = await sb.from('registros')
    .select('*', { count: 'exact', head: true })
    .eq('encuesta_campana_id', campanaId)
    .is('encuesta_completada_at', null)
    .not('telefono', 'is', null)

  // Pendientes sin teléfono → solo correo + voicebot
  const { count: sin_tel } = await sb.from('registros')
    .select('*', { count: 'exact', head: true })
    .eq('encuesta_campana_id', campanaId)
    .is('encuesta_completada_at', null)
    .is('telefono', null)

  return {
    wa_elegibles: con_tel ?? 0,
    sin_wa:       sin_tel ?? 0,
    ya_respondieron: completado,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────
interface Props { searchParams: { campana?: string } }

export default async function EstadisticasPage({ searchParams }: Props) {
  const sb = createClient()
  const campanas     = await getCampanas()
  const campanaActual = searchParams.campana ?? campanas[0]?.id ?? null
  const campanaInfo  = campanas.find(c => c.id === campanaActual) ?? null

  if (!campanaInfo || !campanaActual) {
    return <div className="p-8 text-gray-500 text-center">No hay campañas registradas aún.</div>
  }

  const [estados, eficiencia, especialidades, dispositivos, formSteps, proximaFase] = await Promise.all([
    getEstados(sb, campanaActual),
    getEficiencia(sb, campanaActual, campanaInfo),
    getEspecialidades(sb, campanaActual),
    getDispositivos(sb, campanaActual),
    getFormSteps(sb, campanaActual),
    getProximaFase(sb, campanaActual, campanaInfo.completado),
  ])

  return (
    <CampaignDashboard
      campanas={campanas}
      campanaActual={campanaActual}
      campanaInfo={campanaInfo}
      estados={estados}
      eficiencia={eficiencia}
      especialidades={especialidades}
      dispositivos={dispositivos}
      formSteps={formSteps}
      proximaFase={proximaFase}
    />
  )
}

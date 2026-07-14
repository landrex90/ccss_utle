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

// ── Queries — todas usan RPC (sin límite de filas) ─────────────────────────────

async function getCampanas(): Promise<CampanaInfo[]> {
  const sb = createClient()
  const { data } = await sb.rpc('get_campanas_list')
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id:           r.id          as string,
    total:        Number(r.total),
    enviado:      Number(r.enviado),
    accedieron:   Number(r.accedieron),
    completado:   Number(r.completado),
    fecha_inicio: r.fecha_inicio as string | null,
  }))
}

async function getEstados(sb: ReturnType<typeof createClient>, campanaId: string): Promise<EstadoRow[]> {
  const { data } = await sb.rpc('get_campana_estados', { p_campana_id: campanaId })
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    estado: r.estado as string,
    count:  Number(r.count),
  }))
}

async function getEficiencia(sb: ReturnType<typeof createClient>, campanaId: string, c: CampanaInfo): Promise<EficienciaData> {
  const { data } = await sb.rpc('get_campana_eficiencia', { p_campana_id: campanaId })
  const row = (((data ?? []) as Record<string, unknown>[])[0]) ?? {}

  let minutos_transcurridos: number | null = null
  let resp_por_min = 0
  if (c.fecha_inicio) {
    minutos_transcurridos = Math.round((Date.now() - new Date(c.fecha_inicio).getTime()) / 60000)
    if (minutos_transcurridos > 0 && c.completado > 0) {
      resp_por_min = Math.round((c.completado / minutos_transcurridos) * 100) / 100
    }
  }

  return {
    minutos_primer_respuesta: row.minutos_primer_respuesta != null ? Math.round(Number(row.minutos_primer_respuesta)) : null,
    minutos_promedio:         row.minutos_promedio != null ? Math.round(Number(row.minutos_promedio)) : null,
    conversion_pct:           c.accedieron > 0 ? Math.round((c.completado / c.accedieron) * 100) : 0,
    resp_por_min,
    minutos_transcurridos,
    pct_movil:                Math.round(Number(row.pct_movil ?? 0)),
  }
}

async function getEspecialidades(sb: ReturnType<typeof createClient>, campanaId: string): Promise<EspecialidadRow[]> {
  const { data } = await sb.rpc('get_campana_especialidades', { p_campana_id: campanaId })
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    especialidad: r.especialidad as string,
    total_piloto: Number(r.total_piloto),
    respondieron: Number(r.respondieron),
  }))
}

async function getDispositivos(sb: ReturnType<typeof createClient>, campanaId: string): Promise<DispositivoData> {
  const { data } = await sb.rpc('get_campana_dispositivos', { p_campana_id: campanaId })
  const tipo: Record<string, number> = {}
  const os:   Record<string, number> = {}
  const browser: Record<string, number> = {}
  let total = 0
  for (const r of ((data ?? []) as Record<string, unknown>[])) {
    const parts = (r.dispositivo as string).split(' / ')
    const t = parts[0] ?? 'Desconocido'
    const o = parts[1] ?? 'Desconocido'
    const b = parts[2] ?? 'Desconocido'
    const n = Number(r.total)
    tipo[t]    = (tipo[t]    ?? 0) + n
    os[o]      = (os[o]      ?? 0) + n
    browser[b] = (browser[b] ?? 0) + n
    total += n
  }
  return { tipo, os, browser, total }
}

async function getFormSteps(sb: ReturnType<typeof createClient>, campanaId: string): Promise<FormSteps> {
  const { data } = await sb.rpc('get_campana_form_steps', { p_campana_id: campanaId })
  const d = (data ?? {}) as Record<string, unknown>
  return {
    total:             Number(d.total             ?? 0),
    paso1_si:          Number(d.paso1_si          ?? 0),
    paso2_si:          Number(d.paso2_si          ?? 0),
    paso3_si:          Number(d.paso3_si          ?? 0),
    paso3_no:          Number(d.paso3_no          ?? 0),
    paso4_si:          Number(d.paso4_si          ?? 0),
    paso4_no:          Number(d.paso4_no          ?? 0),
    paso5_flexible:    Number(d.paso5_flexible    ?? 0),
    paso5_no_flexible: Number(d.paso5_no_flexible ?? 0),
    paso5_puede:       Number(d.paso5_puede       ?? 0),
    paso5_no_puede:    Number(d.paso5_no_puede    ?? 0),
    flexible_total:    Number(d.flexible_total    ?? 0),
    puede_total:       Number(d.puede_total       ?? 0),
    paso6:             (d.paso6             ?? {}) as Record<string, number>,
    motivo_retiro:     (d.motivo_retiro     ?? {}) as Record<string, number>,
    motivo_no_asistir: (d.motivo_no_asistir ?? {}) as Record<string, number>,
  }
}

async function getProximaFase(sb: ReturnType<typeof createClient>, campanaId: string, completado: number): Promise<ProximaFaseData> {
  const { count: con_tel } = await sb.from('registros')
    .select('*', { count: 'exact', head: true })
    .eq('encuesta_campana_id', campanaId)
    .is('encuesta_completada_at', null)
    .not('telefono', 'is', null)

  const { count: sin_tel } = await sb.from('registros')
    .select('*', { count: 'exact', head: true })
    .eq('encuesta_campana_id', campanaId)
    .is('encuesta_completada_at', null)
    .is('telefono', null)

  return {
    wa_elegibles:    con_tel ?? 0,
    sin_wa:          sin_tel ?? 0,
    ya_respondieron: completado,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────
interface Props { searchParams: { campana?: string } }

export default async function EstadisticasPage({ searchParams }: Props) {
  const sb = createClient()
  const campanas      = await getCampanas()
  const campanaActual = searchParams.campana ?? campanas[0]?.id ?? null
  const campanaInfo   = campanas.find(c => c.id === campanaActual) ?? null

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

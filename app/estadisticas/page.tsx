import { createClient } from '@/lib/supabase/server'
import CampaignDashboard from './CampaignDashboard'

export const dynamic = 'force-dynamic'

export interface CampanaInfo {
  id: string
  total: number
  enviado: number
  accedieron: number   // primer_acceso_at IS NOT NULL (proxy "abrieron link")
  completado: number
  fecha_inicio: string | null
}

export interface DispositivoBreakdown {
  tipo: string   // Móvil / Escritorio
  os: string     // Android / iOS / Windows / macOS
  browser: string
  count: number
}

export interface EficienciaData {
  minutos_primer_respuesta: number | null
  minutos_promedio: number | null
  conversion_pct: number  // completaron / accedieron
  minutos_transcurridos: number | null
  pct_movil: number
}

export interface RespuestasStats {
  total: number
  consentimiento: number
  verificacion: number
  infoCorrecta: number
  quiereSeguir: number
  medioPref: Record<string, number>
  especialidad: Record<string, number>
}

// ── Queries ────────────────────────────────────────────────────────────────────
async function getCampanas(): Promise<CampanaInfo[]> {
  const sb = createClient()

  const { data: ids } = await sb
    .from('registros')
    .select('encuesta_campana_id')
    .not('encuesta_campana_id', 'is', null)

  if (!ids || ids.length === 0) return []

  const uniqueIds = Array.from(new Set(ids.map(r => r.encuesta_campana_id as string)))

  const campanas: CampanaInfo[] = await Promise.all(
    uniqueIds.map(async (campanaId) => {
      const [
        { count: total },
        { count: enviado },
        { count: accedieron },
        { count: completado },
        { data: fechaRow },
      ] = await Promise.all([
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).eq('correo_estado', 'enviado'),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).not('primer_acceso_at', 'is', null),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).not('encuesta_completada_at', 'is', null),
        sb.from('registros').select('correo_enviado_at').eq('encuesta_campana_id', campanaId).not('correo_enviado_at', 'is', null).order('correo_enviado_at', { ascending: true }).limit(1),
      ])

      return {
        id: campanaId,
        total:      total      ?? 0,
        enviado:    enviado    ?? 0,
        accedieron: accedieron ?? 0,
        completado: completado ?? 0,
        fecha_inicio: fechaRow?.[0]?.correo_enviado_at ?? null,
      }
    })
  )

  return campanas.sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''))
}

async function getEficiencia(campanaId: string, c: CampanaInfo): Promise<EficienciaData> {
  const sb = createClient()

  // Primera y promedio de tiempo: busca registros con encuesta completada y correo enviado
  const { data: tiempos } = await sb
    .from('registros')
    .select('correo_enviado_at, encuesta_completada_at, primer_acceso_dispositivo')
    .eq('encuesta_campana_id', campanaId)
    .not('encuesta_completada_at', 'is', null)
    .not('correo_enviado_at', 'is', null)
    .limit(1000)

  let minutos_primer_respuesta: number | null = null
  let minutos_promedio: number | null = null
  let pct_movil = 0

  if (tiempos && tiempos.length > 0) {
    const diffs = tiempos
      .map(r => {
        const enviado    = new Date(r.correo_enviado_at as string).getTime()
        const completado = new Date(r.encuesta_completada_at as string).getTime()
        return (completado - enviado) / 60000
      })
      .filter(d => d > 0 && d < 10080) // ignorar outliers >7 días

    if (diffs.length > 0) {
      minutos_primer_respuesta = Math.round(Math.min(...diffs))
      minutos_promedio = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
    }

    const moviles = tiempos.filter(r =>
      typeof r.primer_acceso_dispositivo === 'string' &&
      (r.primer_acceso_dispositivo as string).startsWith('Móvil')
    ).length
    pct_movil = tiempos.length > 0 ? Math.round((moviles / tiempos.length) * 100) : 0
  }

  // Tiempo transcurrido desde primer envío
  let minutos_transcurridos: number | null = null
  if (c.fecha_inicio) {
    minutos_transcurridos = Math.round((Date.now() - new Date(c.fecha_inicio).getTime()) / 60000)
  }

  const conversion_pct = c.accedieron > 0
    ? Math.round((c.completado / c.accedieron) * 100)
    : 0

  return { minutos_primer_respuesta, minutos_promedio, conversion_pct, minutos_transcurridos, pct_movil }
}

async function getDispositivos(campanaId: string): Promise<DispositivoBreakdown[]> {
  const sb = createClient()

  const { data } = await sb
    .from('registros')
    .select('primer_acceso_dispositivo')
    .eq('encuesta_campana_id', campanaId)
    .not('primer_acceso_dispositivo', 'is', null)

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const d = r.primer_acceso_dispositivo as string
    map.set(d, (map.get(d) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([key, count]) => {
      const parts = key.split(' / ')
      return { tipo: parts[0] ?? '', os: parts[1] ?? '', browser: parts[2] ?? '', count }
    })
    .sort((a, b) => b.count - a.count)
}

async function getRespuestasStats(campanaId: string): Promise<RespuestasStats> {
  const sb = createClient()

  const { data: regIds } = await sb
    .from('registros')
    .select('id_registro')
    .eq('encuesta_campana_id', campanaId)

  const ids = (regIds ?? []).map(r => r.id_registro as string)
  if (ids.length === 0) {
    return { total: 0, consentimiento: 0, verificacion: 0, infoCorrecta: 0, quiereSeguir: 0, medioPref: {}, especialidad: {} }
  }

  const allRespuestas: Array<Record<string, unknown>> = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data } = await sb
      .from('respuestas')
      .select('paso_1_consentimiento,paso_2_verificacion,paso_3_info_correcta,paso_4_quiere_seguir,paso_6_medio_contacto,id_registro')
      .in('id_registro', ids)
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    allRespuestas.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const total = allRespuestas.length
  let consentimiento = 0, verificacion = 0, infoCorrecta = 0, quiereSeguir = 0
  const medioPref: Record<string, number> = {}

  for (const r of allRespuestas) {
    if (r.paso_1_consentimiento === 'si') consentimiento++
    if (r.paso_2_verificacion   === 'si') verificacion++
    if (r.paso_3_info_correcta  === 'si') infoCorrecta++
    if (r.paso_4_quiere_seguir  === 'si') quiereSeguir++
    const medio = (r.paso_6_medio_contacto as string) ?? 'Sin respuesta'
    medioPref[medio] = (medioPref[medio] ?? 0) + 1
  }

  // Especialidades de quienes respondieron
  const idsResp = allRespuestas.map(r => r.id_registro as string).filter(Boolean)
  const especialidad: Record<string, number> = {}
  if (idsResp.length > 0) {
    const { data: regs } = await sb.from('registros').select('especialidad').in('id_registro', idsResp)
    for (const reg of regs ?? []) {
      const esp = (reg.especialidad as string) ?? 'Sin datos'
      especialidad[esp] = (especialidad[esp] ?? 0) + 1
    }
  }

  return { total, consentimiento, verificacion, infoCorrecta, quiereSeguir, medioPref, especialidad }
}

// ── Page ───────────────────────────────────────────────────────────────────────
interface Props {
  searchParams: { campana?: string }
}

export default async function EstadisticasPage({ searchParams }: Props) {
  const campanas      = await getCampanas()
  const campanaActual = searchParams.campana ?? campanas[0]?.id ?? null
  const campanaInfo   = campanas.find(c => c.id === campanaActual) ?? null

  const [eficiencia, dispositivos, respuestas] = campanaInfo
    ? await Promise.all([
        getEficiencia(campanaActual!, campanaInfo),
        getDispositivos(campanaActual!),
        getRespuestasStats(campanaActual!),
      ])
    : [
        { minutos_primer_respuesta: null, minutos_promedio: null, conversion_pct: 0, minutos_transcurridos: null, pct_movil: 0 },
        [] as DispositivoBreakdown[],
        { total: 0, consentimiento: 0, verificacion: 0, infoCorrecta: 0, quiereSeguir: 0, medioPref: {}, especialidad: {} } as RespuestasStats,
      ]

  return (
    <CampaignDashboard
      campanas={campanas}
      campanaActual={campanaActual}
      campanaInfo={campanaInfo}
      eficiencia={eficiencia}
      dispositivos={dispositivos}
      respuestas={respuestas}
    />
  )
}

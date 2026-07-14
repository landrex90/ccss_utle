import { createClient } from '@/lib/supabase/server'
import CampaignDashboard from './CampaignDashboard'

export const dynamic = 'force-dynamic'

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface CampanaInfo {
  id: string
  total: number
  enviado: number
  abierto: number
  click: number
  completado: number
  fecha_inicio: string | null
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

  // Campañas de encuesta distintas
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
        { count: abierto },
        { count: click },
        { count: completado },
        { data: fechaRow },
      ] = await Promise.all([
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).eq('correo_estado', 'enviado'),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).not('correo_abierto_at', 'is', null),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).not('correo_click_at', 'is', null),
        sb.from('registros').select('*', { count: 'exact', head: true }).eq('encuesta_campana_id', campanaId).not('encuesta_completada_at', 'is', null),
        sb.from('registros').select('correo_enviado_at').eq('encuesta_campana_id', campanaId).not('correo_enviado_at', 'is', null).order('correo_enviado_at', { ascending: true }).limit(1),
      ])

      return {
        id: campanaId,
        total: total ?? 0,
        enviado: enviado ?? 0,
        abierto: abierto ?? 0,
        click: click ?? 0,
        completado: completado ?? 0,
        fecha_inicio: fechaRow?.[0]?.correo_enviado_at ?? null,
      }
    })
  )

  return campanas.sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''))
}

async function getRespuestasStats(campanaId: string | null): Promise<RespuestasStats> {
  const sb = createClient()

  // Obtener IDs de registros de esta campaña (o todas)
  let registroQuery = sb.from('registros').select('id_registro')
  if (campanaId) registroQuery = registroQuery.eq('encuesta_campana_id', campanaId)

  const { data: registros } = await registroQuery
  const idRegistros = (registros ?? []).map(r => r.id_registro as string)

  if (idRegistros.length === 0) {
    return { total: 0, consentimiento: 0, verificacion: 0, infoCorrecta: 0, quiereSeguir: 0, medioPref: {}, especialidad: {} }
  }

  // Paginar para traer todas las respuestas
  const allRespuestas: Array<Record<string, string | boolean | null>> = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data } = await sb
      .from('respuestas')
      .select('paso_1_consentimiento,paso_2_verificacion,paso_3_info_correcta,paso_4_quiere_seguir,paso_6_medio_contacto,id_registro')
      .in('id_registro', idRegistros)
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    allRespuestas.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const total = allRespuestas.length
  let consentimiento = 0, verificacion = 0, infoCorrecta = 0, quiereSeguir = 0
  const medioPref: Record<string, number> = {}
  const especialidadMap: Record<string, number> = {}

  for (const r of allRespuestas) {
    if (r.paso_1_consentimiento === 'si') consentimiento++
    if (r.paso_2_verificacion   === 'si') verificacion++
    if (r.paso_3_info_correcta  === 'si') infoCorrecta++
    if (r.paso_4_quiere_seguir  === 'si') quiereSeguir++
    const medio = (r.paso_6_medio_contacto as string) ?? 'Sin respuesta'
    medioPref[medio] = (medioPref[medio] ?? 0) + 1
  }

  // Especialidades de los registros que respondieron
  const idsConRespuesta = allRespuestas.map(r => r.id_registro as string).filter(Boolean)
  if (idsConRespuesta.length > 0) {
    const { data: regs } = await sb
      .from('registros')
      .select('especialidad')
      .in('id_registro', idsConRespuesta)
    for (const reg of regs ?? []) {
      const esp = (reg.especialidad as string) ?? 'Sin datos'
      especialidadMap[esp] = (especialidadMap[esp] ?? 0) + 1
    }
  }

  return { total, consentimiento, verificacion, infoCorrecta, quiereSeguir, medioPref, especialidad: especialidadMap }
}

// ── Page ───────────────────────────────────────────────────────────────────────
interface Props {
  searchParams: { campana?: string }
}

export default async function EstadisticasPage({ searchParams }: Props) {
  const campanas       = await getCampanas()
  const campanaActual  = searchParams.campana ?? campanas[0]?.id ?? null
  const respuestas     = await getRespuestasStats(campanaActual)
  const campanaInfo    = campanas.find(c => c.id === campanaActual) ?? null

  return (
    <CampaignDashboard
      campanas={campanas}
      campanaActual={campanaActual}
      campanaInfo={campanaInfo}
      respuestas={respuestas}
    />
  )
}

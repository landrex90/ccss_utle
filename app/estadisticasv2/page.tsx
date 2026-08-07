import { createClient } from '@/lib/supabase/server'
import { validateViewerSessionServer } from '@/lib/viewer-auth'
import CampaignDashboardV2 from './CampaignDashboard'

const WA_EXPORT_VIEWERS = ['ncorrea']

export const dynamic = 'force-dynamic'

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

export interface WaData {
  enviados:          number
  respondio:         number
  no_respondio:      number
  entregados:        number
  leidos:            number
  activo:            number
  depurado_renuncia: number
  no_autorizo:       number
  no_verificado:     number
}

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

const WA_CAMPANA_MAP: Record<string, string> = {
  'ENCUESTA-CIRUGIA-01_1500': 'WA-CIRUGIA-01',
  'ENCUESTA-CIRUGIA-02':      'WA-CIRUGIA-02',
  'ENCUESTA-CE-01':           'WA-CE-01',
  'ENCUESTA-PROC-01':         'WA-PROC-01',
  'ENCUESTA-PROC-02':         'WA-PROC-02',
}

async function getWaData(sb: ReturnType<typeof createClient>, campanaId: string): Promise<WaData> {
  const waCampanaId = WA_CAMPANA_MAP[campanaId]
  if (!waCampanaId) return { enviados: 0, respondio: 0, no_respondio: 0, entregados: 0, leidos: 0, activo: 0, depurado_renuncia: 0, no_autorizo: 0, no_verificado: 0 }

  const q = () => sb.from('registros').eq('whatsapp_campana_id', waCampanaId)
  const [
    { count: total },
    { count: sinCelular },
    { count: respondioC },
    { count: noRespondioC },
    { count: entregadosC },
    { count: leidosC },
    { count: activoC },
    { count: depuradoC },
    { count: noAutorizoC },
    { count: noVerifC },
  ] = await Promise.all([
    q().select('*', { count: 'exact', head: true }),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'sin_celular'),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'respondio'),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'no_respondio'),
    q().select('*', { count: 'exact', head: true }).not('whatsapp_entregado_at', 'is', null),
    q().select('*', { count: 'exact', head: true }).not('whatsapp_leido_at', 'is', null),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'respondio').eq('estado', 'ACTIVO'),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'respondio').eq('estado', 'DEPURADO_RENUNCIA'),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'respondio').eq('estado', 'NO_AUTORIZO'),
    q().select('*', { count: 'exact', head: true }).eq('whatsapp_estado', 'respondio').eq('estado', 'NO_VERIFICADO'),
  ])
  return {
    enviados:          (total ?? 0) - (sinCelular ?? 0),
    respondio:         respondioC ?? 0,
    no_respondio:      noRespondioC ?? 0,
    entregados:        entregadosC ?? 0,
    leidos:            leidosC ?? 0,
    activo:            activoC ?? 0,
    depurado_renuncia: depuradoC ?? 0,
    no_autorizo:       noAutorizoC ?? 0,
    no_verificado:     noVerifC ?? 0,
  }
}

async function getEstadosPorCampana(sb: ReturnType<typeof createClient>, campanas: CampanaInfo[]): Promise<Record<string, EstadoRow[]>> {
  const results = await Promise.all(campanas.map(c => getEstados(sb, c.id)))
  return Object.fromEntries(campanas.map((c, i) => [c.id, results[i]]))
}

async function getWaPorCampana(sb: ReturnType<typeof createClient>, campanas: CampanaInfo[]): Promise<Record<string, WaData>> {
  const results = await Promise.all(campanas.map(c => getWaData(sb, c.id)))
  return Object.fromEntries(campanas.map((c, i) => [c.id, results[i]]))
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

interface Props { searchParams: { campana?: string } }

export default async function EstadisticasV2Page({ searchParams }: Props) {
  const sb = createClient()
  const campanas      = await getCampanas()
  const campanaActual = searchParams.campana ?? campanas[0]?.id ?? null
  const campanaInfo   = campanas.find(c => c.id === campanaActual) ?? null

  if (!campanaInfo || !campanaActual) {
    return <div className="p-8 text-gray-500 text-center">No hay campañas registradas aún.</div>
  }

  const viewerUser = validateViewerSessionServer()
  const canExportWA = !!(viewerUser && WA_EXPORT_VIEWERS.includes(viewerUser))

  const [estados, eficiencia, especialidades, dispositivos, formSteps, proximaFase, waData, estadosPorCampana, waPorCampana] = await Promise.all([
    getEstados(sb, campanaActual),
    getEficiencia(sb, campanaActual, campanaInfo),
    getEspecialidades(sb, campanaActual),
    getDispositivos(sb, campanaActual),
    getFormSteps(sb, campanaActual),
    getProximaFase(sb, campanaActual, campanaInfo.completado),
    getWaData(sb, campanaActual),
    getEstadosPorCampana(sb, campanas),
    getWaPorCampana(sb, campanas),
  ])

  return (
    <CampaignDashboardV2
      campanas={campanas}
      campanaActual={campanaActual}
      campanaInfo={campanaInfo}
      estados={estados}
      eficiencia={eficiencia}
      especialidades={especialidades}
      dispositivos={dispositivos}
      formSteps={formSteps}
      proximaFase={proximaFase}
      waData={waData}
      estadosPorCampana={estadosPorCampana}
      waPorCampana={waPorCampana}
      canExportWA={canExportWA}
    />
  )
}

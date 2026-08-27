import { createClient } from "@supabase/supabase-js"

const PAGE_SIZE = 1000
const CONCURRENCIA = 40

const COLUMNAS =
  'id_registro, nombre_paciente, numero_asegurado, correo, telefono,' +
  'especialidad, centro_medico, tipo_atencion, nombre_servicio,' +
  'lateralidad, procedimiento, tipo_consulta, fecha_cita, hora_cita,' +
  'campana_id, warmup_estado, warmup_enviado_at,' +
  'encuesta_campana_id, correo_estado, correo_enviado_at, correo_abierto_at, correo_click_at,' +
  'whatsapp_estado, llamada_estado,' +
  'recordatorio_campana_id, recordatorio_correo_enviado_at, segundo_contacto_canal,' +
  'estado, encuesta_completada_at, created_at'

const CSV_HEADERS = [
  'ID Registro', 'Nombre', 'N° Asegurado', 'Correo', 'Teléfono',
  'Especialidad', 'Centro Médico', 'Tipo Atención', 'Servicio',
  'Lateralidad', 'Procedimiento', 'Tipo Consulta', 'Fecha Cita', 'Hora Cita',
  'Campaña Warmup', 'Warmup Estado', 'Warmup Enviado',
  'Campaña Encuesta', 'Correo Estado', 'Correo Enviado', 'Correo Abierto', 'Correo Click',
  'WhatsApp Estado', 'Llamada Estado',
  'Campaña Recordatorio', 'Recordatorio Enviado', '2do Contacto Canal',
  'Estado Encuesta', 'Encuesta Completada', 'Cargado',
]

function fmtDate(ts: unknown): string {
  if (!ts) return ''
  try {
    return new Date(ts as string).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
  } catch {
    return String(ts)
  }
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowToCsv(r: Record<string, unknown>): string {
  const values = [
    r.id_registro, r.nombre_paciente, r.numero_asegurado, r.correo, r.telefono ?? '',
    r.especialidad ?? '', r.centro_medico, r.tipo_atencion, r.nombre_servicio ?? '',
    r.lateralidad ?? '', r.procedimiento ?? '', r.tipo_consulta ?? '', r.fecha_cita ?? '', r.hora_cita ?? '',
    r.campana_id ?? '', r.warmup_estado ?? '', fmtDate(r.warmup_enviado_at),
    r.encuesta_campana_id ?? '', r.correo_estado ?? '', fmtDate(r.correo_enviado_at), fmtDate(r.correo_abierto_at), fmtDate(r.correo_click_at),
    r.whatsapp_estado ?? '', r.llamada_estado ?? '',
    r.recordatorio_campana_id ?? '', fmtDate(r.recordatorio_correo_enviado_at), r.segundo_contacto_canal ?? '',
    r.estado, fmtDate(r.encuesta_completada_at), fmtDate(r.created_at),
  ]
  return values.map(csvEscape).join(',')
}

export const config = { background: true }

export default async (req: Request) => {
  const { jobId } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    await supabase.from('export_jobs').update({ status: 'processing' }).eq('id', jobId)

    const { count } = await supabase
      .from('registros')
      .select('id_registro', { count: 'exact', head: true })
      .not('encuesta_campana_id', 'is', null)

    const total = count ?? 0
    const numPaginas = Math.ceil(total / PAGE_SIZE)
    const offsets = Array.from({ length: numPaginas }, (_, i) => i * PAGE_SIZE)

    async function fetchPagina(offset: number) {
      const { data } = await supabase
        .from('registros')
        .select(COLUMNAS)
        .not('encuesta_campana_id', 'is', null)
        .order('id_registro')
        .range(offset, offset + PAGE_SIZE - 1)
      return (data ?? []) as unknown as Record<string, unknown>[]
    }

    const lines: string[] = [CSV_HEADERS.map(csvEscape).join(',')]
    for (let i = 0; i < offsets.length; i += CONCURRENCIA) {
      const lote = offsets.slice(i, i + CONCURRENCIA)
      const resultados = await Promise.all(lote.map(fetchPagina))
      for (const rows of resultados) {
        for (const r of rows) lines.push(rowToCsv(r))
      }
    }

    const csvContent = lines.join('\r\n')

    await supabase
      .from('export_jobs')
      .update({ status: 'completed', csv_content: csvContent, completed_at: new Date().toISOString() })
      .eq('id', jobId)

    console.log(`[export-background] job ${jobId} completado, ${lines.length - 1} filas`)
  } catch (err) {
    console.error('[export-background] error', err)
    await supabase
      .from('export_jobs')
      .update({ status: 'failed', error_message: err instanceof Error ? err.message : String(err) })
      .eq('id', jobId)
  }
}

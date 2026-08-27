import { schedule } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const PAGE_SIZE = 1000
const CONCURRENCIA = 25
const TIEMPO_LIMITE_MS = 20_000 // dejamos margen bajo el límite de 30s de Netlify

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

export const handler = schedule("* * * * *", async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Prioriza continuar un trabajo ya en curso antes de empezar uno nuevo
  const { data: jobs } = await supabase
    .from('export_jobs')
    .select('id, next_offset, total_filas')
    .in('status', ['pending', 'processing'])
    .order('status', { ascending: false }) // 'processing' > 'pending' alfabéticamente
    .order('created_at', { ascending: true })
    .limit(1)

  if (!jobs || jobs.length === 0) {
    return { statusCode: 200, body: 'sin trabajos pendientes' }
  }

  const job = jobs[0]
  const inicio = Date.now()

  try {
    let total = job.total_filas
    if (total === null || total === undefined) {
      const { count } = await supabase
        .from('registros')
        .select('id_registro', { count: 'exact', head: true })
        .not('encuesta_campana_id', 'is', null)
      total = count ?? 0
      await supabase.from('export_jobs').update({ status: 'processing', total_filas: total }).eq('id', job.id)
    }

    let offset = job.next_offset

    // Si es la primera vez que procesamos este trabajo, sembramos el encabezado
    if (offset === 0) {
      await supabase.from('export_jobs').update({ csv_content: CSV_HEADERS.map(csvEscape).join(',') + '\r\n' }).eq('id', job.id)
    }

    async function fetchPagina(off: number) {
      const { data } = await supabase
        .from('registros')
        .select(COLUMNAS)
        .not('encuesta_campana_id', 'is', null)
        .order('id_registro')
        .range(off, off + PAGE_SIZE - 1)
      return (data ?? []) as unknown as Record<string, unknown>[]
    }

    const nuevasLineas: string[] = []
    while (offset < total && Date.now() - inicio < TIEMPO_LIMITE_MS) {
      const lote = []
      for (let i = 0; i < CONCURRENCIA && offset + i * PAGE_SIZE < total; i++) {
        lote.push(offset + i * PAGE_SIZE)
      }
      const resultados = await Promise.all(lote.map(fetchPagina))
      for (const rows of resultados) {
        for (const r of rows) nuevasLineas.push(rowToCsv(r))
      }
      offset += lote.length * PAGE_SIZE
      if (Date.now() - inicio >= TIEMPO_LIMITE_MS) break
    }

    if (nuevasLineas.length > 0) {
      // Traer el contenido actual y anexar (Postgres TEXT concat vía RPC sería más
      // eficiente, pero a esta escala de chunks es aceptable hacerlo en la app)
      const { data: actual } = await supabase.from('export_jobs').select('csv_content').eq('id', job.id).single()
      const csvActualizado = (actual?.csv_content ?? '') + nuevasLineas.join('\r\n') + '\r\n'
      await supabase.from('export_jobs').update({ csv_content: csvActualizado, next_offset: offset }).eq('id', job.id)
    }

    if (offset >= total) {
      await supabase
        .from('export_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', job.id)
      console.log(`[process-export-jobs] job ${job.id} completado, ${total} filas`)
      return { statusCode: 200, body: `completado: ${total} filas` }
    }

    console.log(`[process-export-jobs] job ${job.id} progreso: ${offset}/${total}`)
    return { statusCode: 200, body: `progreso: ${offset}/${total}` }
  } catch (err) {
    console.error('[process-export-jobs] error', err)
    await supabase
      .from('export_jobs')
      .update({ status: 'failed', error_message: err instanceof Error ? err.message : String(err) })
      .eq('id', job.id)
    return { statusCode: 500 }
  }
})

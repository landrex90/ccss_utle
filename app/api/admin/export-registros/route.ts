import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 1000

export async function GET(request: NextRequest) {
  if (!validateAdminSession(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createClient()

  // Paginar para traer todos los registros
  const allRows: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('registros')
      .select(
        'id_registro, nombre_paciente, numero_asegurado, correo, telefono,' +
        'especialidad, centro_medico, tipo_atencion, nombre_servicio,' +
        'lateralidad, procedimiento, tipo_consulta, fecha_cita, hora_cita,' +
        'campana_id, warmup_estado, warmup_enviado_at,' +
        'encuesta_campana_id, correo_estado, correo_enviado_at, correo_abierto_at, correo_click_at,' +
        'whatsapp_estado, llamada_estado,' +
        'estado, encuesta_completada_at, created_at'
      )
      .order('id_registro')
      .range(from, from + PAGE_SIZE - 1)

    if (error || !data || data.length === 0) break
    allRows.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  // Formatear fechas a hora Costa Rica (UTC-6)
  function fmtDate(ts: unknown): string {
    if (!ts) return ''
    try {
      return new Date(ts as string).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
    } catch {
      return String(ts)
    }
  }

  const sheetData = allRows.map(r => ({
    'ID Registro':       r.id_registro,
    'Nombre':            r.nombre_paciente,
    'N° Asegurado':      r.numero_asegurado,
    'Correo':            r.correo,
    'Teléfono':          r.telefono ?? '',
    'Especialidad':      r.especialidad ?? '',
    'Centro Médico':     r.centro_medico,
    'Tipo Atención':     r.tipo_atencion,
    'Servicio':          r.nombre_servicio ?? '',
    'Lateralidad':       r.lateralidad ?? '',
    'Procedimiento':     r.procedimiento ?? '',
    'Tipo Consulta':     r.tipo_consulta ?? '',
    'Fecha Cita':        r.fecha_cita ?? '',
    'Hora Cita':         r.hora_cita ?? '',
    'Campaña Warmup':         r.campana_id ?? '',
    'Warmup Estado':          r.warmup_estado ?? '',
    'Warmup Enviado':         fmtDate(r.warmup_enviado_at),
    'Campaña Encuesta':       r.encuesta_campana_id ?? '',
    'Correo Estado':          r.correo_estado ?? '',
    'Correo Enviado':    fmtDate(r.correo_enviado_at),
    'Correo Abierto':    fmtDate(r.correo_abierto_at),
    'Correo Click':      fmtDate(r.correo_click_at),
    'WhatsApp Estado':   r.whatsapp_estado ?? '',
    'Llamada Estado':    r.llamada_estado ?? '',
    'Estado Encuesta':   r.estado,
    'Encuesta Completada': fmtDate(r.encuesta_completada_at),
    'Cargado':           fmtDate(r.created_at),
  }))

  // Resumen por tipo_atencion
  const resumen = ['cirugia', 'consulta', 'procedimiento'].map(tipo => {
    const sub = allRows.filter(r => r.tipo_atencion === tipo)
    return {
      'Tipo Atención':         tipo.charAt(0).toUpperCase() + tipo.slice(1),
      'Total':                 sub.length,
      'Warmup Enviado':        sub.filter(r => r.warmup_estado === 'enviado').length,
      'Correo Enviado':        sub.filter(r => r.correo_estado === 'enviado').length,
      'Correo Abierto':        sub.filter(r => r.correo_abierto_at).length,
      'Correo Click':          sub.filter(r => r.correo_click_at).length,
      'Encuesta Completada':   sub.filter(r => r.encuesta_completada_at).length,
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), 'Registros')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
  const fecha = new Date().toISOString().slice(0, 10)

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="CCSS_UTLE_registros_${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}

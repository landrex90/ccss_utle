import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateViewerSession } from '@/lib/viewer-auth'
import { validateAdminSession } from '@/lib/admin-auth'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 1000

export async function GET(request: NextRequest) {
  // Auth: viewer cookie OR admin cookie
  const username = validateViewerSession(request) ?? (validateAdminSession(request) ? 'admin' : null)
  if (!username) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const campanaId = searchParams.get('campana')
  const tipo      = searchParams.get('tipo') ?? 'registros'  // 'registros' | 'respuestas'

  if (!campanaId) {
    return NextResponse.json({ error: 'Parámetro campana requerido' }, { status: 400 })
  }

  const sb = createClient()

  try {
    let wb: XLSX.WorkBook
    let filename: string

    if (tipo === 'respuestas') {
      // Trae id_registro de la campaña con paginación completa
      const idMap = new Map<string, { nombre: string; especialidad: string; tipo: string }>()
      let regFrom = 0
      while (true) {
        const { data: regIds, error: regErr } = await sb
          .from('registros')
          .select('id_registro, nombre_paciente, especialidad, tipo_atencion')
          .eq('encuesta_campana_id', campanaId)
          .range(regFrom, regFrom + PAGE_SIZE - 1)
        if (regErr || !regIds || regIds.length === 0) break
        for (const r of regIds) {
          idMap.set(r.id_registro, {
            nombre:       r.nombre_paciente ?? '',
            especialidad: r.especialidad    ?? '',
            tipo:         r.tipo_atencion   ?? '',
          })
        }
        if (regIds.length < PAGE_SIZE) break
        regFrom += PAGE_SIZE
      }

      const ids = Array.from(idMap.keys())
      const rows: Record<string, unknown>[] = []

      // Batch IN to avoid PostgREST URL length limit
      const CHUNK = 200
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        let from = 0
        while (true) {
          const { data, error } = await sb
            .from('respuestas')
            .select('*')
            .in('id_registro', chunk)
            .range(from, from + PAGE_SIZE - 1)

          if (error || !data || data.length === 0) break
          for (const r of data) {
            const info = idMap.get(r.id_registro) ?? { nombre: '', especialidad: '', tipo: '' }
            rows.push({
              id_registro:             r.id_registro,
              nombre_paciente:         info.nombre,
              especialidad:            info.especialidad,
              tipo_atencion:           info.tipo,
              consentimiento:          r.paso_1_consentimiento,
              verificacion_cedula:     r.paso_2_verificacion,
              info_correcta:           r.paso_3_info_correcta,
              desea_continuar:         r.paso_4_desea_continuar,
              motivo_retiro:           r.motivo_retiro,
              flexible_centro:         r.paso_5a_flexibilidad_centro,
              condiciones_asistir:     r.paso_5b_condiciones_asistir,
              motivo_no_asistir:       r.paso_5b_motivo_no_asistir,
              medio_preferido:         r.paso_6_medio_contacto,
              estado_final:            r.estado_final,
              completado:              r.completado,
              paso_abandono:           r.paso_abandono,
              fecha_inicio:            r.created_at,
            })
          }
          if (data.length < PAGE_SIZE) break
          from += PAGE_SIZE
        }
      }

      const ws = XLSX.utils.json_to_sheet(rows)
      wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Respuestas')
      filename = `${campanaId}_respuestas.xlsx`

    } else {
      // tipo === 'registros'
      const rows: Record<string, unknown>[] = []
      let from = 0
      while (true) {
        const { data, error } = await sb
          .from('registros')
          .select(
            'id_registro, nombre_paciente, cedula_raw, correo, tipo_atencion, especialidad, nombre_servicio, centro_medico, fecha_cita, hora_cita, correo_estado, correo_enviado_at, correo_abierto_at, correo_click_at, encuesta_completada_at, estado, primer_acceso_at, primer_acceso_dispositivo, primer_acceso_pais, primer_acceso_ciudad'
          )
          .eq('encuesta_campana_id', campanaId)
          .range(from, from + PAGE_SIZE - 1)

        if (error || !data || data.length === 0) break
        rows.push(...data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      const ws = XLSX.utils.json_to_sheet(rows)
      wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Registros')
      filename = `${campanaId}_registros.xlsx`
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[export]', err)
    return NextResponse.json({ error: 'Error al generar el archivo' }, { status: 500 })
  }
}

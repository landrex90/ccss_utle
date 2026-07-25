import { NextRequest, NextResponse } from 'next/server'
import { validateViewerSession } from '@/lib/viewer-auth'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// Usernames de viewers con acceso a esta funcionalidad.
// Agrega el username de Nati aquí cuando lo tengas.
const ALLOWED_VIEWER_USERNAMES = ['ncorrea']

const PAGE_SIZE = 1000
const BATCH_UPD = 200

function clasificarTelefono(tel: string | null): 'celular' | 'excluido' {
  const d = (tel ?? '').replace(/\D/g, '')
  return d.length === 8 && /^[678]/.test(d) ? 'celular' : 'excluido'
}

// WA campana IDs para cada encuesta
const WA_CAMPANA: Record<string, string> = {
  'ENCUESTA-CIRUGIA-01_1500': 'WA-CIRUGIA-01',
  'ENCUESTA-CIRUGIA-02':      'WA-CIRUGIA-02',
  'ENCUESTA-CE-01':           'WA-CE-01',
  'ENCUESTA-PROC-01':         'WA-PROC-01',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  // Auth: viewer autorizado O admin
  const viewerUser = validateViewerSession(request)
  const isAdmin    = validateAdminSession(request)

  const authorized = isAdmin || (viewerUser && ALLOWED_VIEWER_USERNAMES.includes(viewerUser))
  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const campanaId = searchParams.get('campana')
  if (!campanaId) {
    return NextResponse.json({ error: 'Parámetro campana requerido' }, { status: 400 })
  }

  const waCampanaId = WA_CAMPANA[campanaId]
  if (!waCampanaId) {
    return NextResponse.json({ error: `Campaña WA no configurada para: ${campanaId}` }, { status: 400 })
  }

  const sb = createClient()

  try {
    // ── 1. Traer candidatos ──────────────────────────────────────────────────
    const candidatos: Array<{
      id_registro: string
      nombre_paciente: string
      telefono: string | null
      cedula_raw: string
      nombre_servicio: string | null
      especialidad: string | null
      centro_medico: string | null
      procedimiento: string | null
      tipo_consulta: string | null
      lateralidad: string | null
      tipo_atencion: string
      fecha_cita: string | null
      hora_cita: string | null
    }> = []

    let from = 0
    while (true) {
      const { data, error } = await sb
        .from('registros')
        .select('id_registro, nombre_paciente, telefono, cedula_raw, nombre_servicio, especialidad, centro_medico, procedimiento, tipo_consulta, lateralidad, tipo_atencion, fecha_cita, hora_cita')
        .eq('encuesta_campana_id', campanaId)
        .is('encuesta_completada_at', null)
        .is('whatsapp_enviado_at', null)
        .range(from, from + PAGE_SIZE - 1)
        .order('id_registro')

      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      candidatos.push(...(data as typeof candidatos))
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    if (candidatos.length === 0) {
      return NextResponse.json({ error: 'Sin candidatos pendientes para esta campaña' }, { status: 404 })
    }

    // ── 2. Clasificar teléfonos ──────────────────────────────────────────────
    const aptos:     typeof candidatos = []
    const excluidos: typeof candidatos = []

    for (const r of candidatos) {
      if (clasificarTelefono(r.telefono) === 'celular') aptos.push(r)
      else excluidos.push(r)
    }

    // ── 3. Generar Excel en formato COCO ─────────────────────────────────────
    const isCirugia = candidatos[0]?.tipo_atencion === 'cirugia'

    const rows = aptos.map(r => {
      const base = {
        id:                    r.cedula_raw,
        name:                  r.nombre_paciente,
        phone:                 (r.telefono ?? '').replace(/\D/g, ''),
        tipo_atencion:         r.tipo_atencion.toUpperCase().replace('CONSULTA', 'CONSULTA_EXTERNA'),
        numero_identificacion: r.cedula_raw,
        servicio:              r.nombre_servicio ?? '',
        especialidad:          r.especialidad ?? '',
        centro_medico:         r.centro_medico ?? '',
        procedimiento:         r.procedimiento ?? r.nombre_servicio ?? '',
        lateralidad:           r.lateralidad ?? 'No aplica',
      }
      if (!isCirugia) {
        return {
          ...base,
          tipo_consulta: r.tipo_consulta ?? '',
          fecha_cita:    r.fecha_cita ?? '',
          hora_cita:     r.hora_cita ?? '',
        }
      }
      return base
    })

    const sheetName = isCirugia ? 'Pacientes' : 'Consultas'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // ── 4. Marcar en BD (idempotente) ────────────────────────────────────────
    const allIds     = candidatos.map(r => r.id_registro)
    const exclIds    = excluidos.map(r => r.id_registro)

    // Todos: whatsapp_campana_id
    for (let i = 0; i < allIds.length; i += BATCH_UPD) {
      const batch = allIds.slice(i, i + BATCH_UPD)
      await sb.from('registros')
        .update({ whatsapp_campana_id: waCampanaId })
        .in('id_registro', batch)
        .is('whatsapp_campana_id', null)   // idempotente
      await sleep(80)
    }

    // Excluidos: whatsapp_estado='sin_celular'
    for (let i = 0; i < exclIds.length; i += BATCH_UPD) {
      const batch = exclIds.slice(i, i + BATCH_UPD)
      await sb.from('registros')
        .update({ whatsapp_estado: 'sin_celular' })
        .in('id_registro', batch)
        .neq('whatsapp_estado', 'sin_celular')  // idempotente
      await sleep(80)
    }

    const filename = `${waCampanaId}_coco_${aptos.length}registros.xlsx`

    return new NextResponse(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-WA-Aptos':          String(aptos.length),
        'X-WA-Excluidos':      String(excluidos.length),
        'Cache-Control':       'no-store',
      },
    })

  } catch (err) {
    console.error('[wa-export-coco]', err)
    return NextResponse.json({ error: 'Error generando export' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import {
  type Canal,
  type NormalizedRow,
  normalizeWaRow,
  normalizeIvrRow,
  normalizarTelefono,
} from '@/lib/infobip-mappers'

// ── Parse WA Excel (.xlsx) → NormalizedRow[] ─────────────────────────────────
function parseWaExcel(buffer: ArrayBuffer): NormalizedRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const rows: NormalizedRow[] = []
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
    for (const row of data) {
      rows.push(normalizeWaRow(row as Record<string, string>, sheetName))
    }
  }
  return rows
}

// ── Parse IVR CSV (semicolon-delimited) → NormalizedRow[] ────────────────────
function parseIvrCsv(text: string): NormalizedRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n')
    .filter(l => l.trim())

  if (lines.length < 2) return []

  const headers = lines[0].split(';')
  const rows: NormalizedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';')
    const obj: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] ?? ''
    }
    rows.push(normalizeIvrRow(obj))
  }
  return rows
}

// ── Map estado_canal to registros.estado ─────────────────────────────────────
function estadoDesdeRespuesta(paso4: string | null): string {
  if (paso4 === 'no_ya_no_deseo') return 'DEPURADO_RENUNCIA'
  if (paso4 === 'no_asegurado')   return 'NO_ASEGURADO'
  return 'ACTIVO'
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!validateAdminSession(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
  }

  const fileName = file.name.toLowerCase()
  let canal: Canal
  let rows: NormalizedRow[]

  if (fileName.endsWith('.xlsx')) {
    canal = 'whatsapp'
    const buffer = await file.arrayBuffer()
    rows = parseWaExcel(buffer)
  } else if (fileName.endsWith('.csv')) {
    canal = 'llamada'
    const text = await file.text()
    rows = parseIvrCsv(text)
  } else {
    return NextResponse.json(
      { error: 'Formato no soportado. Use .xlsx para WhatsApp o .csv para IVR.' },
      { status: 400 }
    )
  }

  const supabase = createClient()
  const encoder  = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let actualizados  = 0
      let noEncontrados = 0
      let omitidos      = 0
      let errores       = 0

      const emit = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      for (let i = 0; i < rows.length; i++) {
        const row    = rows[i]
        const rowNum = i + 1

        // ── Find registro ──────────────────────────────────────────────────
        let registro: { id_registro: string; estado: string | null; canal_completado?: string | null } | null = null

        if (row.cedula_raw) {
          const { data } = await supabase
            .from('registros')
            .select('id_registro, estado, canal_completado')
            .eq('cedula_raw', row.cedula_raw)
            .limit(1)
          registro = data?.[0] ?? null
        }

        if (!registro && row.telefono) {
          const { data } = await supabase
            .from('registros')
            .select('id_registro, estado, canal_completado')
            .ilike('telefono', `%${row.telefono}`)
            .limit(1)
          registro = data?.[0] ?? null
        }

        if (!registro) {
          noEncontrados++
          emit({ row: rowNum, ok: false, motivo: 'no_encontrado', cedula: row.cedula_raw, tel: row.telefono })
          continue
        }

        // ── Skip already completed ────────────────────────────────────────
        if (registro.estado !== 'PENDIENTE' && registro.canal_completado) {
          omitidos++
          emit({ row: rowNum, ok: false, motivo: 'ya_completado', id: registro.id_registro })
          continue
        }

        // ── Build registros update ────────────────────────────────────────
        const ahora  = new Date().toISOString()
        const update: Record<string, unknown> = {}

        if (canal === 'whatsapp') {
          if (row.enviado_at)  update.whatsapp_enviado_at  = row.enviado_at
          if (row.campana_id)  update.whatsapp_campana_id  = row.campana_id
          if (row.error)       update.whatsapp_error       = row.error
          update.whatsapp_estado = row.estado_canal
          if (row.estado_canal === 'completado') {
            update.whatsapp_entregado_at = row.enviado_at || ahora
            update.canal_completado = 'whatsapp'
            update.canal_actual     = 'completado'
            update.estado           = estadoDesdeRespuesta(row.paso_4_desea_continuar)
          } else {
            update.canal_actual = 'llamada'
          }
        } else {
          if (row.enviado_at)  update.llamada_enviada_at   = row.enviado_at
          if (row.campana_id)  update.llamada_campana_id   = row.campana_id
          if (row.error)       update.llamada_error        = row.error
          update.llamada_estado = row.estado_canal
          if (row.estado_canal === 'completado') {
            update.canal_completado = 'llamada'
            update.canal_actual     = 'completado'
            update.estado           = estadoDesdeRespuesta(row.paso_4_desea_continuar)
          } else {
            update.canal_actual = 'agotado'
          }
        }

        const { error: dbError } = await supabase
          .from('registros')
          .update(update)
          .eq('id_registro', registro.id_registro)

        if (dbError) {
          errores++
          emit({ row: rowNum, ok: false, motivo: 'db_error', id: registro.id_registro, error: dbError.message })
          continue
        }

        // ── Insert respuesta when completado ──────────────────────────────
        if (row.estado_canal === 'completado') {
          const respuesta: Record<string, unknown> = {
            id_registro:               registro.id_registro,
            canal,
            completado:                true,
            estado_final:              estadoDesdeRespuesta(row.paso_4_desea_continuar),
          }
          if (row.paso_1_consentimiento)       respuesta.paso_1_consentimiento       = row.paso_1_consentimiento
          if (row.paso_3_info_correcta)         respuesta.paso_3_info_correcta        = row.paso_3_info_correcta
          if (row.paso_4_desea_continuar)       respuesta.paso_4_desea_continuar      = row.paso_4_desea_continuar
          if (row.motivo_retiro)                respuesta.motivo_retiro               = row.motivo_retiro
          if (row.paso_5a_flexibilidad_centro)  respuesta.paso_5a_flexibilidad_centro = row.paso_5a_flexibilidad_centro
          if (row.paso_5b_condiciones_asistir)  respuesta.paso_5b_condiciones_asistir = row.paso_5b_condiciones_asistir
          if (row.paso_5b_motivo_no_asistir)    respuesta.paso_5b_motivo_no_asistir   = row.paso_5b_motivo_no_asistir
          if (row.paso_6_medio_contacto)        respuesta.paso_6_medio_contacto       = row.paso_6_medio_contacto

          const { error: rError } = await supabase.from('respuestas').insert(respuesta)
          if (rError) {
            emit({ row: rowNum, ok: true, id: registro.id_registro, warning: `respuesta no guardada: ${rError.message}` })
          }
        }

        actualizados++
        emit({ row: rowNum, ok: true, id: registro.id_registro, estado_canal: row.estado_canal })
      }

      emit({
        done: true,
        canal,
        summary: { actualizados, noEncontrados, omitidos, errores, total: rows.length },
      })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}

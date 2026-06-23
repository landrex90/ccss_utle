import { NextRequest, NextResponse } from 'next/server'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  result.push(field.trim())
  return result
}

function parseCSV(content: string): Record<string, string | null>[] {
  const lines = content
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n')
  const headers = parseCSVLine(lines[0]).map(h =>
    h.replace(/^"|"$/g, '').trim().toLowerCase()
  )
  return lines
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCSVLine(line)
      return headers.reduce<Record<string, string | null>>((obj, h, i) => {
        obj[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim() || null
        return obj
      }, {})
    })
}

// ── Normalize phone ───────────────────────────────────────────────────────────
function normalizarTelefono(tel: string | null): string | null {
  if (!tel) return null
  return tel.replace(/[\s\-\+]/g, '').replace(/^506/, '').slice(-8)
}

// ── Map paso_4 answer to registro estado ─────────────────────────────────────
function estadoDesdeRespuesta(paso4: string | null): string {
  if (paso4 === 'no_ya_no_deseo') return 'DEPURADO_RENUNCIA'
  if (paso4 === 'no_asegurado')   return 'NO_ASEGURADO'
  return 'ACTIVO'
}

type Canal = 'whatsapp' | 'llamada'

interface RowRecord {
  [key: string]: string | null
}

const ESTADOS_CANAL_VALIDOS = ['completado', 'no_respondio', 'rechazado', 'error', 'no_contesta'] as const

// ── Build registros update ────────────────────────────────────────────────────
function buildUpdate(canal: Canal, row: RowRecord): Record<string, unknown> {
  const ahora = new Date().toISOString()
  const rawEstado = (row.estado_canal ?? '').toLowerCase()
  const estado = (ESTADOS_CANAL_VALIDOS as readonly string[]).includes(rawEstado) ? rawEstado : 'no_respondio'
  const update: Record<string, unknown> = {}

  if (canal === 'whatsapp') {
    if (row.enviado_at)        update.whatsapp_enviado_at   = row.enviado_at
    if (row.respondio_at)      update.whatsapp_respondio_at = row.respondio_at
    if (row.campana_id)        update.whatsapp_campana_id   = row.campana_id
    if (row.error)             update.whatsapp_error        = row.error
    update.whatsapp_estado = estado
    if (estado === 'completado') {
      update.whatsapp_entregado_at = row.enviado_at || ahora
      update.canal_completado = 'whatsapp'
      update.canal_actual     = 'completado'
      update.estado           = estadoDesdeRespuesta(row.paso_4_desea_continuar)
    } else {
      update.canal_actual = 'llamada'
    }
  }

  if (canal === 'llamada') {
    if (row.enviado_at)    update.llamada_enviada_at    = row.enviado_at
    if (row.contestado_at) update.llamada_contestada_at = row.contestado_at
    if (row.completado_at) update.llamada_completada_at = row.completado_at
    if (row.intentos)      update.llamada_intentos      = parseInt(row.intentos) || 1
    if (row.campana_id)    update.llamada_campana_id    = row.campana_id
    if (row.error)         update.llamada_error         = row.error
    update.llamada_estado = estado
    if (estado === 'completado') {
      update.canal_completado = 'llamada'
      update.canal_actual     = 'completado'
      update.estado           = estadoDesdeRespuesta(row.paso_4_desea_continuar)
    } else {
      update.canal_actual = 'agotado'
    }
  }

  return update
}

// ── Build respuestas insert (only when completado) ───────────────────────────
function buildRespuesta(canal: Canal, idRegistro: string, row: RowRecord): Record<string, unknown> | null {
  const rawEstado = (row.estado_canal ?? '').toLowerCase()
  if (rawEstado !== 'completado') return null

  const respuesta: Record<string, unknown> = {
    id_registro:  idRegistro,
    canal,
    completado:   true,
    estado_final: estadoDesdeRespuesta(row.paso_4_desea_continuar),
  }

  if (row.paso_4_desea_continuar)      respuesta.paso_4_desea_continuar      = row.paso_4_desea_continuar
  if (row.motivo_retiro)               respuesta.motivo_retiro               = row.motivo_retiro
  if (row.paso_5a_flexibilidad_centro) respuesta.paso_5a_flexibilidad_centro = row.paso_5a_flexibilidad_centro
  if (row.paso_5b_condiciones_asistir) respuesta.paso_5b_condiciones_asistir = row.paso_5b_condiciones_asistir
  if (row.paso_5b_motivo_no_asistir)   respuesta.paso_5b_motivo_no_asistir   = row.paso_5b_motivo_no_asistir
  if (row.paso_6_medio_contacto)       respuesta.paso_6_medio_contacto       = row.paso_6_medio_contacto

  return respuesta
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
  const canal = formData.get('canal') as string | null

  if (!file) {
    return NextResponse.json({ error: 'Archivo CSV requerido' }, { status: 400 })
  }

  if (!canal || !['whatsapp', 'llamada'].includes(canal)) {
    return NextResponse.json({ error: 'Canal inválido. Debe ser whatsapp o llamada' }, { status: 400 })
  }

  const csvContent = await file.text()
  const rows = parseCSV(csvContent)
  const supabase = createClient()

  let actualizados = 0
  let noEncontrados = 0
  let errores = 0
  const detalles: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    // Find registro by id_registro first, then by phone
    let registro: { id_registro: string; estado: string | null; canal_completado?: string | null } | null = null

    if (row.id_registro) {
      const { data } = await supabase
        .from('registros')
        .select('id_registro, estado, canal_completado')
        .eq('id_registro', row.id_registro)
        .single()
      registro = data
    }

    if (!registro && row.telefono) {
      const telNorm = normalizarTelefono(row.telefono)
      if (telNorm) {
        const { data: phoneData } = await supabase
          .from('registros')
          .select('id_registro, estado, canal_completado')
          .ilike('telefono', `%${telNorm}`)
          .limit(1)
        registro = phoneData?.[0] ?? null
      }
    }

    if (!registro) {
      noEncontrados++
      detalles.push(
        `Fila ${rowNum}: no encontrado (id: ${row.id_registro ?? '—'}, tel: ${row.telefono ?? '—'})`
      )
      continue
    }

    // Skip already completed records
    if (registro.estado !== 'PENDIENTE' && registro.canal_completado) {
      detalles.push(`Fila ${rowNum}: [${registro.id_registro}] ya completado — omitido`)
      continue
    }

    const update = buildUpdate(canal as Canal, row)
    const { error: dbError } = await supabase
      .from('registros')
      .update(update)
      .eq('id_registro', registro.id_registro)

    if (dbError) {
      errores++
      detalles.push(`Fila ${rowNum}: [${registro.id_registro}] error — ${dbError.message}`)
      continue
    }

    // Insert into respuestas when the patient completed the flow
    const respuesta = buildRespuesta(canal as Canal, registro.id_registro, row)
    if (respuesta) {
      const { error: respuestaError } = await supabase
        .from('respuestas')
        .insert(respuesta)
      if (respuestaError) {
        detalles.push(
          `Fila ${rowNum}: [${registro.id_registro}] actualizado pero respuesta no guardada — ${respuestaError.message}`
        )
      }
    }

    actualizados++
  }

  return NextResponse.json({
    ok: true,
    actualizados,
    noEncontrados,
    errores,
    total: rows.length,
    detalles,
  })
}

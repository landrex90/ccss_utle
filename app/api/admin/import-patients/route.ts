import { NextRequest } from 'next/server'
import { validateAdminSession, validateOrigin } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

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
    .replace(/^﻿/, '') // strip BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
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

// ── Validation ────────────────────────────────────────────────────────────────
const TIPOS_VALIDOS = ['consulta', 'cirugia', 'procedimiento']
const REQUIRED = [
  'nombre_paciente',
  'numero_asegurado',
  'correo',
  'centro_medico',
  'tipo_atencion',
  'ultimos_4_asegurado',
]

interface RowRecord {
  [key: string]: string | null
}

function validarFila(row: RowRecord): string[] {
  const errores: string[] = []
  for (const campo of REQUIRED) {
    if (!row[campo]) errores.push(`"${campo}" vacío`)
  }
  if (row.tipo_atencion && !TIPOS_VALIDOS.includes(row.tipo_atencion)) {
    errores.push(`tipo_atencion inválido: "${row.tipo_atencion}"`)
  }
  if (row.ultimos_4_asegurado && !/^\d{4}$/.test(row.ultimos_4_asegurado)) {
    errores.push('ultimos_4_asegurado debe ser 4 dígitos')
  }
  return errores
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!validateAdminSession(request)) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response(JSON.stringify({ error: 'FormData inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const file = formData.get('file') as File | null
  const ALLOWED_BASE_URLS = [
    'https://ccss.cocoreservas.com',
    'https://ccss-utle-prod.netlify.app',
    'https://ccss-utle-preprod.netlify.app',
  ]
  const rawBaseUrl = (formData.get('baseUrl') as string | null) ?? ''
  const baseUrl = ALLOWED_BASE_URLS.includes(rawBaseUrl)
    ? rawBaseUrl
    : 'https://ccss-utle-preprod.netlify.app'
  const campanaId = (formData.get('campanaId') as string | null) || null

  if (!file) {
    return new Response(JSON.stringify({ error: 'Archivo CSV requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5 MB
  if (file.size > MAX_CSV_BYTES) {
    return new Response(JSON.stringify({ error: 'El archivo CSV no puede superar 5 MB' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const csvContent = await file.text()
  const rows = parseCSV(csvContent)

  const supabase = createClient()

  // Stream NDJSON
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let insertados = 0
      let errores = 0
      let invalidos = 0

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2

        const validationErrors = validarFila(row)
        if (validationErrors.length > 0) {
          invalidos++
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                row: rowNum,
                ok: false,
                error: validationErrors.join(' | '),
              }) + '\n'
            )
          )
          continue
        }

        const token = crypto.randomUUID()
        const linkExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        const idRegistro = row.id_registro ?? `REG-${String(i + 1).padStart(6, '0')}`

        const registro = {
          id_registro:         idRegistro,
          nombre_paciente:     row.nombre_paciente!,
          numero_asegurado:    row.numero_asegurado!,
          cedula_raw:          row.numero_asegurado!.replace(/[^0-9]/g, ''),
          telefono:            row.telefono            ?? null,
          correo:              row.correo!,
          especialidad:        row.especialidad        ?? null,
          centro_medico:       row.centro_medico!,
          tipo_atencion:       row.tipo_atencion!,
          nombre_servicio:     row.nombre_servicio     ?? null,
          lateralidad:         row.lateralidad         ?? null,
          procedimiento:       row.procedimiento       ?? null,
          tipo_consulta:       row.tipo_consulta       ?? null,
          fecha_cita:          row.fecha_cita          ?? null,
          hora_cita:           row.hora_cita           ?? null,
          ultimos_4_asegurado: row.ultimos_4_asegurado!,
          token,
          link_expires_at:     linkExpiresAt,
          estado:              'PENDIENTE',
          campana_id:          campanaId ?? row.campana_id ?? null,
        }

        const { error: dbError } = await supabase
          .from('registros')
          .upsert(registro, { onConflict: 'id_registro' })

        if (dbError) {
          errores++
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                row: rowNum,
                id: idRegistro,
                ok: false,
                error: dbError.message,
              }) + '\n'
            )
          )
        } else {
          insertados++
          const url = `${baseUrl}/utle?t=${token}`
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                row: rowNum,
                id: idRegistro,
                url,
                correo: row.correo ?? null,
                telefono: row.telefono ?? null,
                ok: true,
              }) + '\n'
            )
          )
        }
      }

      // Final summary line
      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            done: true,
            summary: { insertados, invalidos, errores, total: rows.length },
          }) + '\n'
        )
      )
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

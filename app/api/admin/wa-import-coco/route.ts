import { NextRequest, NextResponse } from 'next/server'
import { validateViewerSession } from '@/lib/viewer-auth'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const ALLOWED_VIEWER_USERNAMES = ['ncorrea']

const WA_CAMPANA: Record<string, string> = {
  'ENCUESTA-CIRUGIA-01_1500': 'WA-CIRUGIA-01',
  'ENCUESTA-CIRUGIA-02':      'WA-CIRUGIA-02',
  'ENCUESTA-CE-01':           'WA-CE-01',
  'ENCUESTA-PROC-01':         'WA-PROC-01',
}

function mapWaEstado(estadoCoco: string | null, error: string | null): string {
  if (error && error.trim() && error.trim() !== '-') return 'fallido'
  const e = (estadoCoco ?? '').trim()
  if (!e || e === '-') return 'no_respondio'
  if (e.toLowerCase().includes('complet')) return 'respondio'
  return 'no_respondio'
}

function mapEstadoFinal(desea: string | null): string | null {
  const d = (desea ?? '').toLowerCase()
  if (!d || d === '-') return null
  if (d.includes('sí') || d.includes('si') || d.includes('puede asistir')) return 'ACTIVO'
  if (d.includes('no')) return 'DEPURADO_RENUNCIA'
  return 'ACTIVO'
}

function clean(val: unknown): string | null {
  const v = String(val ?? '').trim()
  return (!v || v === '-') ? null : v
}

function parseHourSent(val: unknown): string | null {
  if (!val) return null
  try {
    if (typeof val === 'number') {
      const d = XLSX.SSF.parse_date_code(val)
      if (!d) return null
      return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, d.S)).toISOString()
    }
    const d = new Date(String(val))
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(request: NextRequest) {
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

  // Leer archivo del form
  let fileBuffer: Buffer
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    fileBuffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Error leyendo el archivo' }, { status: 400 })
  }

  // Parsear Excel
  let rows: Record<string, unknown>[]
  try {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as Record<string, unknown>[]
  } catch {
    return NextResponse.json({ error: 'El archivo no es un Excel válido (.xlsx)' }, { status: 400 })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
  }

  const sb = createClient()

  // Construir mapa cédula → id_registro
  const cedulaMap = new Map<string, string>()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro, cedula_raw')
      .eq('whatsapp_campana_id', waCampanaId)
      .range(from, from + 999)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.cedula_raw) cedulaMap.set(String(r.cedula_raw).trim(), r.id_registro as string)
    }
    if (data.length < 1000) break
    from += 1000
  }

  // Procesar filas
  let matched = 0, noMatch = 0, respondio = 0, noRespondio = 0, fallido = 0, errores = 0
  const updatesRegistros: Array<Record<string, unknown>> = []
  const upsertRespuestas: Array<Record<string, unknown>> = []

  for (const row of rows) {
    const cedula = clean(row['N° Identificación'] ?? row['id'] ?? '')
    if (!cedula) { noMatch++; continue }

    const idRegistro = cedulaMap.get(cedula)
    if (!idRegistro) { noMatch++; continue }
    matched++

    const estadoCoco = clean(row['Estado final'])
    const errorCoco  = clean(row['error'])
    const waEstado   = mapWaEstado(estadoCoco, errorCoco)
    const hourSent   = parseHourSent(row['hour_sent'])

    if (waEstado === 'respondio') respondio++
    else if (waEstado === 'fallido') fallido++
    else noRespondio++

    const updReg: Record<string, unknown> = {
      id_registro:         idRegistro,
      whatsapp_enviado_at: hourSent,
      whatsapp_estado:     waEstado,
      whatsapp_error:      errorCoco,
    }
    if (waEstado === 'respondio') updReg.whatsapp_respondio_at = hourSent
    updatesRegistros.push(updReg)

    if (waEstado === 'respondio') {
      upsertRespuestas.push({
        id_registro:                 idRegistro,
        paso_2_verificacion:         clean(row['Verificación de identidad']),
        paso_4_desea_continuar:      clean(row['¿Desea continuar con esta atención pendiente?']),
        motivo_retiro:               clean(row['Motivo de retiro de lista de espera']),
        paso_5a_flexibilidad_centro: clean(row['Flexibilidad de centro médico']),
        paso_5b_condiciones_asistir: clean(row['Condiciones para asistir']),
        paso_5b_motivo_no_asistir:   clean(row['Motivo de no asistencia']),
        paso_6_medio_contacto:       clean(row['Medio de contacto preferido']),
        estado_final:                mapEstadoFinal(clean(row['¿Desea continuar con esta atención pendiente?'])),
        completado:                  true,
        canal_respuesta:             'whatsapp',
      })
    }
  }

  if (matched === 0) {
    return NextResponse.json({
      error: 'Ningún registro matchó — verifique que la campaña seleccionada es correcta',
      matched: 0, noMatch, respondio: 0, noRespondio: 0, fallido: 0,
    }, { status: 422 })
  }

  // Actualizar registros
  const BATCH = 100
  for (let i = 0; i < updatesRegistros.length; i += BATCH) {
    const batch = updatesRegistros.slice(i, i + BATCH)
    for (const upd of batch) {
      const { id_registro, ...campos } = upd
      const camposLimpios = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== null && v !== undefined)
      )
      if (Object.keys(camposLimpios).length === 0) continue
      const { error } = await sb.from('registros').update(camposLimpios).eq('id_registro', id_registro as string)
      if (error) errores++
    }
    await sleep(150)
  }

  // Upsert respuestas
  for (let i = 0; i < upsertRespuestas.length; i += BATCH) {
    const batch = upsertRespuestas.slice(i, i + BATCH)
    const { error } = await sb.from('respuestas')
      .upsert(batch, { onConflict: 'id_registro', ignoreDuplicates: false })
    if (error) errores += batch.length
    await sleep(150)
  }

  return NextResponse.json({ matched, noMatch, respondio, noRespondio, fallido, errores })
}

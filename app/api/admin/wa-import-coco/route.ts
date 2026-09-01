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

// ── Mapas de homologación: texto COCO → código canónico ───────────────────────

const MOTIVO_RETIRO_MAP: Record<string, string> = {
  'Ya no deseo la atención':            'ya_no_deseo_la_atencion',
  'Acudí a otro centro de la CCSS':     'acudi_ccss',
  'Acudí a otro centro médico privado': 'acudi_privado',
  'Ya no necesito la atención':         'ya_no_necesito',
  'Contraindicación médica':            'contraindicacion_medica',
  'Fallecimiento':                      'fallecimiento',
}

const MOTIVO_NO_ASISTIR_MAP: Record<string, string> = {
  'Problemas de salud':                           'problemas_salud',
  'Hospitalización o recuperación médica':        'hospitalizacion',
  'Falta de transporte o traslado':               'falta_transporte',
  'Falta de acompañante o situación familiar':    'falta_acompanante',
  'Obligaciones laborales, académicas o legales': 'obligaciones',
  'Problemas económicos':                         'problemas_economicos',
  'Fuera del país o de la zona':                  'fuera_pais',
  'Decisión personal':                            'decision_personal',
  'Otro motivo':                                  'otro_motivo',
}

const MEDIO_CONTACTO_MAP: Record<string, string> = {
  'Llamada telefónica':     'llamada',
  'WhatsApp':               'whatsapp',
  'Correo electrónico':     'correo',
  'SMS':                    'sms',
  'Cualquiera de opciones': 'cualquiera',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(val: unknown): string | null {
  const v = String(val ?? '').trim()
  return (!v || v === '-') ? null : v
}

function mapLookup(map: Record<string, string>, val: string | null): string | null {
  if (!val) return null
  return map[val] ?? val  // fallback al valor original si no está en el mapa
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

// ── Clasificación por precedencia según flujo del desarrollador ───────────────

type Clasificacion = {
  estadoFinal:   string | null   // código canónico para respuestas.estado_final
  estadoRegistro: string | null  // para actualizar registros.estado — igual a estadoFinal
                                  // siempre que este sea un desenlace terminal real
  waEstado:      'respondio' | 'no_respondio' | 'fallido'
  hasInteraction: boolean
  pasoAbandono:  number | null
}

function clasificar(row: Record<string, unknown>): Clasificacion {
  const errorCoco  = clean(row['error'])
  const cons       = clean(row['Consentimiento informado'])
  const ver        = clean(row['Verificación de identidad'])
  const datos      = clean(row['Datos del caso'])
  const desea      = clean(row['¿Desea continuar con esta atención pendiente?'])
  const retiro     = clean(row['Motivo de retiro de lista de espera'])
  const incorrectos = clean(row['Datos incorrectos reportados por el paciente'])
  const estadoCoco = clean(row['Estado final'])

  if (errorCoco) {
    return { estadoFinal: null, estadoRegistro: null, waEstado: 'fallido', hasInteraction: false, pasoAbandono: null }
  }

  // Paso 1: rechazó consentimiento
  if (cons === 'No autorizo') {
    return { estadoFinal: 'NO_AUTORIZO', estadoRegistro: 'NO_AUTORIZO', waEstado: 'respondio', hasInteraction: true, pasoAbandono: 1 }
  }

  // Paso 2: falló verificación de identidad
  if (ver && ver.includes('Agotó')) {
    return { estadoFinal: 'NO_VERIFICADO', estadoRegistro: 'NO_VERIFICADO', waEstado: 'respondio', hasInteraction: true, pasoAbandono: 2 }
  }

  // Autorizó pero abandonó antes de intentar la verificación (nunca digitó el
  // código). Es interacción real —homólogo a como UTLEForm.tsx trata este mismo
  // punto de abandono en el flujo de correo: sin estado_final definitivo, pero
  // hasInteraction=true—, no "sin respuesta".
  if (cons === 'Autorizo' && !ver) {
    return { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 2 }
  }

  // Paso 3: información incorrecta (datos_incorrectos tiene texto)
  if (incorrectos) {
    return { estadoFinal: 'INFO_INCORRECTA', estadoRegistro: 'INFO_INCORRECTA', waEstado: 'respondio', hasInteraction: true, pasoAbandono: 3 }
  }

  // Paso 4: se retiró de lista
  if (retiro) {
    return { estadoFinal: 'DEPURADO_RENUNCIA', estadoRegistro: 'DEPURADO_RENUNCIA', waEstado: 'respondio', hasInteraction: true, pasoAbandono: 4 }
  }

  // Paso 4: no está asegurado (botón 3 de "¿Desea continuar?") — respuesta definitiva,
  // no un abandono. Debe ir ANTES del chequeo genérico de "desea" más abajo.
  if (desea && desea.toLowerCase().includes('no está asegurado')) {
    return { estadoFinal: 'NO_ASEGURADO', estadoRegistro: 'NO_ASEGURADO', waEstado: 'respondio', hasInteraction: true, pasoAbandono: 4 }
  }

  // Completó el flujo → ACTIVO
  if (estadoCoco && estadoCoco.toLowerCase().includes('complet')) {
    return { estadoFinal: 'ACTIVO', estadoRegistro: 'ACTIVO', waEstado: 'respondio', hasInteraction: true, pasoAbandono: null }
  }

  // Abandonos parciales: verificó pero no terminó
  if (ver === 'Verificado correctamente') {
    if (desea) {
      // Dijo "Sí, deseo continuar" pero abandonó en paso 5 o 6
      return { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 5 }
    }
    if (datos) {
      // Confirmó datos pero no respondió paso 4
      return { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 4 }
    }
    // Verificó pero abandonó antes del paso 3
    return { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 3 }
  }

  // Sin interacción
  return { estadoFinal: null, estadoRegistro: null, waEstado: 'no_respondio', hasInteraction: false, pasoAbandono: null }
}

// ── Normalización de campos a códigos canónicos ───────────────────────────────

function normalizarRespuesta(row: Record<string, unknown>, clasificacion: Clasificacion) {
  const cons       = clean(row['Consentimiento informado'])
  const ver        = clean(row['Verificación de identidad'])
  const datos      = clean(row['Datos del caso'])
  const desea      = clean(row['¿Desea continuar con esta atención pendiente?'])
  const retiro     = clean(row['Motivo de retiro de lista de espera'])
  const incorrectos = clean(row['Datos incorrectos reportados por el paciente'])
  const flex       = clean(row['Flexibilidad de centro médico'])
  const cond       = clean(row['Condiciones para asistir'])
  const motivoNo   = clean(row['Motivo de no asistencia'])
  const medio      = clean(row['Medio de contacto preferido'])

  const { estadoFinal, pasoAbandono, hasInteraction } = clasificacion

  // paso_1: refleja directamente la respuesta de consentimiento del paciente,
  // sin depender de si avanzó a pasos posteriores.
  const paso1 = cons === 'No autorizo'
    ? 'no_autorizo'
    : cons === 'Autorizo'
      ? 'si_autorizo'
      : null

  // paso_2
  const paso2 = ver === 'Verificado correctamente'
    ? 'exitosa'
    : ver && ver.includes('Agotó')
      ? 'fallida'
      : null

  // paso_3
  const paso3 = datos === 'La información es correcta'
    ? 'si'
    : incorrectos
      ? 'no'
      : null

  // paso_4
  const paso4 = desea && (desea.includes('Sí') || desea.includes('Si'))
    ? 'si'
    : desea && desea.toLowerCase().includes('no está asegurado')
      ? 'no_asegurado'
      : retiro
        ? 'no_ya_no_deseo'
        : null

  // paso_5a
  const paso5a = flex && flex.includes('dispuesto')
    ? 'si'
    : flex && flex.includes('disponible')
      ? 'no'
      : null

  // paso_5b
  const paso5b = cond && cond.includes('asistir')
    ? 'si'
    : motivoNo
      ? 'no'
      : null

  return {
    paso_1_consentimiento:       paso1,
    paso_2_verificacion:         paso2,
    paso_3_info_correcta:        paso3,
    paso_3_error:                incorrectos,
    paso_4_desea_continuar:      paso4,
    motivo_retiro:               mapLookup(MOTIVO_RETIRO_MAP, retiro),
    paso_5a_flexibilidad_centro: paso5a,
    paso_5b_condiciones_asistir: paso5b,
    paso_5b_motivo_no_asistir:   mapLookup(MOTIVO_NO_ASISTIR_MAP, motivoNo),
    paso_6_medio_contacto:       mapLookup(MEDIO_CONTACTO_MAP, medio),
    estado_final:                estadoFinal,
    completado:                  estadoFinal === 'ACTIVO',
    paso_abandono:               pasoAbandono,
  }
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

  let fileBuffer: Buffer
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    fileBuffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Error leyendo el archivo' }, { status: 400 })
  }

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

  // Construir mapas cédula → registros e id_registro → registro (maneja cédulas duplicadas)
  type RegInfo = { id_registro: string; especialidad: string | null; encuesta_completada_at: string | null }
  const cedulaMap = new Map<string, RegInfo[]>()
  const idRegistroMap = new Map<string, RegInfo>()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro, cedula_raw, especialidad, encuesta_completada_at')
      .eq('whatsapp_campana_id', waCampanaId)
      .range(from, from + 999)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const r of data) {
      const entry: RegInfo = {
        id_registro:            r.id_registro as string,
        especialidad:           r.especialidad as string | null,
        encuesta_completada_at: r.encuesta_completada_at as string | null,
      }
      idRegistroMap.set(entry.id_registro, entry)
      if (!r.cedula_raw) continue
      const c = String(r.cedula_raw).trim()
      const arr = cedulaMap.get(c)
      if (arr) arr.push(entry)
      else cedulaMap.set(c, [entry])
    }
    if (data.length < 1000) break
    from += 1000
  }

  let matched = 0, noMatch = 0, errores = 0
  let cntActivo = 0, cntDepurado = 0, cntNoAutorizo = 0, cntNoVerificado = 0
  let cntInfoIncorrecta = 0, cntAbandono = 0, cntNoRespondio = 0, cntFallido = 0

  const updatesRegistros: Array<Record<string, unknown>> = []
  const upsertRespuestas: Array<Record<string, unknown>> = []

  for (const row of rows) {
    // Match primario: ID UTLE = id_registro exacto, sin ambigüedad (ni por
    // cédulas repetidas ni por citas múltiples de la misma persona).
    const idUtle = clean(row['ID UTLE'] ?? '')
    const regPorIdUtle = idUtle ? idRegistroMap.get(idUtle) : undefined

    let matchingRegs: RegInfo[]

    if (regPorIdUtle) {
      matchingRegs = [regPorIdUtle]
    } else {
      // Fallback: cédula + especialidad (para filas sin ID UTLE o que no matchean)
      const cedula = clean(row['id'] ?? row['N° Identificación'] ?? '')
      if (!cedula) { noMatch++; continue }

      const allRegs = cedulaMap.get(cedula) ?? []
      if (allRegs.length === 0) { noMatch++; continue }

      const cocoEsp = String(row['Especialidad'] ?? '').trim()
      matchingRegs = cocoEsp
        ? (allRegs.filter(r => (r.especialidad ?? '').trim() === cocoEsp).length > 0
            ? allRegs.filter(r => (r.especialidad ?? '').trim() === cocoEsp)
            : allRegs)
        : allRegs
    }

    matched += matchingRegs.length

    const clasificacion = clasificar(row)
    const hourSent      = parseHourSent(row['hour_sent'])

    // Contadores
    if      (clasificacion.estadoFinal === 'ACTIVO')            cntActivo++
    else if (clasificacion.estadoFinal === 'DEPURADO_RENUNCIA') cntDepurado++
    else if (clasificacion.estadoFinal === 'NO_AUTORIZO')       cntNoAutorizo++
    else if (clasificacion.estadoFinal === 'NO_VERIFICADO')     cntNoVerificado++
    else if (clasificacion.estadoFinal === 'INFO_INCORRECTA')   cntInfoIncorrecta++
    else if (clasificacion.hasInteraction)                      cntAbandono++
    else if (clasificacion.waEstado === 'fallido')              cntFallido++
    else                                                        cntNoRespondio++

    for (const reg of matchingRegs) {
      const yaCompletoPorCorreo = !!reg.encuesta_completada_at

      // ── Actualizar registros ─────────────────────────────────────────────
      const updReg: Record<string, unknown> = {
        id_registro:         reg.id_registro,
        _wa_estado:          clasificacion.waEstado,
        whatsapp_enviado_at: hourSent,
        whatsapp_estado:     clasificacion.waEstado,
        whatsapp_error:      clean(row['error']),
      }

      if (clasificacion.hasInteraction && hourSent) {
        updReg.whatsapp_respondio_at = hourSent
      }
      // encuesta_completada_at = "llegó a un desenlace terminal real", no solo ACTIVO —
      // debe reflejar cualquier respuesta definitiva (NO_AUTORIZO, INFO_INCORRECTA, etc.),
      // igual que ya hace el canal de llamadas.
      if (clasificacion.estadoFinal && !yaCompletoPorCorreo && hourSent) {
        updReg.encuesta_completada_at = hourSent
      }
      if (clasificacion.estadoRegistro) {
        updReg.estado = clasificacion.estadoRegistro
      }

      updatesRegistros.push(updReg)

      // ── Crear respuesta para todos los que interactuaron ─────────────────
      if (clasificacion.hasInteraction) {
        const campos = normalizarRespuesta(row, clasificacion)
        upsertRespuestas.push({
          id_registro: reg.id_registro,
          canal:       'whatsapp',
          ...campos,
        })
      }
    }
  }

  if (matched === 0) {
    return NextResponse.json({
      error: 'Ningún registro matchó — verifique que la campaña seleccionada es correcta',
      matched: 0, noMatch,
    }, { status: 422 })
  }

  // ── Aplicar actualizaciones a registros ───────────────────────────────────
  const BATCH = 100
  for (let i = 0; i < updatesRegistros.length; i += BATCH) {
    const batch = updatesRegistros.slice(i, i + BATCH)
    for (const upd of batch) {
      const { id_registro, _wa_estado, ...campos } = upd
      const camposLimpios = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== null && v !== undefined)
      )
      if (Object.keys(camposLimpios).length === 0) continue
      let query = sb.from('registros').update(camposLimpios).eq('id_registro', id_registro as string)
      // No degradar: si ya está en 'respondio', no sobreescribir con 'no_respondio'
      if (_wa_estado !== 'respondio') query = query.neq('whatsapp_estado', 'respondio')
      const { error } = await query
      if (error) errores++
    }
    await sleep(150)
  }

  // ── Upsert respuestas (todos los que interactuaron) ───────────────────────
  for (let i = 0; i < upsertRespuestas.length; i += BATCH) {
    const batch = upsertRespuestas.slice(i, i + BATCH)
    const { error } = await sb
      .from('respuestas')
      .upsert(batch, { onConflict: 'id_registro, canal', ignoreDuplicates: false })
    if (error) errores += batch.length
    await sleep(150)
  }

  return NextResponse.json({
    matched,
    noMatch,
    errores,
    interactuaron: upsertRespuestas.length,
    detalle: {
      activo:          cntActivo,
      depurado:        cntDepurado,
      no_autorizo:     cntNoAutorizo,
      no_verificado:   cntNoVerificado,
      info_incorrecta: cntInfoIncorrecta,
      abandono:        cntAbandono,
      no_respondio:    cntNoRespondio,
      fallido:         cntFallido,
    },
  })
}

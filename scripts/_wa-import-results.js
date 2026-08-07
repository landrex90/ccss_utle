#!/usr/bin/env node
/**
 * _wa-import-results.js
 *
 * Lee todos los Excel de resultados COCO desde scripts/wa-data/{WA_CAMPANA}/resultados/
 * y actualiza Supabase:
 *   - registros: whatsapp_estado, whatsapp_enviado_at, whatsapp_respondio_at, estado
 *   - respuestas: todos los campos homologados (canal='whatsapp')
 *
 * Uso:
 *   node --env-file=.env.local scripts/_wa-import-results.js --campana WA-CIRUGIA-01
 *   node --env-file=.env.local scripts/_wa-import-results.js --campana WA-CIRUGIA-01 --dry-run
 */

const XLSX             = require('xlsx')
const path             = require('path')
const fs               = require('fs')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? (process.argv[i + 1] ?? '') : ''
}

const WA_CAMPANA = arg('--campana')
const DRY_RUN    = process.argv.includes('--dry-run')

if (!WA_CAMPANA) {
  console.error('❌ --campana requerido. Ej: --campana WA-CIRUGIA-01')
  process.exit(1)
}

const RESULTADOS_DIR = path.join(__dirname, 'wa-data', WA_CAMPANA, 'resultados')

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Mapas de homologación ─────────────────────────────────────────────────────

const MOTIVO_RETIRO_MAP = {
  'Ya no deseo la atención':            'ya_no_deseo_la_atencion',
  'Acudí a otro centro de la CCSS':     'acudi_ccss',
  'Acudí a otro centro médico privado': 'acudi_privado',
  'Ya no necesito la atención':         'ya_no_necesito',
  'Contraindicación médica':            'contraindicacion_medica',
  'Fallecimiento':                      'fallecimiento',
}

const MOTIVO_NO_ASISTIR_MAP = {
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

const MEDIO_CONTACTO_MAP = {
  'Llamada telefónica':     'llamada',
  'WhatsApp':               'whatsapp',
  'Correo electrónico':     'correo',
  'SMS':                    'sms',
  'Cualquiera de opciones': 'cualquiera',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(v) {
  const s = String(v ?? '').trim()
  return (!s || s === '-') ? null : s
}

function mapLookup(map, val) {
  if (!val) return null
  return map[val] ?? val
}

function parseHourSent(val) {
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

// ── Clasificación por precedencia ─────────────────────────────────────────────

function clasificar(row) {
  const errorCoco   = clean(row['error'])
  const cons        = clean(row['Consentimiento informado'])
  const ver         = clean(row['Verificación de identidad'])
  const datos       = clean(row['Datos del caso'])
  const desea       = clean(row['¿Desea continuar con esta atención pendiente?'])
  const retiro      = clean(row['Motivo de retiro de lista de espera'])
  const incorrectos = clean(row['Datos incorrectos reportados por el paciente'])
  const estadoCoco  = clean(row['Estado final'])

  if (errorCoco) return { estadoFinal: null, estadoRegistro: null, waEstado: 'fallido', hasInteraction: false, pasoAbandono: null }

  if (cons === 'No autorizo')
    return { estadoFinal: 'NO_AUTORIZO', estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 1 }

  if (ver && ver.includes('Agotó'))
    return { estadoFinal: 'NO_VERIFICADO', estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 2 }

  if (incorrectos)
    return { estadoFinal: 'INFO_INCORRECTA', estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 3 }

  if (retiro)
    return { estadoFinal: 'DEPURADO_RENUNCIA', estadoRegistro: 'DEPURADO_RENUNCIA', waEstado: 'respondio', hasInteraction: true, pasoAbandono: 4 }

  if (estadoCoco && estadoCoco.toLowerCase().includes('complet'))
    return { estadoFinal: 'ACTIVO', estadoRegistro: 'ACTIVO', waEstado: 'respondio', hasInteraction: true, pasoAbandono: null }

  if (ver === 'Verificado correctamente') {
    if (desea) return { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 5 }
    if (datos) return { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 4 }
    return    { estadoFinal: null, estadoRegistro: null, waEstado: 'respondio', hasInteraction: true, pasoAbandono: 3 }
  }

  return { estadoFinal: null, estadoRegistro: null, waEstado: 'no_respondio', hasInteraction: false, pasoAbandono: null }
}

// ── Normalización a códigos canónicos ─────────────────────────────────────────

function normalizarRespuesta(row, clasificacion) {
  const ver         = clean(row['Verificación de identidad'])
  const datos       = clean(row['Datos del caso'])
  const desea       = clean(row['¿Desea continuar con esta atención pendiente?'])
  const retiro      = clean(row['Motivo de retiro de lista de espera'])
  const incorrectos = clean(row['Datos incorrectos reportados por el paciente'])
  const flex        = clean(row['Flexibilidad de centro médico'])
  const cond        = clean(row['Condiciones para asistir'])
  const motivoNo    = clean(row['Motivo de no asistencia'])
  const medio       = clean(row['Medio de contacto preferido'])

  const { estadoFinal, pasoAbandono, hasInteraction } = clasificacion

  const paso1 = estadoFinal === 'NO_AUTORIZO'
    ? 'no_autorizo'
    : (hasInteraction && ver !== null ? 'si_autorizo' : null)

  const paso2 = ver === 'Verificado correctamente' ? 'exitosa'
    : (ver && ver.includes('Agotó') ? 'fallida' : null)

  const paso3 = datos === 'La información es correcta' ? 'si'
    : (incorrectos ? 'no' : null)

  const paso4 = (desea && (desea.includes('Sí') || desea.includes('Si'))) ? 'si'
    : (retiro ? 'no_ya_no_deseo' : null)

  const paso5a = flex && flex.includes('dispuesto') ? 'si'
    : (flex && flex.includes('disponible') ? 'no' : null)

  const paso5b = cond && cond.includes('asistir') ? 'si'
    : (motivoNo ? 'no' : null)

  return {
    canal:                       'whatsapp',
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📲 WA Import Results — ${WA_CAMPANA}`)
  console.log(`   Modo: ${DRY_RUN ? 'DRY RUN' : 'PRODUCCIÓN'}\n`)

  // Verificar carpeta
  if (!fs.existsSync(RESULTADOS_DIR)) {
    console.error(`❌ Carpeta no encontrada: ${RESULTADOS_DIR}`)
    process.exit(1)
  }

  // Leer todos los xlsx en resultados/
  const archivos = fs.readdirSync(RESULTADOS_DIR)
    .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))

  if (archivos.length === 0) {
    console.error(`❌ No hay archivos .xlsx en ${RESULTADOS_DIR}`)
    process.exit(1)
  }

  console.log(`   Archivos encontrados: ${archivos.length}`)
  archivos.forEach(f => console.log(`     - ${f}`))

  // Leer y combinar todas las filas
  let allRows = []
  for (const archivo of archivos) {
    const wb   = XLSX.readFile(path.join(RESULTADOS_DIR, archivo))
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    console.log(`   ${archivo}: ${rows.length} filas`)
    allRows = allRows.concat(rows)
  }

  // Deduplicar por N° Identificación (si hay archivos solapados)
  const seen   = new Set()
  const rows   = []
  let   dupCnt = 0
  for (const r of allRows) {
    const ced = clean(r['id'] ?? r['N° Identificación'] ?? '')
    if (!ced) continue
    if (seen.has(ced)) { dupCnt++; continue }
    seen.add(ced)
    rows.push(r)
  }
  console.log(`\n   Total filas únicas: ${rows.length}${dupCnt ? ` (${dupCnt} duplicadas ignoradas)` : ''}`)

  // Cargar mapa cédula → registros desde Supabase
  console.log(`\n🔍 Cargando registros con whatsapp_campana_id='${WA_CAMPANA}'...`)
  const cedulaMap = new Map()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro, cedula_raw, especialidad, encuesta_completada_at')
      .eq('whatsapp_campana_id', WA_CAMPANA)
      .order('id_registro')
      .range(from, from + 999)

    if (error) { console.error('❌ Error Supabase:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data) {
      if (!r.cedula_raw) continue
      const c   = String(r.cedula_raw).trim()
      const arr = cedulaMap.get(c)
      if (arr) arr.push(r)
      else cedulaMap.set(c, [r])
    }
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`   Registros en BD con esta campaña: ${[...cedulaMap.values()].reduce((s, a) => s + a.length, 0)}`)

  // Procesar filas
  let matched = 0, noMatch = 0
  const contadores = { activo: 0, depurado: 0, no_autorizo: 0, no_verificado: 0, info_incorrecta: 0, abandono: 0, no_respondio: 0, fallido: 0 }
  const updatesRegistros = []
  const upsertRespuestas = []

  for (const row of rows) {
    const cedula  = clean(row['id'] ?? row['N° Identificación'] ?? '')
    if (!cedula) { noMatch++; continue }

    const allRegs = cedulaMap.get(cedula) ?? []
    if (allRegs.length === 0) { noMatch++; continue }

    const cocoEsp     = String(row['Especialidad'] ?? '').trim()
    const matchingRegs = cocoEsp
      ? (allRegs.filter(r => (r.especialidad ?? '').trim() === cocoEsp).length > 0
          ? allRegs.filter(r => (r.especialidad ?? '').trim() === cocoEsp)
          : allRegs)
      : allRegs

    matched += matchingRegs.length

    const clasificacion = clasificar(row)
    const hourSent      = parseHourSent(row['hour_sent'])

    if      (clasificacion.estadoFinal === 'ACTIVO')            contadores.activo++
    else if (clasificacion.estadoFinal === 'DEPURADO_RENUNCIA') contadores.depurado++
    else if (clasificacion.estadoFinal === 'NO_AUTORIZO')       contadores.no_autorizo++
    else if (clasificacion.estadoFinal === 'NO_VERIFICADO')     contadores.no_verificado++
    else if (clasificacion.estadoFinal === 'INFO_INCORRECTA')   contadores.info_incorrecta++
    else if (clasificacion.hasInteraction)                      contadores.abandono++
    else if (clasificacion.waEstado === 'fallido')              contadores.fallido++
    else                                                        contadores.no_respondio++

    for (const reg of matchingRegs) {
      const yaCompletoPorCorreo = !!reg.encuesta_completada_at

      const updReg = {
        id_registro:         reg.id_registro,
        _wa_estado:          clasificacion.waEstado,
        whatsapp_enviado_at: hourSent,
        whatsapp_estado:     clasificacion.waEstado,
        whatsapp_error:      clean(row['error']),
      }
      if (clasificacion.hasInteraction && hourSent) updReg.whatsapp_respondio_at = hourSent
      if (clasificacion.estadoFinal === 'ACTIVO' && !yaCompletoPorCorreo && hourSent) updReg.encuesta_completada_at = hourSent
      if (clasificacion.estadoRegistro) updReg.estado = clasificacion.estadoRegistro

      updatesRegistros.push(updReg)

      if (clasificacion.hasInteraction) {
        upsertRespuestas.push({
          id_registro: reg.id_registro,
          ...normalizarRespuesta(row, clasificacion),
        })
      }
    }
  }

  // Resumen
  console.log(`\n📊 Análisis:`)
  console.log(`   Matcheados         : ${matched}`)
  console.log(`   Sin match          : ${noMatch}`)
  console.log(`   ACTIVO             : ${contadores.activo}`)
  console.log(`   DEPURADO_RENUNCIA  : ${contadores.depurado}`)
  console.log(`   NO_AUTORIZO        : ${contadores.no_autorizo}`)
  console.log(`   NO_VERIFICADO      : ${contadores.no_verificado}`)
  console.log(`   INFO_INCORRECTA    : ${contadores.info_incorrecta}`)
  console.log(`   Abandono parcial   : ${contadores.abandono}`)
  console.log(`   No respondió       : ${contadores.no_respondio}`)
  console.log(`   Fallido (error)    : ${contadores.fallido}`)
  console.log(`   Respuestas a crear : ${upsertRespuestas.length}`)

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN — sin cambios en BD.\n')
    return
  }

  // Actualizar registros
  console.log(`\n📤 Actualizando registros...`)
  const BATCH = 100
  let errores = 0
  for (let i = 0; i < updatesRegistros.length; i += BATCH) {
    const batch = updatesRegistros.slice(i, i + BATCH)
    for (const upd of batch) {
      const { id_registro, _wa_estado, ...campos } = upd
      const camposLimpios = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== null && v !== undefined)
      )
      if (Object.keys(camposLimpios).length === 0) continue
      let query = sb.from('registros').update(camposLimpios).eq('id_registro', id_registro)
      if (_wa_estado !== 'respondio') query = query.neq('whatsapp_estado', 'respondio')
      const { error } = await query
      if (error) errores++
    }
    process.stdout.write(`\r   Progreso registros: ${Math.min(i + BATCH, updatesRegistros.length)}/${updatesRegistros.length}`)
    await sleep(150)
  }
  console.log(`\n   Errores: ${errores}`)

  // Upsert respuestas
  console.log(`\n📝 Insertando respuestas (${upsertRespuestas.length} registros)...`)
  let erroresResp = 0
  for (let i = 0; i < upsertRespuestas.length; i += BATCH) {
    const batch = upsertRespuestas.slice(i, i + BATCH)
    const { error } = await sb
      .from('respuestas')
      .upsert(batch, { onConflict: 'id_registro, canal', ignoreDuplicates: false })
    if (error) { erroresResp += batch.length; console.error(`\n   Error: ${error.message}`) }
    process.stdout.write(`\r   Progreso respuestas: ${Math.min(i + BATCH, upsertRespuestas.length)}/${upsertRespuestas.length}`)
    await sleep(150)
  }
  console.log(`\n   Errores: ${erroresResp}`)

  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ Import WA-CIRUGIA-01 completado`)
  console.log(`   Registros actualizados : ${updatesRegistros.length}`)
  console.log(`   Respuestas guardadas   : ${upsertRespuestas.length}`)
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

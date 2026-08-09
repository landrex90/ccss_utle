#!/usr/bin/env node
/**
 * _llamadas-import-results.js
 *
 * Lee los Excel de resultados Infobip IVR desde scripts/llamadas-data/{LLAMADA_ID}/resultados/
 * y actualiza Supabase:
 *   - registros: llamada_estado, llamada_enviada_at, estado (si aplica), encuesta_completada_at
 *   - respuestas: canal='llamada', mismos pasos que correo/WA
 *
 * Uso:
 *   node --env-file=.env.local scripts/_llamadas-import-results.js --campana LLAMADA-CIRUGIA-01 --dry-run
 *   node --env-file=.env.local scripts/_llamadas-import-results.js --campana LLAMADA-CIRUGIA-01
 *   node --env-file=.env.local scripts/_llamadas-import-results.js --campana LLAMADA-CE-01
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

const LLAMADA_ID = arg('--campana')
const DRY_RUN    = process.argv.includes('--dry-run')

if (!LLAMADA_ID) {
  console.error('❌ --campana requerido. Ej: --campana LLAMADA-CIRUGIA-01')
  process.exit(1)
}

const RESULTADOS_DIR = path.join(__dirname, 'llamadas-data', LLAMADA_ID, 'resultados')
const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Mismos mapas de homologación que WA (el flujo es idéntico) ────────────────

const MOTIVO_RETIRO_MAP = {
  'Ya no deseo la atención':            'ya_no_deseo_la_atencion',
  'Acudí a otro centro de la CCSS':     'acudi_ccss',
  'Acudí a otro centro médico privado': 'acudi_privado',
  'Ya no necesito la atención':         'ya_no_necesito',
  'Contraindicación médica':            'contraindicacion_medica',
  'Fallecimiento':                      'fallecimiento',
  // Versiones cortas que puede devolver el IVR
  'Ya no desea':                        'ya_no_deseo_la_atencion',
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
  'Whatsappp':              'whatsapp',   // typo en flujo Infobip
  'Whatsapp':               'whatsapp',
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

function parseJson(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

function parseFechaInfobip(str) {
  // Formato Infobip: "07/08/2026 17:54:47"
  if (!str) return null
  try {
    const [fecha, hora] = String(str).trim().split(' ')
    if (!fecha) return null
    const [d, m, y] = fecha.split('/')
    return new Date(`${y}-${m}-${d}T${hora ?? '00:00:00'}`).toISOString()
  } catch { return null }
}

// ── Clasificación (mismo árbol de decisión que WA) ────────────────────────────

function clasificar(mapped, status, answeredBy) {
  // No contestó: Status distinto a Delivered o no respondió HUMAN/MACHINE
  if (status !== 'Delivered') {
    return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'no_contestada', hasInteraction: false, pasoAbandono: null }
  }
  if (!answeredBy || answeredBy === 'NO_ANSWER') {
    return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'no_contestada', hasInteraction: false, pasoAbandono: null }
  }

  // CE-01 usa clave "Autorizo"; CIRUGIA-01 usa "Recolectar" — fallback entre ambas
  const cons   = clean(mapped['Recolectar'] ?? mapped['Autorizo'])
  const datos  = clean(mapped['Recolectar (3)'])
  const desea  = clean(mapped['Recolectar (4)'])
  const retiro = clean(mapped['MotivoRetiro'])

  // Paso 1 — No autorizó
  if (cons && cons.toLowerCase().includes('no autorizo')) {
    return { estadoFinal: 'NO_AUTORIZO', estadoRegistro: 'NO_AUTORIZO', llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 1 }
  }

  // Paso 3 — Info incorrecta (si datos no es "Si es correcta" y hay algo)
  if (datos && !datos.toLowerCase().includes('correcta')) {
    return { estadoFinal: 'INFO_INCORRECTA', estadoRegistro: null, llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 3 }
  }

  // Paso 4 — Ya no desea / retiro
  if ((desea && desea.toLowerCase().includes('no desea')) || retiro) {
    return { estadoFinal: 'DEPURADO_RENUNCIA', estadoRegistro: 'DEPURADO_RENUNCIA', llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 4 }
  }

  // Paso 4 — Desea continuar → ACTIVO
  if (desea && desea.toLowerCase().includes('continuar')) {
    return { estadoFinal: 'ACTIVO', estadoRegistro: 'ACTIVO', llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: null }
  }

  // Interacción parcial (autorizó pero no completó el flujo)
  if (cons && cons.toLowerCase().includes('si autorizo')) {
    return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 3 }
  }

  // Entregada pero sin respuestas útiles (contestó y colgó)
  return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'completada', hasInteraction: false, pasoAbandono: null }
}

// ── Normalización a respuestas canónicas ──────────────────────────────────────

function normalizarRespuesta(mapped, payload, clasificacion) {
  const cons       = clean(mapped['Recolectar'] ?? mapped['Autorizo'])
  const digitos    = clean(mapped['Recolectar (2)'])  // valor raw ingresado
  const comparar   = clean(payload['COMPARA_4_DIGITOS'] ?? payload['VALIDACION_ID'])
  const datos      = clean(mapped['Recolectar (3)'])
  const desea      = clean(mapped['Recolectar (4)'])
  const retiro     = clean(mapped['MotivoRetiro'])
  const flex       = clean(mapped['Recolectar (5)'])
  const cond       = clean(mapped['Recolectar 5b'])
  const motivoNo   = clean(mapped['Recolectar (7)'])
  const medio      = clean(mapped['Recolectar 6 Medio Contacto'])

  const { estadoFinal, pasoAbandono, hasInteraction } = clasificacion

  // Paso 1
  const paso1 = !cons ? null
    : cons.toLowerCase().includes('no autorizo') ? 'no_autorizo'
    : cons.toLowerCase().includes('si autorizo') ? 'si_autorizo'
    : null

  // Paso 2 — verificar si los dígitos ingresados coinciden
  const verificado = digitos && comparar ? digitos === comparar : null
  const paso2 = verificado === null ? null : (verificado ? 'exitosa' : 'fallida')

  // Paso 3
  const paso3 = !datos ? null
    : datos.toLowerCase().includes('correcta') ? 'si' : 'no'

  // Paso 4
  const paso4 = !desea ? null
    : desea.toLowerCase().includes('continuar') ? 'si'
    : desea.toLowerCase().includes('no desea')  ? 'no_ya_no_deseo'
    : null

  // Paso 5a — flexibilidad centro
  const paso5a = !flex ? null
    : (flex === 'Sí' || flex === 'Si') ? 'si'
    : flex === 'No'                    ? 'no'
    : null

  // Paso 5b — puede asistir
  const paso5b = !cond ? null
    : (cond === 'Sí' || cond === 'Si') ? 'si'
    : cond === 'No'                    ? 'no'
    : null

  return {
    canal:                       'llamada',
    paso_1_consentimiento:       paso1,
    paso_2_verificacion:         paso2,
    paso_3_info_correcta:        paso3,
    paso_3_error:                null,
    paso_4_desea_continuar:      paso4,
    motivo_retiro:               mapLookup(MOTIVO_RETIRO_MAP, retiro ?? (desea?.includes('no desea') ? desea : null)),
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
  console.log(`\n📞 Llamadas Import Results — ${LLAMADA_ID}`)
  console.log(`   Modo: ${DRY_RUN ? 'DRY RUN' : 'PRODUCCIÓN'}\n`)

  if (!fs.existsSync(RESULTADOS_DIR)) {
    console.error(`❌ Carpeta no encontrada: ${RESULTADOS_DIR}`)
    console.error(`   Esperada: ${RESULTADOS_DIR}`)
    process.exit(1)
  }

  const archivos = fs.readdirSync(RESULTADOS_DIR)
    .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))

  if (archivos.length === 0) {
    console.error(`❌ No hay archivos .xlsx en ${RESULTADOS_DIR}`)
    process.exit(1)
  }

  console.log(`   Archivos encontrados: ${archivos.length}`)
  archivos.forEach(f => console.log(`     - ${f}`))

  // Leer y combinar todos los Excel
  let allRows = []
  for (const archivo of archivos) {
    const wb   = XLSX.readFile(path.join(RESULTADOS_DIR, archivo))
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    console.log(`   ${archivo}: ${rows.length} filas`)
    allRows = allRows.concat(rows)
  }

  // Filtrar Pending (llamadas aún no ejecutadas — no importar hasta que tengan estado final)
  const pendingCnt = allRows.filter(r => clean(r['Status']) === 'Pending').length
  if (pendingCnt > 0) console.log(`   ⚠️  ${pendingCnt} filas con Status=Pending ignoradas (aún en cola)`)
  const finalRows = allRows.filter(r => clean(r['Status']) !== 'Pending')

  // Deduplicar por id_registro_utle (por si hay archivos solapados de Infobip)
  const seen   = new Set()
  const rows   = []
  let   dupCnt = 0
  for (const r of finalRows) {
    const payload = parseJson(r['Data Payload'])
    // Orden de prioridad: id_registro_utle > externalPersonId > columna 'external id person'
    const idReg = clean(
      payload['id_registro_utle'] ??
      payload['externalPersonId'] ??
      r['external id person'] ?? ''
    )
    if (!idReg) { dupCnt++; continue }
    if (seen.has(idReg)) { dupCnt++; continue }
    seen.add(idReg)
    rows.push({ ...r, _id_registro_utle: idReg, _payload: payload })
  }
  console.log(`\n   Total filas con estado final: ${rows.length}${dupCnt ? ` (${dupCnt} duplicadas/sin ID ignoradas)` : ''}`)

  // Procesar filas
  const contadores = {
    activo: 0, depurado: 0, no_autorizo: 0, info_incorrecta: 0,
    abandono: 0, no_contestada: 0, fallido: 0
  }
  const updatesRegistros = []
  const upsertRespuestas = []
  let sinMatch = 0

  for (const row of rows) {
    const idRegistro = parseInt(row._id_registro_utle, 10)
    if (isNaN(idRegistro)) { sinMatch++; continue }

    const status     = clean(row['Status'])
    const answeredBy = clean(row['Answered By'])
    const sendAt     = parseFechaInfobip(row['Send At'])
    const mapped     = parseJson(row['IVR Mapped Responses'])
    const payload    = row._payload

    const clas = clasificar(mapped, status, answeredBy)

    if      (clas.estadoFinal === 'ACTIVO')            contadores.activo++
    else if (clas.estadoFinal === 'DEPURADO_RENUNCIA') contadores.depurado++
    else if (clas.estadoFinal === 'NO_AUTORIZO')       contadores.no_autorizo++
    else if (clas.estadoFinal === 'INFO_INCORRECTA')   contadores.info_incorrecta++
    else if (clas.llamadaEstado === 'no_contestada')   contadores.no_contestada++
    else if (clas.hasInteraction)                      contadores.abandono++
    else                                               contadores.fallido++

    const updReg = {
      id_registro:      idRegistro,
      llamada_estado:   clas.llamadaEstado,
      llamada_enviada_at: sendAt,
    }
    if (clas.estadoRegistro)                       updReg.estado = clas.estadoRegistro
    const esRespuestaDefinitiva = clas.estadoFinal === 'ACTIVO' || clas.estadoFinal === 'DEPURADO_RENUNCIA' || clas.estadoFinal === 'NO_AUTORIZO'
    if (esRespuestaDefinitiva && sendAt)           updReg.encuesta_completada_at = sendAt

    updatesRegistros.push(updReg)

    if (clas.hasInteraction) {
      upsertRespuestas.push({
        id_registro: idRegistro,
        ...normalizarRespuesta(mapped, payload, clas),
      })
    }
  }

  // Resumen
  console.log(`\n📊 Análisis:`)
  console.log(`   Total procesados   : ${rows.length}`)
  console.log(`   Sin match ID       : ${sinMatch}`)
  console.log(`   ACTIVO             : ${contadores.activo}`)
  console.log(`   DEPURADO_RENUNCIA  : ${contadores.depurado}`)
  console.log(`   NO_AUTORIZO        : ${contadores.no_autorizo}`)
  console.log(`   INFO_INCORRECTA    : ${contadores.info_incorrecta}`)
  console.log(`   Abandono parcial   : ${contadores.abandono}`)
  console.log(`   No contestó        : ${contadores.no_contestada}`)
  console.log(`   Sin respuestas útiles: ${contadores.fallido}`)
  console.log(`   Respuestas a crear : ${upsertRespuestas.length}`)

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN — sin cambios en BD.\n')
    if (rows.length > 0) {
      console.log('   Muestra primera fila procesada:')
      const r = rows[0]
      console.log('   id_registro_utle:', r._id_registro_utle)
      console.log('   Status          :', r['Status'])
      console.log('   IVR Mapped      :', JSON.stringify(parseJson(r['IVR Mapped Responses'])))
    }
    return
  }

  // Actualizar registros
  console.log(`\n📤 Actualizando registros...`)
  const BATCH = 100
  let errores = 0
  for (let i = 0; i < updatesRegistros.length; i += BATCH) {
    const batch = updatesRegistros.slice(i, i + BATCH)
    for (const upd of batch) {
      const { id_registro, ...campos } = upd
      const camposLimpios = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== null && v !== undefined)
      )
      if (Object.keys(camposLimpios).length === 0) continue
      const { error } = await sb.from('registros').update(camposLimpios).eq('id_registro', id_registro)
      if (error) errores++
    }
    process.stdout.write(`\r   Progreso registros: ${Math.min(i + BATCH, updatesRegistros.length)}/${updatesRegistros.length}`)
    await sleep(150)
  }
  console.log(`\n   Errores: ${errores}`)

  // Upsert respuestas
  if (upsertRespuestas.length > 0) {
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
    console.log(`\n   Errores respuestas: ${erroresResp}`)
  }

  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ Import ${LLAMADA_ID} completado`)
  console.log(`   Registros actualizados : ${updatesRegistros.length}`)
  console.log(`   Respuestas guardadas   : ${upsertRespuestas.length}`)
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

#!/usr/bin/env node
/**
 * _wa-import-cirugia01.js
 *
 * Importa resultados WA campaña CIRUGIA-01 desde archivo COCO.
 * Lógica idéntica al flujo de correo (survey-response/route.ts):
 *
 *   "Completó el flujo"          → estado=ACTIVO,           completado=true,  encuesta_completada_at=hourSent
 *   Motivo de retiro ≠ null      → estado=DEPURADO_RENUNCIA, completado=true,  encuesta_completada_at=hourSent
 *   Consentimiento = "No autorizo" → estado=NO_AUTORIZO,      completado=false, sin encuesta_completada_at
 *   Verificación = "Agotó 3 intentos" → estado=NO_VERIFICADO, completado=false, sin encuesta_completada_at
 *   Sin datos                    → whatsapp_estado=no_respondio, sin cambio de estado ni respuesta
 *
 * Match (cédula + especialidad):
 *   1. Cedula + especialidad exacta  → actualizar esos id_registros
 *   2. Sin match por especialidad    → actualizar TODOS los registros de esa cédula
 *
 * Uso:
 *   node --env-file=.env.local scripts/_wa-import-cirugia01.js --dry-run
 *   node --env-file=.env.local scripts/_wa-import-cirugia01.js
 */

const XLSX = require('xlsx')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

const FILE_PATH  = path.join(__dirname, '..', 'Campañas WhatsApp COCO', 'campaigns_20260727_111832.xlsx')
const WA_CAMPANA = 'WA-CIRUGIA-01'
const DRY_RUN    = process.argv.includes('--dry-run')

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

function clean(val) {
  const v = String(val ?? '').trim()
  return (!v || v === '-') ? null : v
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

/**
 * Clasifica una fila COCO en el estado equivalente al flujo de correo.
 * Retorna { estadoFinal, waEstado, completado, insertarRespuesta }
 */
function clasificarFila(row) {
  const estadoCoco    = clean(row['Estado final'])
  const consentimiento = clean(row['Consentimiento informado'])
  const verificacion  = clean(row['Verificación de identidad'])
  const motivoRetiro  = clean(row['Motivo de retiro de lista de espera'])
  const error         = clean(row['error'])

  // Error técnico de COCO (distinto a no-respuesta)
  if (error) return { estadoFinal: null, waEstado: 'fallido', completado: false, insertarRespuesta: false }

  // Completó el flujo positivamente → ACTIVO
  if (estadoCoco?.toLowerCase().includes('complet')) {
    return { estadoFinal: 'ACTIVO', waEstado: 'respondio', completado: true, insertarRespuesta: true }
  }

  // Explicitamente no quiere la atención → DEPURADO_RENUNCIA
  if (motivoRetiro) {
    return { estadoFinal: 'DEPURADO_RENUNCIA', waEstado: 'respondio', completado: true, insertarRespuesta: true }
  }

  // No autorizó el consentimiento → NO_AUTORIZO
  if (consentimiento === 'No autorizo') {
    return { estadoFinal: 'NO_AUTORIZO', waEstado: 'respondio', completado: false, insertarRespuesta: true }
  }

  // Agotó intentos de verificación → NO_VERIFICADO
  if (verificacion?.toLowerCase().includes('agot')) {
    return { estadoFinal: 'NO_VERIFICADO', waEstado: 'respondio', completado: false, insertarRespuesta: true }
  }

  // No tuvo ninguna interacción → no_respondio, sin respuesta
  return { estadoFinal: null, waEstado: 'no_respondio', completado: false, insertarRespuesta: false }
}

async function main() {
  console.log(`\n📥 WA IMPORT — ${WA_CAMPANA}`)
  console.log(`   Archivo: ${path.basename(FILE_PATH)}`)
  console.log(`   Modo   : ${DRY_RUN ? 'DRY RUN — nada se escribe' : 'PRODUCCIÓN'}\n`)

  // ── 1. Leer Excel COCO ──────────────────────────────────────────────────────
  let cocoRows
  try {
    const wb = XLSX.readFile(FILE_PATH)
    cocoRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  } catch (e) {
    console.error('❌ No se pudo leer el archivo:', e.message)
    process.exit(1)
  }
  console.log(`📄 Filas COCO: ${cocoRows.length}`)

  // ── 2. Cargar BD — todos los registros de WA-CIRUGIA-01 ────────────────────
  console.log('🔍 Cargando registros BD...')
  const bdRegs = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro, cedula_raw, especialidad, encuesta_completada_at, whatsapp_estado')
      .eq('whatsapp_campana_id', WA_CAMPANA)
      .order('id_registro')
      .range(from, from + 999)
    if (error) { console.error('❌ BD:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    bdRegs.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`   Registros con ${WA_CAMPANA}: ${bdRegs.length}`)

  // Construir mapa cédula → registros
  const bdMap = {}
  for (const r of bdRegs) {
    const c = String(r.cedula_raw || '').trim()
    if (!bdMap[c]) bdMap[c] = []
    bdMap[c].push(r)
  }

  function getMatching(cedula, cocoEsp) {
    const records = bdMap[cedula] || []
    if (!cocoEsp) return records
    const byEsp = records.filter(r => (r.especialidad || '').trim() === cocoEsp)
    return byEsp.length > 0 ? byEsp : records
  }

  // ── 3. Procesar filas COCO ──────────────────────────────────────────────────
  let sinMatch = 0
  const conteo = { ACTIVO: 0, DEPURADO_RENUNCIA: 0, NO_AUTORIZO: 0, NO_VERIFICADO: 0, no_respondio: 0, fallido: 0 }
  let totalRegistrosActualizar = 0, totalRespuestas = 0

  const updatesRegistros = []
  const upsertRespuestas = []

  for (const row of cocoRows) {
    const cedula  = String(row['id'] || '').trim()
    const cocoEsp = String(row['Especialidad'] || '').trim()
    if (!cedula) { sinMatch++; continue }

    const matching = getMatching(cedula, cocoEsp)
    if (matching.length === 0) { sinMatch++; continue }

    const { estadoFinal, waEstado, completado, insertarRespuesta } = clasificarFila(row)
    const hourSent = parseHourSent(row['hour_sent'])

    // Conteo por tipo (a nivel de fila COCO, no id_registro)
    if (estadoFinal) conteo[estadoFinal] = (conteo[estadoFinal] || 0) + 1
    else conteo[waEstado] = (conteo[waEstado] || 0) + 1

    totalRegistrosActualizar += matching.length
    if (insertarRespuesta) totalRespuestas += matching.length

    for (const reg of matching) {
      const yaCompletoPorCorreo = !!reg.encuesta_completada_at

      // Campos a actualizar en registros
      const campos = {
        whatsapp_enviado_at: hourSent,
        whatsapp_estado:     waEstado,
      }
      if (waEstado === 'respondio') {
        campos.whatsapp_respondio_at = hourSent
      }
      // Solo actualizar estado si no ha completado por correo (no degradar)
      if (estadoFinal && !yaCompletoPorCorreo) {
        campos.estado = estadoFinal
      }
      // Solo fijar encuesta_completada_at si completó y no la tiene ya
      if (completado && !yaCompletoPorCorreo && hourSent) {
        campos.encuesta_completada_at = hourSent
      }

      updatesRegistros.push({ id_registro: reg.id_registro, _wa_estado: waEstado, ...campos })

      if (insertarRespuesta) {
        upsertRespuestas.push({
          id_registro:                 reg.id_registro,
          canal:                       'whatsapp',
          paso_1_consentimiento:       clean(row['Consentimiento informado']),
          paso_2_verificacion:         clean(row['Verificación de identidad']),
          paso_3_info_correcta:        clean(row['Datos del caso']),
          paso_4_desea_continuar:      clean(row['¿Desea continuar con esta atención pendiente?']),
          motivo_retiro:               clean(row['Motivo de retiro de lista de espera']),
          paso_5a_flexibilidad_centro: clean(row['Flexibilidad de centro médico']),
          paso_5b_condiciones_asistir: clean(row['Condiciones para asistir']),
          paso_5b_motivo_no_asistir:   clean(row['Motivo de no asistencia']),
          paso_6_medio_contacto:       clean(row['Medio de contacto preferido']),
          estado_final:                estadoFinal,
          completado,
        })
      }
    }
  }

  // ── 4. Reporte ──────────────────────────────────────────────────────────────
  console.log('\n📊 ANÁLISIS PREVIO A ESCRITURA')
  console.log('─'.repeat(50))
  console.log(`   Filas COCO procesadas        : ${cocoRows.length}`)
  console.log(`   Sin match en BD              : ${sinMatch}`)
  console.log()
  console.log(`   ACTIVO (completaron Sí)      : ${conteo.ACTIVO || 0}`)
  console.log(`   DEPURADO_RENUNCIA (retiro)   : ${conteo.DEPURADO_RENUNCIA || 0}`)
  console.log(`   NO_AUTORIZO (no consintieron): ${conteo.NO_AUTORIZO || 0}`)
  console.log(`   NO_VERIFICADO (falló 3 veces): ${conteo.NO_VERIFICADO || 0}`)
  console.log(`   no_respondio (sin interacción): ${conteo.no_respondio || 0}`)
  console.log(`   fallido (error técnico)      : ${conteo.fallido || 0}`)
  console.log()
  console.log(`   Registros BD a actualizar    : ${totalRegistrosActualizar}`)
  console.log(`   Respuestas a insertar        : ${totalRespuestas}`)

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — muestra ACTIVO (primeros 3):')
    updatesRegistros.filter(u => u.estado === 'ACTIVO').slice(0, 3).forEach(u =>
      console.log(`   ${u.id_registro} | completada_at: ${u.encuesta_completada_at?.slice(0,10) || '(no se toca)'}`)
    )
    console.log('\n🧪 DRY RUN — muestra DEPURADO_RENUNCIA:')
    updatesRegistros.filter(u => u.estado === 'DEPURADO_RENUNCIA').slice(0, 5).forEach(u =>
      console.log(`   ${u.id_registro}`)
    )
    console.log('\n🧪 DRY RUN — muestra NO_AUTORIZO (primeros 3):')
    updatesRegistros.filter(u => u.estado === 'NO_AUTORIZO').slice(0, 3).forEach(u =>
      console.log(`   ${u.id_registro}`)
    )
    console.log('\n✅ DRY RUN completado — nada escrito en BD.\n')
    return
  }

  // ── 5. Actualizar registros ─────────────────────────────────────────────────
  console.log('\n📝 Actualizando registros...')
  const BATCH = 100
  let errReg = 0
  for (let i = 0; i < updatesRegistros.length; i += BATCH) {
    const batch = updatesRegistros.slice(i, i + BATCH)
    for (const upd of batch) {
      const { id_registro, _wa_estado, ...campos } = upd
      const camposLimpios = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== null && v !== undefined)
      )
      if (Object.keys(camposLimpios).length === 0) continue
      // No degradar respondio → no_respondio si ya estaba respondio
      let query = sb.from('registros').update(camposLimpios).eq('id_registro', id_registro)
      if (_wa_estado !== 'respondio') query = query.neq('whatsapp_estado', 'respondio')
      const { error } = await query
      if (error) { errReg++; console.error(`   ⚠️  ${id_registro}: ${error.message}`) }
    }
    process.stdout.write(`\r   ${Math.min(i + BATCH, updatesRegistros.length)}/${updatesRegistros.length}`)
    await sleep(150)
  }
  console.log(`\n   ✅ ${updatesRegistros.length - errReg} registros actualizados`)

  // ── 6. Upsert respuestas ────────────────────────────────────────────────────
  if (upsertRespuestas.length > 0) {
    console.log('\n📝 Insertando respuestas WA...')
    let errResp = 0
    for (let i = 0; i < upsertRespuestas.length; i += BATCH) {
      const batch = upsertRespuestas.slice(i, i + BATCH)
      const { error } = await sb.from('respuestas')
        .upsert(batch, { onConflict: 'id_registro, canal', ignoreDuplicates: false })
      if (error) { errResp += batch.length; console.error(`   ⚠️  Batch ${i}: ${error.message}`) }
      process.stdout.write(`\r   ${Math.min(i + BATCH, upsertRespuestas.length)}/${upsertRespuestas.length}`)
      await sleep(150)
    }
    console.log(`\n   ✅ ${upsertRespuestas.length - errResp} respuestas insertadas/actualizadas`)
  }

  // ── 7. Resumen ──────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ IMPORT COMPLETADO — ${WA_CAMPANA}`)
  console.log(`   ACTIVO              : ${conteo.ACTIVO || 0}`)
  console.log(`   DEPURADO_RENUNCIA   : ${conteo.DEPURADO_RENUNCIA || 0}`)
  console.log(`   NO_AUTORIZO         : ${conteo.NO_AUTORIZO || 0}`)
  console.log(`   NO_VERIFICADO       : ${conteo.NO_VERIFICADO || 0}`)
  console.log(`   no_respondio        : ${conteo.no_respondio || 0}`)
  console.log(`   Registros actualizados: ${totalRegistrosActualizar - errReg}`)
  console.log(`   Respuestas insertadas : ${totalRespuestas}`)
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

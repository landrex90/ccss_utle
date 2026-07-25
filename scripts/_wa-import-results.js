#!/usr/bin/env node
/**
 * _wa-import-results.js
 *
 * Importa el Excel de resultados que devuelve COCO tras ejecutar una campaña WA.
 * Actualiza en BD: campos whatsapp_* en registros + inserta/actualiza en respuestas.
 *
 * Match: N° Identificación (cédula) → cedula_raw del registro con ese whatsapp_campana_id
 *
 * Uso:
 *   node --env-file=.env.local scripts/_wa-import-results.js \
 *        --file "scripts/output/campaigns_XXXXXXXX.xlsx" \
 *        --campana WA-CIRUGIA-01
 *
 *   Con dry-run (no escribe):
 *   node --env-file=.env.local scripts/_wa-import-results.js \
 *        --file "scripts/output/campaigns_XXXXXXXX.xlsx" \
 *        --campana WA-CIRUGIA-01 --dry-run
 *
 * Columnas esperadas en el Excel de COCO (22-23 cols):
 *   id, name, phone, error, hour_sent
 *   Estado final, Verificación de identidad, Datos del caso
 *   ¿Desea continuar con esta atención pendiente?
 *   Flexibilidad de centro médico
 *   Motivo de no asistencia
 *   Condiciones para asistir          (columna opcional — versiones antiguas del flujo)
 *   Motivo de retiro de lista de espera (columna opcional)
 *   Medio de contacto preferido
 *   N° Identificación   ← KEY de match con cedula_raw
 *   Tipo de atención, Servicio, Especialidad, Centro médico
 *   Procedimiento, Tipo de consulta, Lateralidad, Fecha de cita, Hora de cita
 */

const XLSX          = require('xlsx')
const path          = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? (process.argv[i + 1] ?? '') : ''
}

const FILE_PATH  = arg('--file')
const WA_CAMPANA = arg('--campana')
const DRY_RUN    = process.argv.includes('--dry-run')

if (!FILE_PATH || !WA_CAMPANA) {
  console.error('\n❌ Uso: node --env-file=.env.local scripts/_wa-import-results.js --file <ruta.xlsx> --campana WA-CIRUGIA-01\n')
  process.exit(1)
}

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Mapeo de estados COCO → BD ────────────────────────────────────────────────
function mapWaEstado(estadoCoco, error) {
  if (error && error.trim() && error.trim() !== '-') return 'fallido'
  const e = (estadoCoco || '').trim()
  if (!e || e === '-') return 'no_respondio'
  if (e.toLowerCase().includes('complet')) return 'respondio'
  return 'no_respondio'
}

function mapEstadoFinal(desea, motivoRetiro) {
  const d = (desea || '').toLowerCase()
  if (!d || d === '-') return null
  if (d.includes('sí') || d.includes('si') || d.includes('puede asistir')) return 'ACTIVO'
  if (d.includes('no')) return 'DEPURADO_RENUNCIA'
  return 'ACTIVO'
}

function clean(val) {
  const v = (val || '').toString().trim()
  return (!v || v === '-') ? null : v
}

function parseHourSent(val) {
  if (!val) return null
  // COCO devuelve fecha como string o número Excel
  try {
    if (typeof val === 'number') {
      const d = XLSX.SSF.parse_date_code(val)
      if (!d) return null
      return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, d.S)).toISOString()
    }
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

async function main() {
  console.log(`\n📥 WA IMPORT RESULTADOS — ${WA_CAMPANA}`)
  console.log(`   Archivo: ${FILE_PATH}`)
  console.log(`   Modo   : ${DRY_RUN ? 'DRY RUN' : 'PRODUCCIÓN'}\n`)

  // ── 1. Leer Excel COCO ───────────────────────────────────────────────────────
  let wb
  try {
    wb = XLSX.readFile(path.resolve(FILE_PATH))
  } catch (e) {
    console.error('❌ No se pudo leer el archivo:', e.message)
    process.exit(1)
  }

  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
  console.log(`📄 Hoja "${sheetName}": ${rows.length} filas`)

  if (rows.length === 0) {
    console.log('⚠️  Sin datos. Verificar archivo.')
    return
  }

  // Mostrar columnas detectadas
  console.log(`   Columnas: ${Object.keys(rows[0]).join(' | ')}\n`)

  // ── 2. Construir mapa cédula → id_registro desde BD ─────────────────────────
  console.log('🔍 Cargando registros de BD para match...')
  const cedulaMap = new Map() // cedula_raw → id_registro
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro, cedula_raw')
      .eq('whatsapp_campana_id', WA_CAMPANA)
      .range(from, from + 1000 - 1)

    if (error) { console.error('❌ Supabase:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.cedula_raw) cedulaMap.set(r.cedula_raw.toString().trim(), r.id_registro)
    }
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`   Registros en BD para esta campaña: ${cedulaMap.size}`)

  // ── 3. Procesar filas del Excel ──────────────────────────────────────────────
  let matched = 0, noMatch = 0, errores = 0
  let waRespondio = 0, waNoResp = 0, waFallido = 0

  const updatesRegistros  = []
  const upsertRespuestas  = []

  for (const row of rows) {
    const cedula = clean(row['N° Identificación'] ?? row['id'] ?? '')
    if (!cedula) { noMatch++; continue }

    const idRegistro = cedulaMap.get(cedula)
    if (!idRegistro) { noMatch++; continue }

    matched++

    const estadoCoco  = clean(row['Estado final'])
    const errorCoco   = clean(row['error'])
    const waEstado    = mapWaEstado(estadoCoco, errorCoco)
    const hourSent    = parseHourSent(row['hour_sent'])

    const desea           = clean(row['¿Desea continuar con esta atención pendiente?'])
    const flexibilidad    = clean(row['Flexibilidad de centro médico'])
    const motivoNoAsistir = clean(row['Motivo de no asistencia'])
    const condiciones     = clean(row['Condiciones para asistir'])
    const motivoRetiro    = clean(row['Motivo de retiro de lista de espera'])
    const medioContacto   = clean(row['Medio de contacto preferido'])
    const verificacion    = clean(row['Verificación de identidad'])

    if (waEstado === 'respondio') waRespondio++
    else if (waEstado === 'fallido') waFallido++
    else waNoResp++

    // Update registros
    const updReg = {
      id_registro:          idRegistro,
      whatsapp_enviado_at:  hourSent,
      whatsapp_estado:      waEstado,
      whatsapp_error:       errorCoco,
    }
    if (waEstado === 'respondio') {
      updReg.whatsapp_respondio_at = hourSent  // aproximación — COCO no da timestamp de respuesta separado
    }
    updatesRegistros.push(updReg)

    // Solo insertar/actualizar respuestas si completó el flujo WA
    if (waEstado === 'respondio') {
      const estadoFinal = mapEstadoFinal(desea, motivoRetiro)
      upsertRespuestas.push({
        id_registro:               idRegistro,
        paso_2_verificacion:       verificacion,
        paso_4_desea_continuar:    desea,
        motivo_retiro:             motivoRetiro,
        paso_5a_flexibilidad_centro: flexibilidad,
        paso_5b_condiciones_asistir: condiciones,
        paso_5b_motivo_no_asistir:   motivoNoAsistir,
        paso_6_medio_contacto:     medioContacto,
        estado_final:              estadoFinal,
        completado:                true,
        canal_respuesta:           'whatsapp',   // campo informativo
      })
    }
  }

  // ── 4. Reporte pre-escritura ─────────────────────────────────────────────────
  console.log(`\n📊 RESULTADO DEL MATCH`)
  console.log(`   Filas en Excel         : ${rows.length}`)
  console.log(`   Matched con BD         : ${matched}`)
  console.log(`   Sin match (no en BD)   : ${noMatch}`)
  console.log()
  console.log(`   Respondieron (WA)      : ${waRespondio}`)
  console.log(`   No respondieron        : ${waNoResp}`)
  console.log(`   Fallidos (error)       : ${waFallido}`)
  console.log(`   Con respuesta a insertar: ${upsertRespuestas.length}`)

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — muestra de lo que se escribiría:')
    updatesRegistros.slice(0, 3).forEach(u =>
      console.log(`   ${u.id_registro} | wa_estado: ${u.whatsapp_estado} | enviado: ${u.whatsapp_enviado_at}`)
    )
    console.log('\n✅ DRY RUN completado — nada escrito en BD.\n')
    return
  }

  if (matched === 0) {
    console.log('\n⚠️  Ningún registro matchó. Verifique que el archivo y --campana sean correctos.\n')
    return
  }

  // ── 5. Actualizar registros ──────────────────────────────────────────────────
  console.log(`\n📝 Actualizando registros...`)
  const BATCH = 100
  for (let i = 0; i < updatesRegistros.length; i += BATCH) {
    const batch = updatesRegistros.slice(i, i + BATCH)
    for (const upd of batch) {
      const { id_registro, ...campos } = upd
      // Limpiar campos null para no sobreescribir con null
      const camposLimpios = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null && v !== undefined))
      if (Object.keys(camposLimpios).length === 0) continue
      const { error } = await sb.from('registros').update(camposLimpios).eq('id_registro', id_registro)
      if (error) { errores++; console.error(`   ⚠️  ${id_registro}: ${error.message}`) }
    }
    process.stdout.write(`\r   Procesados: ${Math.min(i + BATCH, updatesRegistros.length)}/${updatesRegistros.length}`)
    await sleep(200)
  }
  console.log(`\n   ✅ ${updatesRegistros.length - errores} registros actualizados`)

  // ── 6. Upsert respuestas ─────────────────────────────────────────────────────
  if (upsertRespuestas.length > 0) {
    console.log(`\n📝 Insertando/actualizando respuestas WA...`)
    let respErrores = 0
    for (let i = 0; i < upsertRespuestas.length; i += BATCH) {
      const batch = upsertRespuestas.slice(i, i + BATCH)
      const { error } = await sb.from('respuestas')
        .upsert(batch, { onConflict: 'id_registro', ignoreDuplicates: false })
      if (error) { respErrores += batch.length; console.error(`   ⚠️  Batch ${i}: ${error.message}`) }
      process.stdout.write(`\r   Procesados: ${Math.min(i + BATCH, upsertRespuestas.length)}/${upsertRespuestas.length}`)
      await sleep(200)
    }
    console.log(`\n   ✅ ${upsertRespuestas.length - respErrores} respuestas insertadas/actualizadas`)
  }

  // ── 7. Resumen final ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ IMPORT COMPLETADO — ${WA_CAMPANA}`)
  console.log(`   Matched y procesados : ${matched}`)
  console.log(`   Respondieron vía WA  : ${waRespondio}`)
  console.log(`   No respondieron      : ${waNoResp} → elegibles para llamada`)
  console.log(`   Fallidos             : ${waFallido} → revisar + reintentar`)
  console.log(`   Errores BD           : ${errores}`)
  if (noMatch > 0) console.log(`   ⚠️  Sin match         : ${noMatch} (no estaban en esta campaña)`)
  console.log()
  console.log('   Siguiente paso: escalación a llamada')
  console.log('   WHERE whatsapp_estado IN (\'no_respondio\',\'fallido\') AND llamada_enviada_at IS NULL')
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

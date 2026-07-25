#!/usr/bin/env node
/**
 * _wa-export-cirugia01.js
 *
 * Exporta candidatos WA del piloto Cirugía-01 en formato COCO.
 *
 * Lee desde BD: encuesta_campana_id='ENCUESTA-CIRUGIA-01_1500'
 *               + encuesta_completada_at IS NULL
 *               + whatsapp_enviado_at IS NULL
 *
 * Clasifica teléfonos:
 *   - celular (6/7/8 + 8 dígitos) → va al Excel para COCO
 *   - fijo/inválido/sin teléfono  → whatsapp_estado='sin_celular' en BD
 *
 * Genera:
 *   scripts/output/WA-CIRUGIA-01_coco_NNNregistros.xlsx  ← enviar a COCO
 *   scripts/output/WA-CIRUGIA-01_excluidos_NNN.xlsx      ← fijos + sin tel
 *
 * Marca en BD (todos los candidatos):
 *   whatsapp_campana_id = 'WA-CIRUGIA-01'
 *   whatsapp_estado     = 'sin_celular'  (solo para excluidos)
 *
 * Uso:
 *   node --env-file=.env.local scripts/_wa-export-cirugia01.js
 *   node --env-file=.env.local scripts/_wa-export-cirugia01.js --dry-run
 */

const XLSX          = require('xlsx')
const path          = require('path')
const fs            = require('fs')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

const CAMPANA_ORIGEN = 'ENCUESTA-CIRUGIA-01_1500'
const WA_CAMPANA_ID  = 'WA-CIRUGIA-01'
const DRY_RUN        = process.argv.includes('--dry-run')
const PAGE           = 1000
const BATCH_UPD      = 200

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

function clasificar(tel) {
  const d = String(tel || '').replace(/\D/g, '')
  if (!d)                               return 'sin_telefono'
  if (d.length === 8 && /^[678]/.test(d)) return 'celular'
  if (d.length === 8 && d.startsWith('2')) return 'fijo'
  return 'invalido'
}

async function main() {
  console.log(`\n📤 WA EXPORT — ${WA_CAMPANA_ID}`)
  console.log(`   Origen: ${CAMPANA_ORIGEN}`)
  console.log(`   Modo  : ${DRY_RUN ? 'DRY RUN' : 'PRODUCCIÓN'}\n`)

  // ── 1. Traer candidatos ──────────────────────────────────────────────────────
  console.log('🔍 Consultando candidatos en Supabase...')
  let candidatos = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro, nombre_paciente, telefono, cedula_raw, nombre_servicio, especialidad, centro_medico, procedimiento, lateralidad, tipo_atencion')
      .eq('encuesta_campana_id', CAMPANA_ORIGEN)
      .is('encuesta_completada_at', null)
      .is('whatsapp_enviado_at', null)
      .range(from, from + PAGE - 1)
      .order('id_registro')

    if (error) { console.error('❌ Supabase:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    candidatos.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`   Total candidatos: ${candidatos.length}`)

  // ── 2. Clasificar teléfonos ──────────────────────────────────────────────────
  const aptos      = []
  const excluidos  = []

  for (const r of candidatos) {
    const tipo = clasificar(r.telefono)
    if (tipo === 'celular') {
      aptos.push(r)
    } else {
      excluidos.push({ ...r, motivo_exclusion: tipo })
    }
  }

  console.log(`\n   ✅ Celular válido (aptos WA) : ${aptos.length}`)
  console.log(`   ❌ Excluidos (sin celular)    : ${excluidos.length}`)
  console.log(`      • Fijo (2xxxxxxx)          : ${excluidos.filter(r => r.motivo_exclusion === 'fijo').length}`)
  console.log(`      • Sin teléfono             : ${excluidos.filter(r => r.motivo_exclusion === 'sin_telefono').length}`)
  console.log(`      • Formato inválido         : ${excluidos.filter(r => r.motivo_exclusion === 'invalido').length}`)

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — muestra aptos:')
    aptos.slice(0, 3).forEach(r =>
      console.log(`   ${r.cedula_raw} | ${r.nombre_paciente} | ${r.telefono} | ${r.especialidad}`)
    )
    console.log('\n🧪 DRY RUN — muestra excluidos:')
    excluidos.slice(0, 3).forEach(r =>
      console.log(`   ${r.cedula_raw} | ${r.nombre_paciente} | ${r.telefono} | motivo: ${r.motivo_exclusion}`)
    )
    console.log('\n✅ DRY RUN completado — nada escrito en BD ni disco.\n')
    return
  }

  // ── 3. Generar Excel COCO (aptos) ────────────────────────────────────────────
  const rowsCoco = aptos.map(r => ({
    id:                   r.cedula_raw,
    name:                 r.nombre_paciente,
    phone:                String(r.telefono || '').replace(/\D/g, ''),
    tipo_atencion:        'CIRUGIA',
    numero_identificacion: r.cedula_raw,
    servicio:             r.nombre_servicio || '',
    especialidad:         r.especialidad || '',
    centro_medico:        r.centro_medico || '',
    procedimiento:        r.procedimiento || r.nombre_servicio || '',
    lateralidad:          r.lateralidad || 'No aplica',
  }))

  // Excel de excluidos (para trazabilidad)
  const rowsExcluidos = excluidos.map(r => ({
    id_registro:          r.id_registro,
    cedula:               r.cedula_raw,
    nombre:               r.nombre_paciente,
    telefono:             r.telefono || '',
    motivo_exclusion:     r.motivo_exclusion,
    especialidad:         r.especialidad || '',
    centro_medico:        r.centro_medico || '',
    canal_siguiente:      'llamada',
  }))

  const outDir = path.join(__dirname, 'output')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

  const cocoPath = path.join(outDir, `${WA_CAMPANA_ID}_coco_${aptos.length}registros.xlsx`)
  const exclPath = path.join(outDir, `${WA_CAMPANA_ID}_excluidos_${excluidos.length}.xlsx`)

  const wbCoco = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbCoco, XLSX.utils.json_to_sheet(rowsCoco), 'Pacientes')
  XLSX.writeFile(wbCoco, cocoPath)

  const wbExcl = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbExcl, XLSX.utils.json_to_sheet(rowsExcluidos), 'Excluidos')
  XLSX.writeFile(wbExcl, exclPath)

  console.log(`\n💾 Excel COCO     : ${cocoPath}`)
  console.log(`💾 Excel excluidos: ${exclPath}`)

  // ── 4. Marcar en BD ──────────────────────────────────────────────────────────
  console.log(`\n📝 Marcando en BD...`)

  // 4a. Todos: whatsapp_campana_id
  const allIds = candidatos.map(r => r.id_registro)
  for (let i = 0; i < allIds.length; i += BATCH_UPD) {
    const batch = allIds.slice(i, i + BATCH_UPD)
    const { error } = await sb.from('registros')
      .update({ whatsapp_campana_id: WA_CAMPANA_ID })
      .in('id_registro', batch)
    if (error) console.error(`   ⚠️  Error batch ${i}: ${error.message}`)
    await sleep(150)
  }
  console.log(`   ✅ whatsapp_campana_id='${WA_CAMPANA_ID}' → ${allIds.length} registros`)

  // 4b. Excluidos: whatsapp_estado='sin_celular'
  if (excluidos.length > 0) {
    const sinIds = excluidos.map(r => r.id_registro)
    for (let i = 0; i < sinIds.length; i += BATCH_UPD) {
      const batch = sinIds.slice(i, i + BATCH_UPD)
      const { error } = await sb.from('registros')
        .update({ whatsapp_estado: 'sin_celular' })
        .in('id_registro', batch)
      if (error) console.error(`   ⚠️  Error excluidos batch ${i}: ${error.message}`)
      await sleep(150)
    }
    console.log(`   ✅ whatsapp_estado='sin_celular' → ${excluidos.length} registros (pasan a llamada)`)
  }

  // ── 5. Resumen ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ EXPORT COMPLETADO — ${WA_CAMPANA_ID}`)
  console.log(`   Enviar a COCO   : ${aptos.length} registros`)
  console.log(`   Pasan a llamada : ${excluidos.length} registros (ya marcados en BD)`)
  console.log(`   Archivo COCO    : ${path.basename(cocoPath)}`)
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

#!/usr/bin/env node
/**
 * _import-base-wa.js
 *
 * Importa los 10,532 registros INCLUIR sin correo electrónico a Supabase.
 * Estos pacientes van directo al canal WhatsApp → Llamada voicebot.
 * Lee BD_sin_correo.csv (generado por _bd-to-csv.js).
 *
 * Campaña: BASE-WA-01
 * Canal:   whatsapp → llamada (sin correo en la cascada)
 *
 * Uso:
 *   node --env-file=.env.local scripts/_import-base-wa.js
 *   node --env-file=.env.local scripts/_import-base-wa.js --dry-run
 */

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN      = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌ Variables de entorno faltantes. Use --env-file=.env.local\n')
  process.exit(1)
}

const supabase    = createClient(SUPABASE_URL, SUPABASE_KEY)
const sleep       = ms => new Promise(r => setTimeout(r, ms))
const BATCH_SZ    = 1000
const CSV_PATH    = path.join(__dirname, 'output', 'BD_sin_correo.csv')
const CAMPANA_ID  = 'BASE-WA-01'
const LINK_EXPIRES = new Date(Date.now() + 90 * 86_400_000).toISOString()

// ── CSV parser ─────────────────────────────────────────────────────────────────
function parseCSV(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`\n❌ No encontrado: ${filepath}\n   Ejecute primero: node scripts/_bd-to-csv.js\n`)
    process.exit(1)
  }
  const lines = fs.readFileSync(filepath, 'utf-8')
    .replace(/^﻿/, '').replace(/\r\n/g, '\n').trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = []
    let field = '', inQ = false
    for (const ch of line + ',') {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { values.push(field); field = '' }
      else { field += ch }
    }
    return headers.reduce((obj, h, i) => {
      obj[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim() || null
      return obj
    }, {})
  })
}

// ── Obtener IDs ya existentes en Supabase con campana BASE-WA-01 ───────────────
async function getExistingIds() {
  const ids = new Set()
  let from  = 0
  while (true) {
    const { data, error } = await supabase
      .from('registros')
      .select('id_registro')
      .eq('campana_id', CAMPANA_ID)
      .range(from, from + BATCH_SZ - 1)

    if (error) { console.error(`❌ Error leyendo Supabase: ${error.message}`); break }
    if (!data || data.length === 0) break
    data.forEach(r => ids.add(r.id_registro))
    if (data.length < BATCH_SZ) break
    from += BATCH_SZ
  }
  return ids
}

async function main() {
  console.log(`\n📲 Import base WhatsApp — ${CAMPANA_ID}${DRY_RUN ? ' [DRY RUN]' : ''}`)

  // 1. Cargar CSV
  console.log('\n📂 Leyendo BD_sin_correo.csv...')
  const todos    = parseCSV(CSV_PATH).filter(r => r.id_registro && r.telefono)
  const sinTel   = parseCSV(CSV_PATH).filter(r => r.id_registro && !r.telefono)

  console.log(`   Con teléfono:    ${todos.length.toLocaleString()}`)
  if (sinTel.length > 0) {
    console.log(`   ⚠️  Sin teléfono: ${sinTel.length} — omitidos (no tienen ningún canal de contacto)`)
  }

  // 2. Excluir ya existentes (resumable)
  console.log('\n🔍 Consultando IDs ya existentes en Supabase...')
  const existingIds = await getExistingIds()
  console.log(`   Ya en Supabase (${CAMPANA_ID}): ${existingIds.size.toLocaleString()}`)

  const pendientes = todos.filter(r => !existingIds.has(r.id_registro))
  console.log(`   Pendientes de importar:         ${pendientes.length.toLocaleString()}`)

  if (pendientes.length === 0) {
    console.log('\n✅ Todos los registros WA ya están en Supabase.\n')
    return
  }

  if (DRY_RUN) {
    console.log('\n🧪 Muestra de primeros registros:')
    pendientes.slice(0, 5).forEach(r =>
      console.log(`   ${r.id_registro} | ${r.nombre_paciente} | tel: ${r.telefono} | ${r.tipo_atencion}`)
    )
    console.log(`\n✅ DRY RUN — se importarían ${pendientes.length} registros con campana_id='${CAMPANA_ID}'.\n`)
    return
  }

  // 3. Insertar en lotes
  const totalBatches = Math.ceil(pendientes.length / BATCH_SZ)
  let insertados = 0
  let errores    = 0

  for (let i = 0; i < pendientes.length; i += BATCH_SZ) {
    const batch    = pendientes.slice(i, i + BATCH_SZ)
    const batchNum = Math.floor(i / BATCH_SZ) + 1
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} — ${batch.length} registros`)

    const rows = batch.map(r => ({
      id_registro:         r.id_registro,
      nombre_paciente:     r.nombre_paciente || 'SIN NOMBRE',
      numero_asegurado:    r.numero_asegurado,
      cedula_raw:          (r.numero_asegurado ?? '').replace(/\D/g, ''),
      telefono:            r.telefono,
      correo:              null,           // Sin correo — ese es el criterio de este grupo
      especialidad:        r.especialidad ?? null,
      centro_medico:       r.centro_medico,
      tipo_atencion:       r.tipo_atencion,
      nombre_servicio:     r.nombre_servicio ?? null,
      lateralidad:         r.lateralidad ?? null,
      procedimiento:       r.procedimiento ?? null,
      tipo_consulta:       r.tipo_consulta ?? null,
      fecha_cita:          r.fecha_cita ?? null,
      hora_cita:           r.hora_cita ?? null,
      ultimos_4_asegurado: r.ultimos_4_asegurado,
      token:               crypto.randomUUID(),
      link_expires_at:     LINK_EXPIRES,
      estado:              'PENDIENTE',
      campana_id:          CAMPANA_ID,
      canal_orden:         'whatsapp,llamada',  // Sin correo en cascada
      canal_actual:        'whatsapp',
      // warmup_estado queda 'pendiente' (default) — nunca recibieron aviso
    }))

    const { error } = await supabase
      .from('registros')
      .upsert(rows, { onConflict: 'id_registro', ignoreDuplicates: true })

    if (error) {
      console.error(`   ❌ Error batch ${batchNum}: ${error.message}`)
      errores += batch.length
    } else {
      console.log(`   ✅ Insertados: ${batch.length}`)
      insertados += batch.length
    }

    await sleep(300)
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`✅ Import BASE-WA-01 completado`)
  console.log(`   Insertados: ${insertados.toLocaleString()}`)
  if (errores > 0) console.log(`   Errores:    ${errores.toLocaleString()} (re-ejecute para reintentar)`)
  console.log()
}

main().catch(err => { console.error(`\n❌ Error fatal: ${err.message}`); process.exit(1) })

#!/usr/bin/env node
/**
 * _reimport-warmup-missing.js
 *
 * Reconcilia los registros del warmup que salieron por SendGrid pero
 * no quedaron en Supabase (batch 31 falló el upsert la noche del 2026-07-09).
 *
 * Lee los 3 CSVs del warmup → compara con IDs ya en Supabase →
 * inserta solo los faltantes con warmup_estado='enviado'.
 * NO envía ningún correo.
 *
 * Uso:
 *   node --env-file=.env.local scripts/_reimport-warmup-missing.js
 *   node --env-file=.env.local scripts/_reimport-warmup-missing.js --dry-run
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

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const sleep     = ms => new Promise(r => setTimeout(r, ms))
const BATCH_SZ  = 1000
const OUT_DIR   = path.join(__dirname, 'output')

// Fecha aproximada del warmup original
const WARMUP_SENT_AT = '2026-07-09T17:00:00.000Z'
const LINK_EXPIRES   = new Date('2026-10-07T17:00:00.000Z').toISOString()

// ── CSV parser ─────────────────────────────────────────────────────────────────
function parseCSV(filepath) {
  if (!fs.existsSync(filepath)) {
    console.warn(`⚠️  No encontrado: ${path.basename(filepath)}`)
    return []
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

// ── Cargar todos los IDs existentes en Supabase (campana WARMUP-CORREO-01) ────
async function getExistingIds() {
  const ids = new Set()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('registros')
      .select('id_registro')
      .eq('campana_id', 'WARMUP-CORREO-01')
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
  console.log(`\n🔍 Reimport warmup faltantes${DRY_RUN ? ' [DRY RUN]' : ''}`)

  // 1. Cargar CSVs
  console.log('\n📂 Leyendo CSVs de warmup...')
  const todos = [
    ...parseCSV(path.join(OUT_DIR, 'BD_cirugia.csv')),
    ...parseCSV(path.join(OUT_DIR, 'BD_consulta.csv')),
    ...parseCSV(path.join(OUT_DIR, 'BD_procedimiento.csv')),
  ].filter(r => r.id_registro && r.correo)

  console.log(`   Total en CSVs (con correo): ${todos.length.toLocaleString()}`)

  // 2. Obtener IDs ya en Supabase
  console.log('\n🔍 Consultando IDs existentes en Supabase (campana WARMUP-CORREO-01)...')
  const existingIds = await getExistingIds()
  console.log(`   En Supabase: ${existingIds.size.toLocaleString()}`)

  // 3. Identificar faltantes
  const faltantes = todos.filter(r => !existingIds.has(r.id_registro))
  console.log(`   Faltantes:   ${faltantes.length.toLocaleString()}`)

  if (faltantes.length === 0) {
    console.log('\n✅ Ningún registro faltante. Base ya unificada.\n')
    return
  }

  if (DRY_RUN) {
    console.log('\n🧪 Muestra de faltantes:')
    faltantes.slice(0, 5).forEach(r =>
      console.log(`   ${r.id_registro} | ${r.nombre_paciente} | ${r.correo}`)
    )
    console.log(`\n✅ DRY RUN — se insertarían ${faltantes.length} registros.\n`)
    return
  }

  // 4. Insertar en lotes
  const totalBatches = Math.ceil(faltantes.length / BATCH_SZ)
  let insertados = 0

  for (let i = 0; i < faltantes.length; i += BATCH_SZ) {
    const batch    = faltantes.slice(i, i + BATCH_SZ)
    const batchNum = Math.floor(i / BATCH_SZ) + 1
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} — ${batch.length} registros`)

    const rows = batch.map(r => ({
      id_registro:         r.id_registro,
      nombre_paciente:     r.nombre_paciente,
      numero_asegurado:    r.numero_asegurado,
      cedula_raw:          (r.numero_asegurado ?? '').replace(/\D/g, ''),
      telefono:            r.telefono ?? null,
      correo:              r.correo,
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
      campana_id:          'WARMUP-CORREO-01',
      canal_orden:         'correo,whatsapp,llamada',
      canal_actual:        'correo',
      // Warmup ya fue enviado por SendGrid aunque no quedó en BD
      warmup_estado:       'enviado',
      warmup_enviado_at:   WARMUP_SENT_AT,
    }))

    const { error } = await supabase
      .from('registros')
      .upsert(rows, { onConflict: 'id_registro', ignoreDuplicates: true })

    if (error) {
      console.error(`   ❌ Error: ${error.message}`)
    } else {
      console.log(`   ✅ Insertados: ${batch.length}`)
      insertados += batch.length
    }

    await sleep(300)
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`✅ Reimport completado — ${insertados} registros insertados`)
  console.log()
}

main().catch(err => { console.error(`\n❌ Error fatal: ${err.message}`); process.exit(1) })

#!/usr/bin/env node
/**
 * Importa resultados de canales externos (WhatsApp / Voicebot) desde CSV/Excel
 * y actualiza los registros en Supabase.
 *
 * Uso:
 *   node --env-file=.env.local scripts/import-resultados-canal.js resultados.csv --canal whatsapp
 *   node --env-file=.env.local scripts/import-resultados-canal.js resultados.csv --canal llamada
 *
 * Columnas requeridas en el CSV de resultados:
 *   id_registro O telefono   (llave de cruce — se usa id_registro primero, telefono como fallback)
 *   estado_canal             (completado | no_respondio | fallido)
 *
 * Columnas opcionales (si el canal las captura):
 *   enviado_at, respondio_at, contestado_at, completado_at
 *   paso_1_respuesta ... paso_6_respuesta
 *   motivo_retiro, motivo_no_asistir, acepta_otro_centro, puede_asistir
 */

const fs     = require('fs')
const path   = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Args ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const csvFile = args.find(a => !a.startsWith('--'))
const canalArg = args.indexOf('--canal')
const canal    = canalArg !== -1 ? args[canalArg + 1] : null

if (!csvFile || !canal) {
  console.error('Uso: node --env-file=.env.local scripts/import-resultados-canal.js <archivo.csv> --canal <whatsapp|llamada>')
  process.exit(1)
}

if (!['whatsapp', 'llamada'].includes(canal)) {
  console.error('Canal inválido. Use: whatsapp | llamada')
  process.exit(1)
}

if (!fs.existsSync(csvFile)) {
  console.error(`Archivo no encontrado: ${csvFile}`)
  process.exit(1)
}

// ── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let field = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(field.trim()); field = ''
    } else {
      field += ch
    }
  }
  result.push(field.trim())
  return result
}

function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line)
    return headers.reduce((obj, h, i) => {
      obj[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim() || null
      return obj
    }, {})
  })
}

// ── Normalizar teléfono (quitar guiones, espacios, +506) ──────────────────────
function normalizarTelefono(tel) {
  if (!tel) return null
  return tel.replace(/[\s\-\+]/g, '').replace(/^506/, '').slice(-8)
}

// ── Construir update según canal ──────────────────────────────────────────────
function buildUpdate(canal, row) {
  const ahora = new Date().toISOString()
  const estado = (row.estado_canal || '').toLowerCase()

  const update = {}

  if (canal === 'whatsapp') {
    if (row.enviado_at)   update.whatsapp_enviado_at    = row.enviado_at
    if (row.respondio_at) update.whatsapp_respondio_at  = row.respondio_at
    update.whatsapp_estado = estado || 'no_respondio'
    if (estado === 'completado') {
      update.whatsapp_entregado_at = row.enviado_at || ahora
      update.canal_completado = 'whatsapp'
      update.canal_actual     = 'completado'
    } else {
      update.canal_actual = 'llamada'
    }
  }

  if (canal === 'llamada') {
    if (row.enviado_at)    update.llamada_enviada_at    = row.enviado_at
    if (row.contestado_at) update.llamada_contestada_at = row.contestado_at
    if (row.completado_at) update.llamada_completada_at = row.completado_at
    if (row.intentos)      update.llamada_intentos      = parseInt(row.intentos) || 1
    update.llamada_estado = estado || 'no_respondio'
    if (estado === 'completado') {
      update.canal_completado = 'llamada'
      update.canal_actual     = 'completado'
    } else {
      update.canal_actual = 'correo'
    }
  }

  // Respuestas capturadas por el canal externo (si las trae)
  const CAMPOS_RESPUESTA = [
    'paso_4_desea_continuar', 'paso_4_motivo_retiro',
    'paso_5a_acepta_otro_centro', 'paso_5b_puede_asistir',
    'paso_5b_motivo_no_asistir', 'paso_6_preferencia_contacto',
  ]
  for (const campo of CAMPOS_RESPUESTA) {
    if (row[campo]) update[campo] = row[campo]
  }

  // Si completó en canal externo → marcar estado final
  if (estado === 'completado' && !update.estado) {
    update.estado = 'ACTIVO'
  }

  return update
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const content  = fs.readFileSync(csvFile, 'utf-8').replace(/^﻿/, '')
  const rows     = parseCSV(content)

  console.log(`\n📋 ${rows.length} resultados en ${path.basename(csvFile)}`)
  console.log(`📡 Canal: ${canal.toUpperCase()}\n`)

  let actualizados = 0, noEncontrados = 0, errores = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const num = i + 2

    // Buscar registro: primero por id_registro, luego por telefono
    let registro = null

    if (row.id_registro) {
      const { data } = await supabase
        .from('registros')
        .select('id_registro, telefono, estado, canal_actual')
        .eq('id_registro', row.id_registro)
        .single()
      registro = data
    }

    if (!registro && row.telefono) {
      const telNorm = normalizarTelefono(row.telefono)
      const { data } = await supabase
        .from('registros')
        .select('id_registro, telefono, estado, canal_actual')
        .ilike('telefono', `%${telNorm}`)
        .single()
      registro = data
    }

    if (!registro) {
      console.warn(`  ⚠️  Fila ${num}: no se encontró registro (id: ${row.id_registro || '—'}, tel: ${row.telefono || '—'})`)
      noEncontrados++
      continue
    }

    // No sobreescribir registros ya completados por otro canal
    if (registro.estado !== 'PENDIENTE' && registro.canal_completado) {
      console.log(`  ⏭  [${registro.id_registro}] ya completado vía ${registro.canal_completado} — omitiendo`)
      continue
    }

    const update = buildUpdate(canal, row)
    const { error } = await supabase
      .from('registros')
      .update(update)
      .eq('id_registro', registro.id_registro)

    if (error) {
      console.error(`  ❌ Fila ${num} [${registro.id_registro}]: ${error.message}`)
      errores++
    } else {
      const icono = update.canal_completado ? '✅' : '➡️ '
      const sig   = update.canal_completado
        ? `completado vía ${canal}`
        : `escala a ${update.canal_actual}`
      console.log(`  ${icono} [${registro.id_registro}] ${sig}`)
      actualizados++
    }
  }

  console.log(`\n✅ Resumen: ${actualizados} actualizados  |  ${noEncontrados} no encontrados  |  ${errores} errores\n`)
}

main().catch(err => { console.error(err); process.exit(1) })

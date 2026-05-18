#!/usr/bin/env node
/**
 * Importa pacientes desde un CSV a Supabase y genera URLs personalizadas.
 *
 * Uso:
 *   node --env-file=.env.local scripts/import-patients.js pacientes.csv https://ccss-utle.netlify.app [--campana 2026-05-01_HospMexico]
 *
 * Columnas requeridas en el CSV:
 *   id_registro, nombre_paciente, numero_asegurado, correo, centro_medico,
 *   tipo_atencion (consulta|cirugia|procedimiento), ultimos_4_asegurado
 *
 * Columnas opcionales:
 *   telefono, especialidad, nombre_servicio, lateralidad, procedimiento, tipo_consulta, fecha_cita, hora_cita
 *
 * El script genera un archivo <archivo>_urls.csv con las URLs personalizadas.
 * Si se indica --campana, todos los registros quedan marcados con ese ID.
 */

const fs      = require('fs')
const path    = require('path')
const crypto  = require('crypto')
const { createClient } = require('@supabase/supabase-js')

// ── Args ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const csvFile = args.find(a => !a.startsWith('--') && !a.startsWith('http'))
const baseUrl = args.find(a => a.startsWith('http')) ?? 'http://localhost:3000'
const campanaArg = args.indexOf('--campana')
const campanaId  = campanaArg !== -1 ? args[campanaArg + 1] : null

if (!csvFile) {
  console.error('Uso: node --env-file=.env.local scripts/import-patients.js <archivo.csv> [base-url] [--campana ID]')
  console.error('Ejemplo: node --env-file=.env.local scripts/import-patients.js pacientes.csv https://ccss-utle-prod.netlify.app --campana 2026-05-01_HospMexico')
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

// ── CSV parser (soporta campos con comas entre comillas) ──────────────────────
function parseCSVLine(line) {
  const result = []
  let field = ''
  let inQuotes = false
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
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line)
    return headers.reduce((obj, h, i) => {
      obj[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim() || null
      return obj
    }, {})
  })
}

function escapeCSV(val) {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// ── Validación de filas ───────────────────────────────────────────────────────
const TIPOS_VALIDOS = ['consulta', 'cirugia', 'procedimiento']
const REQUERIDOS    = ['nombre_paciente', 'numero_asegurado', 'correo', 'centro_medico', 'tipo_atencion', 'ultimos_4_asegurado']

function validarFila(row, num) {
  const errores = []
  for (const campo of REQUERIDOS) {
    if (!row[campo]) errores.push(`"${campo}" vacío`)
  }
  if (row.tipo_atencion && !TIPOS_VALIDOS.includes(row.tipo_atencion)) {
    errores.push(`tipo_atencion inválido: "${row.tipo_atencion}" (debe ser consulta|cirugia|procedimiento)`)
  }
  if (row.ultimos_4_asegurado && !/^\d{4}$/.test(row.ultimos_4_asegurado)) {
    errores.push(`ultimos_4_asegurado debe ser exactamente 4 dígitos`)
  }
  if (errores.length) {
    console.warn(`  ⚠️  Fila ${num}: ${errores.join(' | ')}`)
    return false
  }
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const content = fs.readFileSync(csvFile, 'utf-8')
  const rows    = parseCSV(content)

  console.log(`\n📋 ${rows.length} filas encontradas en ${path.basename(csvFile)}`)
  console.log(`🌐 Base URL: ${baseUrl}`)
  if (campanaId) console.log(`📣 Campaña: ${campanaId}`)
  console.log()

  const resultados = []
  let insertados = 0, errores = 0, invalidos = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const num = i + 2 // número de fila en el CSV (1 = encabezado)

    if (!validarFila(row, num)) { invalidos++; continue }

    const token         = crypto.randomUUID()
    const linkExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const idRegistro    = row.id_registro || `REG-${String(i + 1).padStart(6, '0')}`

    const registro = {
      id_registro:         idRegistro,
      nombre_paciente:     row.nombre_paciente,
      numero_asegurado:    row.numero_asegurado,
      telefono:            row.telefono   || null,
      correo:              row.correo,
      especialidad:        row.especialidad    || null,
      centro_medico:       row.centro_medico,
      tipo_atencion:       row.tipo_atencion,
      nombre_servicio:     row.nombre_servicio  || null,
      lateralidad:         row.lateralidad      || null,
      procedimiento:       row.procedimiento    || null,
      tipo_consulta:       row.tipo_consulta    || null,
      fecha_cita:          row.fecha_cita       || null,
      hora_cita:           row.hora_cita        || null,
      ultimos_4_asegurado: row.ultimos_4_asegurado,
      token,
      link_expires_at:     linkExpiresAt,
      estado:              'PENDIENTE',
      campana_id:          campanaId ?? row.campana_id ?? null,
    }

    const { error } = await supabase
      .from('registros')
      .upsert(registro, { onConflict: 'id_registro' })

    if (error) {
      console.error(`  ❌ Fila ${num} (${row.nombre_paciente}): ${error.message}`)
      errores++
    } else {
      const url = `${baseUrl}/utle?t=${token}`
      console.log(`  ✓ [${idRegistro}] ${row.nombre_paciente} → ${url}`)
      resultados.push({ ...registro, url })
      insertados++
    }
  }

  // ── Exportar CSV con URLs ────────────────────────────────────────────────────
  if (resultados.length > 0) {
    const outputFile = csvFile.replace(/\.csv$/i, '_urls.csv')
    const colsSalida = [
      'id_registro', 'nombre_paciente', 'correo', 'telefono',
      'tipo_atencion', 'especialidad', 'centro_medico', 'campana_id', 'url',
    ]
    const csvOut = [
      colsSalida.join(','),
      ...resultados.map(r => colsSalida.map(c => escapeCSV(r[c])).join(',')),
    ].join('\n')

    fs.writeFileSync(outputFile, '﻿' + csvOut, 'utf-8') // BOM para Excel
    console.log(`\n📄 URLs exportadas a: ${outputFile}`)
  }

  console.log(`\n✅ Resumen: ${insertados} insertados  |  ${invalidos} inválidos  |  ${errores} errores de BD\n`)
}

main().catch(err => { console.error(err); process.exit(1) })

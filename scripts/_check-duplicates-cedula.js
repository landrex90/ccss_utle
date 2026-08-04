#!/usr/bin/env node
/**
 * _check-duplicates-cedula.js — SOLO LECTURA
 * Verifica cédulas duplicadas dentro de los INCLUIR del Excel procesado.
 *
 * Uso:
 *   node scripts/_check-duplicates-cedula.js
 *   node scripts/_check-duplicates-cedula.js 101960783   ← caso específico
 */

const XLSX = require('xlsx')
const path = require('path')

const FILE   = path.join(__dirname, 'output', 'BD_HCG_CE_PROCESADA.xlsx')
const CEDULA_BUSCAR = process.argv[2] ?? null

console.log('\n🔍 ANÁLISIS DE CÉDULAS DUPLICADAS — INCLUIR\n')

const wb    = XLSX.readFile(FILE)
const sheet = wb.Sheets['procesada'] ?? wb.Sheets[wb.SheetNames[0]]
const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' })

console.log(`   Total filas en Excel: ${rows.length}`)

// Filtrar solo INCLUIR
const incluir = rows.filter(r => r['COCO_ESTADO'] === 'INCLUIR')
console.log(`   Registros INCLUIR   : ${incluir.length}`)

// Agrupar por cédula (columna COCO_NOMBRE usa numeroIdentificacion del header original)
// Buscar la columna de identificación
const sampleKeys = Object.keys(rows[0] ?? {})
console.log(`\n   Columnas disponibles (muestra): ${sampleKeys.slice(0, 8).join(' | ')}`)

// Detectar columna de cedula — buscar "numero" + "identificacion" (no tipo)
const COL_CEDULA = sampleKeys.find(k =>
  k.toLowerCase().includes('numero') && k.toLowerCase().includes('identificacion')
) ?? sampleKeys.find(k =>
  k.toLowerCase().includes('identificacion') && !k.toLowerCase().includes('tipo')
) ?? 'numeroIdentificacion'

// Detectar columna ID_UTLE
const COL_ID = sampleKeys.find(k => k.toUpperCase().includes('ID_UTLE') || k.toLowerCase().includes('id_utle')) ?? 'ID_UTLE'

console.log(`   Columna cédula usada: "${COL_CEDULA}"\n`)

// Agrupar
const porCedula = new Map()
for (const r of incluir) {
  const ced = String(r[COL_CEDULA] ?? '').trim()
  if (!ced) continue
  if (!porCedula.has(ced)) porCedula.set(ced, [])
  porCedula.get(ced).push(r)
}

// Duplicadas (más de 1 registro INCLUIR con la misma cédula)
const duplicadas = [...porCedula.entries()].filter(([, rs]) => rs.length > 1)
duplicadas.sort((a, b) => b[1].length - a[1].length)

console.log('═'.repeat(60))
console.log(`Cédulas con MÁS DE UN registro INCLUIR: ${duplicadas.length}`)
console.log(`  (de ${porCedula.size} cédulas únicas en INCLUIR)`)
console.log('═'.repeat(60))

if (duplicadas.length > 0) {
  console.log('\nTop 10 más repetidas:')
  duplicadas.slice(0, 10).forEach(([ced, rs]) => {
    console.log(`\n  Cédula: ${ced}  (${rs.length} registros)`)
    rs.forEach(r => {
      const idUTLE   = r[COL_ID] ?? '?'
      const servicio = r['Servicio'] ?? '?'
      const esp      = r['Especialidad'] ?? '?'
      const fecha    = r['Fecha Atención'] ?? r['fechaAtención'] ?? '?'
      const hora     = r['HORA CUPO'] ?? '?'
      const correo   = r['COCO_CORREO'] ?? ''
      console.log(`    ID_UTLE: ${idUTLE} | ${esp} | ${fecha} ${hora} | correo: ${correo}`)
    })
  })
}

// Caso específico si se pasa cédula por argumento
if (CEDULA_BUSCAR) {
  console.log('\n' + '─'.repeat(60))
  console.log(`Caso específico — cédula: ${CEDULA_BUSCAR}`)
  console.log('─'.repeat(60))

  const todos = rows.filter(r => String(r[COL_CEDULA] ?? '').trim() === CEDULA_BUSCAR)
  console.log(`  Total registros (cualquier estado): ${todos.length}`)

  todos.forEach(r => {
    const estado   = r['COCO_ESTADO'] ?? '?'
    const idUTLE   = r['ID_UTLE'] ?? '?'
    const servicio = r['Servicio'] ?? '?'
    const esp      = r['Especialidad'] ?? '?'
    const fecha    = r['Fecha Atención'] ?? '?'
    const correo   = r['COCO_CORREO'] ?? ''
    const canal    = r['COCO_CANAL'] ?? ''
    console.log(`\n  [${estado}]`)
    console.log(`    ID_UTLE   : ${idUTLE}`)
    console.log(`    Servicio  : ${servicio}`)
    console.log(`    Especialidad: ${esp}`)
    console.log(`    Fecha cita: ${fecha}`)
    console.log(`    Correo    : ${correo}`)
    console.log(`    Canal     : ${canal}`)
  })
}

console.log('\n')

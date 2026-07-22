/**
 * Consolida los 4 CSVs depurados en un Excel con dos hojas:
 *   Hoja 1 — BD_DEPURADA_COMPLETA: todos los 75,967 INCLUIR
 *   Hoja 2 — PILOTO_CIRUGIA_1500:  los 1,500 ya enviados el 13 jul
 * Ejecutar: node scripts/_export-bd-completa.js
 */
const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, 'output')

// ── Hoja 1: BD completa depurada ──────────────────────────────────────────────
const ARCHIVOS = [
  'BD_cirugia.csv',
  'BD_consulta.csv',
  'BD_procedimiento.csv',
  'BD_sin_correo.csv',
]

console.log('📋 Hoja 1 — BD_DEPURADA_COMPLETA')
const filas = []
for (const file of ARCHIVOS) {
  const csvPath = path.join(OUT_DIR, file)
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ No encontrado: ${csvPath}`)
    process.exit(1)
  }
  const wb   = XLSX.readFile(csvPath)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  filas.push(...rows)
  console.log(`   ✅ ${file.padEnd(30)} ${rows.length.toLocaleString()} filas`)
}
console.log(`   TOTAL hoja 1: ${filas.length.toLocaleString()} registros\n`)

// ── Hoja 2: Piloto 1,500 ya enviados ─────────────────────────────────────────
console.log('📋 Hoja 2 — PILOTO_CIRUGIA_1500')
const pilotoPath = path.join(OUT_DIR, 'PILOTO_CIRUGIA_1500_2026-07-13.csv')
if (!fs.existsSync(pilotoPath)) {
  console.error(`❌ No encontrado: ${pilotoPath}`)
  process.exit(1)
}
const wbPiloto   = XLSX.readFile(pilotoPath)
const wsPiloto   = wbPiloto.Sheets[wbPiloto.SheetNames[0]]
const filasPiloto = XLSX.utils.sheet_to_json(wsPiloto, { defval: '' })
console.log(`   ✅ PILOTO_CIRUGIA_1500_2026-07-13.csv  ${filasPiloto.length.toLocaleString()} filas\n`)

// ── Escribir Excel ────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas),       'BD_DEPURADA_COMPLETA')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasPiloto), 'PILOTO_CIRUGIA_1500')

const outFile = path.join(OUT_DIR, 'BD_DEPURADA_COMPLETA_2026-07-15.xlsx')
XLSX.writeFile(wb, outFile)
console.log(`✅ Archivo generado: ${outFile}`)
console.log(`   Hoja 1: ${filas.length.toLocaleString()} registros (BD completa depurada)`)
console.log(`   Hoja 2: ${filasPiloto.length.toLocaleString()} registros (piloto Cirugía ya enviado)\n`)

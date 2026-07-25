#!/usr/bin/env node
/**
 * BD Coh2 → CSVs importables
 *
 * Equivale a _bd-to-csv.js pero para la segunda cohorte de procedimientos.
 * Diferencias vs primera BD:
 *  - Lee BD_COH2_QA.xlsx (generado por _bd-coh2-qa-enricher.js)
 *  - procedimiento → columna "Procedimiento (propuesta homologado BOT)" (r[26])
 *    (más clara para el paciente, homologada por Dr. Jeancarlo)
 *  - Todos son tipo_atencion = 'procedimiento' (solo Procedimientos Ambulatorios)
 *  - Lateralidad vacía en Coh2 (se envía como '')
 *
 * Uso:
 *   node scripts/_bd-coh2-to-csv.js
 *   node scripts/_bd-coh2-to-csv.js --summary
 *   node scripts/_bd-coh2-to-csv.js --campana ENCUESTA-PROC-02
 */

const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

const QA_FILE = path.join(__dirname, 'output', 'BD_COH2_QA.xlsx')
const OUT_DIR = path.join(__dirname, 'output')

const SUMMARY_ONLY = process.argv.includes('--summary')
const campanaIdx   = process.argv.indexOf('--campana')
const CAMPANA_ID   = campanaIdx !== -1 ? (process.argv[campanaIdx + 1] ?? '') : ''

const CSV_HEADERS = [
  'id_registro',
  'nombre_paciente',
  'numero_asegurado',
  'correo',
  'centro_medico',
  'tipo_atencion',
  'ultimos_4_asegurado',
  'telefono',
  'especialidad',
  'nombre_servicio',
  'lateralidad',
  'procedimiento',
  'tipo_consulta',
  'fecha_cita',
  'hora_cita',
  'campana_id',
]

function csvField(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function clean(v) {
  const s = String(v ?? '').trim()
  return (s === '-' || s === '0' || s === '') ? '' : s
}

function ultimos4(id) {
  const limpio = String(id ?? '').replace(/\D/g, '')
  return limpio.length >= 4 ? limpio.slice(-4) : ''
}

function buildNombre(n, a1, a2) {
  return [n, a1, a2].map(s => String(s ?? '').trim()).filter(Boolean).join(' ')
}

if (!fs.existsSync(QA_FILE)) {
  console.error(`\n❌ No se encontró: ${QA_FILE}`)
  console.error('   Primero ejecuta: node scripts/_bd-coh2-qa-enricher.js\n')
  process.exit(1)
}

console.log('📂 Leyendo BD_COH2_QA.xlsx...')
const wb   = XLSX.readFile(QA_FILE)
const ws   = wb.Sheets['BD_QA']
if (!ws) {
  console.error('❌ No se encontró la hoja BD_QA en el archivo QA.')
  process.exit(1)
}

const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
const headers = rawData[0]
const rows    = rawData.slice(1)
console.log(`   Total filas en BD_QA: ${rows.length.toLocaleString()}`)

const COL = {}
headers.forEach((h, i) => { if (h) COL[String(h).trim()] = i })

const requiredQA = ['QA_ESTADO_PILOTO', 'QA_CORREO_FINAL', 'QA_CORREO_TIPO', 'QA_TEL_FINAL']
for (const col of requiredQA) {
  if (COL[col] === undefined) {
    console.error(`❌ Columna '${col}' no encontrada. ¿Usaste _bd-coh2-qa-enricher.js?`)
    process.exit(1)
  }
}

const IDX = {
  eje:           COL['Eje']               ?? 0,
  id_utle:       COL['ID_UTLE']           ?? 1,
  centro_medico: COL['Centro_Médico']     ?? 3,
  servicio:      COL['Servicio']          ?? 7,
  especialidad:  COL['Especialidad']      ?? 8,
  num_id:        COL['numeroIdentificacion'] ?? 15,
  nombre:        COL['nombrePaciente']    ?? 16,
  apellido1:     COL['primerApellido']    ?? 17,
  apellido2:     COL['segundoApellido']   ?? 18,
  // Procedimiento homologado (Dr. Jeancarlo) — más clara para el paciente
  // Nota: el nombre en el Excel tiene espacio después del '(': "Procedimiento ( propuesta..."
  procedimiento: COL['Procedimiento ( propuesta homologado BOT)'] ?? COL['Procedimiento (propuesta homologado BOT)'] ?? 26,
  tipo_consulta: COL['Tipo Consulta (Enfasis)']  ?? 31,
  fecha_atencion:COL['Fecha Atención']    ?? 32,
  hora_cupo:     COL['HORA CUPO']         ?? 33,
  lateralidad:   COL['Lateralidad']       ?? 40,  // vacía en Coh2
}

const incluir = rows.filter(r => String(r[COL['QA_ESTADO_PILOTO']] ?? '').trim() === 'INCLUIR')
console.log(`   QA_ESTADO_PILOTO = INCLUIR: ${incluir.length.toLocaleString()}`)
console.log(`   QA_ESTADO_PILOTO = REVISAR: ${rows.filter(r => r[COL['QA_ESTADO_PILOTO']] === 'REVISAR').length.toLocaleString()}`)
console.log(`   QA_ESTADO_PILOTO = EXCLUIR: ${rows.filter(r => r[COL['QA_ESTADO_PILOTO']] === 'EXCLUIR').length.toLocaleString()}\n`)

const buckets = { procedimiento: [], sin_correo: [] }
const stats   = { sin_ultimos4: 0, eje_desconocido: 0, institucional_a_wa: 0 }

for (const r of incluir) {
  const numId = clean(r[IDX.num_id])
  const u4    = ultimos4(numId)
  if (!u4) { stats.sin_ultimos4++; continue }

  const correoTipo    = String(r[COL['QA_CORREO_TIPO']] ?? '').trim()
  const esInstitucional = correoTipo === 'INSTITUCIONAL'
  const correo = esInstitucional ? '' : (String(r[COL['QA_CORREO_FINAL']] ?? '').trim() || '')
  if (esInstitucional) stats.institucional_a_wa++

  const telefono = String(r[COL['QA_TEL_FINAL']] ?? '').trim()

  const registro = {
    id_registro:         clean(r[IDX.id_utle]),
    nombre_paciente:     buildNombre(r[IDX.nombre], r[IDX.apellido1], r[IDX.apellido2]),
    numero_asegurado:    numId,
    correo,
    centro_medico:       clean(r[IDX.centro_medico]),
    tipo_atencion:       'procedimiento',   // Coh2 = 100% Procedimientos Ambulatorios
    ultimos_4_asegurado: u4,
    telefono,
    especialidad:        clean(r[IDX.especialidad]),
    nombre_servicio:     clean(r[IDX.servicio]),
    lateralidad:         '',                // vacía en Coh2
    procedimiento:       clean(r[IDX.procedimiento]),
    tipo_consulta:       clean(r[IDX.tipo_consulta]),
    fecha_cita:          clean(r[IDX.fecha_atencion]) || '',
    hora_cita:           clean(r[IDX.hora_cupo])      || '',
    campana_id:          CAMPANA_ID,
  }

  if (!correo) {
    buckets.sin_correo.push(registro)
  } else {
    buckets.procedimiento.push(registro)
  }
}

const totalConCorreo = buckets.procedimiento.length
const totalSinCorreo = buckets.sin_correo.length

console.log('📊 RESUMEN FINAL (post-depuración Coh2)\n')
console.log(`   INCLUIR total:          ${incluir.length.toLocaleString()}`)
console.log(`   ├─ Proced. (correo):    ${buckets.procedimiento.length.toLocaleString()}`)
console.log(`   └─ Sin correo / WA:     ${totalSinCorreo.toLocaleString()}  (${stats.institucional_a_wa} institucionales redirigidos)`)
console.log()
console.log(`   Total canal correo:     ${totalConCorreo.toLocaleString()}`)
console.log(`   Total canal WA/llamada: ${totalSinCorreo.toLocaleString()}`)
if (stats.sin_ultimos4) console.log(`   Sin ultimos_4 (excl.):  ${stats.sin_ultimos4}`)
if (CAMPANA_ID)         console.log(`\n   campana_id asignado:    "${CAMPANA_ID}"`)
console.log()

if (SUMMARY_ONLY) {
  console.log('ℹ️  Modo --summary: no se escribieron archivos.')
  process.exit(0)
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)

function writeCsv(filename, records) {
  const headerLine = CSV_HEADERS.join(',')
  const lines = records.map(r => CSV_HEADERS.map(h => csvField(r[h])).join(','))
  const content = [headerLine, ...lines].join('\n')
  const fullPath = path.join(OUT_DIR, filename)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log(`   ✅ ${filename.padEnd(35)} ${records.length.toLocaleString().padStart(7)} registros`)
  return fullPath
}

console.log('📁 Escribiendo CSVs en scripts/output/\n')
writeCsv('BD_COH2_procedimiento.csv', buckets.procedimiento)
writeCsv('BD_COH2_sin_correo.csv',    buckets.sin_correo)

const resumen = {
  generado_en:    new Date().toISOString(),
  fuente:         'BD_COH2_QA.xlsx → hoja BD_QA',
  criterio:       'QA_ESTADO_PILOTO = INCLUIR',
  total_qa:       rows.length,
  incluir:        incluir.length,
  con_correo:     totalConCorreo,
  sin_correo_wa:  totalSinCorreo,
  detalles: {
    institucionales_a_wa:    stats.institucional_a_wa,
    sin_ultimos4_excluidos:  stats.sin_ultimos4,
  },
  campana_id_asignado: CAMPANA_ID || '(vacío — asignar al importar)',
}
fs.writeFileSync(path.join(OUT_DIR, 'BD_COH2_resumen.json'), JSON.stringify(resumen, null, 2))

console.log(`\n✅ Listo. Archivos en: scripts/output/`)
console.log(`   Importar BD_COH2_procedimiento.csv desde el panel admin.\n`)

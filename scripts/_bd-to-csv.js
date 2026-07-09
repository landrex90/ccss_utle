#!/usr/bin/env node
/**
 * BD Borrador → CSVs importables (versión post-depuración final)
 *
 * Lee BD_BOT_Borrador_QA.xlsx (generado por _bd-qa-enricher.js)
 * y exporta solo los registros QA_ESTADO_PILOTO = INCLUIR.
 *
 * Salida: scripts/output/
 *   BD_cirugia.csv         → tipo_atencion = cirugia  (con correo)
 *   BD_consulta.csv        → tipo_atencion = consulta (con correo)
 *   BD_procedimiento.csv   → tipo_atencion = procedimiento (con correo)
 *   BD_sin_correo.csv      → INCLUIR sin correo (canal WA/voicebot)
 *   BD_resumen.json        → estadísticas del proceso
 *
 * Exclusiones aplicadas (ya calculadas por enricher):
 *   - QA_ESTADO_PILOTO != INCLUIR   (EXCLUIR: duplicados, sensibles, sin contacto)
 *                                   (REVISAR: citas vencidas, menores)
 *   - QA_CORREO_TIPO = INSTITUCIONAL → va a BD_sin_correo aunque tenga email
 *
 * Uso:
 *   node scripts/_bd-to-csv.js              → genera todos los archivos
 *   node scripts/_bd-to-csv.js --summary    → solo muestra estadísticas
 *   node scripts/_bd-to-csv.js --campana warmup-cirugia-01  → asigna campana_id
 */

const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

const QA_FILE = path.join(__dirname, 'output', 'BD_BOT_Borrador_QA.xlsx')
const OUT_DIR = path.join(__dirname, 'output')

const SUMMARY_ONLY  = process.argv.includes('--summary')
const campanaIdx    = process.argv.indexOf('--campana')
const CAMPANA_ID    = campanaIdx !== -1 ? (process.argv[campanaIdx + 1] ?? '') : ''

// ── CSV headers (deben coincidir con plantilla-import-pacientes.csv) ───────────
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

// ── Mapeo de ejes ──────────────────────────────────────────────────────────────
const EJE_MAP = {
  'Cirugía':                    'cirugia',
  'Consulta Externa':            'consulta',
  'Procedimientos Ambulatorios': 'procedimiento',
}

// ── Utilidades CSV ─────────────────────────────────────────────────────────────
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

// ── Leer QA Excel ──────────────────────────────────────────────────────────────
if (!fs.existsSync(QA_FILE)) {
  console.error(`\n❌ No se encontró: ${QA_FILE}`)
  console.error('   Primero ejecuta: node scripts/_bd-qa-enricher.js\n')
  process.exit(1)
}

console.log('📂 Leyendo BD_BOT_Borrador_QA.xlsx...')
const wb   = XLSX.readFile(QA_FILE)
const ws   = wb.Sheets['BD_QA']
if (!ws) {
  console.error('❌ No se encontró la hoja BD_QA en el archivo QA.')
  process.exit(1)
}

// Leer con header 1 para tener índice de columnas
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
const headers = rawData[0]
const rows    = rawData.slice(1)
console.log(`   Total filas en BD_QA: ${rows.length.toLocaleString()}`)

// Construir mapa nombre→índice para las columnas (originales + QA)
const COL = {}
headers.forEach((h, i) => { if (h) COL[String(h).trim()] = i })

// Verificar columnas QA críticas
const requiredQA = ['QA_ESTADO_PILOTO', 'QA_CORREO_FINAL', 'QA_CORREO_TIPO', 'QA_TEL_FINAL']
for (const col of requiredQA) {
  if (COL[col] === undefined) {
    console.error(`❌ Columna '${col}' no encontrada. ¿Usaste el enricher correcto?`)
    process.exit(1)
  }
}

// Columnas originales (índices estables de la BD fuente)
// Usamos COL lookup para compatibilidad con headers del enricher
const IDX = {
  eje:           COL['Eje']               ?? 0,
  id_utle:       COL['ID_UTLE']           ?? 1,
  centro_medico: COL['Centro_Médico']     ?? 3,
  servicio:      COL['Servicio']          ?? 7,
  especialidad:  COL['Especialidad']      ?? 8,
  num_id:        COL['numeroIdentificacion'] ?? 13,
  nombre:        COL['nombrePaciente']    ?? 14,
  apellido1:     COL['primerApellido']    ?? 15,
  apellido2:     COL['segundoApellido']   ?? 16,
  procedimiento: COL['Procedimiento Concatenar'] ?? 27,
  tipo_consulta: COL['Tipo Consulta (Enfasis)']  ?? 28,
  fecha_atencion:COL['Fecha Atención']    ?? 29,
  hora_cupo:     COL['HORA CUPO']         ?? 30,
  lateralidad:   COL['Lateralidad']       ?? 37,
}

// ── Filtrar INCLUIR ────────────────────────────────────────────────────────────
const incluir = rows.filter(r => String(r[COL['QA_ESTADO_PILOTO']] ?? '').trim() === 'INCLUIR')
console.log(`   QA_ESTADO_PILOTO = INCLUIR: ${incluir.length.toLocaleString()}`)
console.log(`   QA_ESTADO_PILOTO = REVISAR: ${rows.filter(r => r[COL['QA_ESTADO_PILOTO']] === 'REVISAR').length.toLocaleString()}`)
console.log(`   QA_ESTADO_PILOTO = EXCLUIR: ${rows.filter(r => r[COL['QA_ESTADO_PILOTO']] === 'EXCLUIR').length.toLocaleString()}\n`)

// ── Procesar cada registro INCLUIR ─────────────────────────────────────────────
const buckets = { cirugia: [], consulta: [], procedimiento: [], sin_correo: [] }
const stats   = { sin_ultimos4: 0, eje_desconocido: 0, institucional_a_wa: 0 }

for (const r of incluir) {
  const ejeRaw = String(r[IDX.eje] ?? '').trim()
  const tipo   = EJE_MAP[ejeRaw]
  if (!tipo) { stats.eje_desconocido++; continue }

  const numId    = clean(r[IDX.num_id])
  const u4       = ultimos4(numId)
  if (!u4) { stats.sin_ultimos4++; continue }

  // Usar correo y teléfono ya validados por el enricher
  const correoTipo = String(r[COL['QA_CORREO_TIPO']] ?? '').trim()
  const esInstitucional = correoTipo === 'INSTITUCIONAL'
  const correo = esInstitucional ? '' : (String(r[COL['QA_CORREO_FINAL']] ?? '').trim() || '')
  if (esInstitucional) stats.institucional_a_wa++

  const telefono = String(r[COL['QA_TEL_FINAL']] ?? '').trim()

  const conCita = tipo === 'consulta' || tipo === 'procedimiento'

  const registro = {
    id_registro:         clean(r[IDX.id_utle]),
    nombre_paciente:     buildNombre(r[IDX.nombre], r[IDX.apellido1], r[IDX.apellido2]),
    numero_asegurado:    numId,
    correo,
    centro_medico:       clean(r[IDX.centro_medico]),
    tipo_atencion:       tipo,
    ultimos_4_asegurado: u4,
    telefono,
    especialidad:        clean(r[IDX.especialidad]),
    nombre_servicio:     clean(r[IDX.servicio]),
    lateralidad:         clean(r[IDX.lateralidad]),
    procedimiento:       clean(r[IDX.procedimiento]),
    tipo_consulta:       clean(r[IDX.tipo_consulta]),
    fecha_cita:          conCita ? (clean(r[IDX.fecha_atencion]) || '') : '',
    hora_cita:           conCita ? (clean(r[IDX.hora_cupo])      || '') : '',
    campana_id:          CAMPANA_ID,
  }

  if (!correo) {
    buckets.sin_correo.push(registro)
  } else {
    buckets[tipo].push(registro)
  }
}

// ── Estadísticas ───────────────────────────────────────────────────────────────
const totalConCorreo = buckets.cirugia.length + buckets.consulta.length + buckets.procedimiento.length
const totalSinCorreo = buckets.sin_correo.length

console.log('📊 RESUMEN FINAL (post-depuración)\n')
console.log(`   INCLUIR total:          ${incluir.length.toLocaleString()}`)
console.log(`   ├─ Cirugía (correo):    ${buckets.cirugia.length.toLocaleString()}`)
console.log(`   ├─ Consulta (correo):   ${buckets.consulta.length.toLocaleString()}`)
console.log(`   ├─ Proced. (correo):    ${buckets.procedimiento.length.toLocaleString()}`)
console.log(`   └─ Sin correo / WA:     ${totalSinCorreo.toLocaleString()}  (${stats.institucional_a_wa} institucionales redirigidos)`)
console.log()
console.log(`   Total canal correo:     ${totalConCorreo.toLocaleString()}`)
console.log(`   Total canal WA/llamada: ${totalSinCorreo.toLocaleString()}`)
if (stats.sin_ultimos4)    console.log(`   Sin ultimos_4 (excl.):  ${stats.sin_ultimos4}`)
if (stats.eje_desconocido) console.log(`   Eje desconocido (excl.): ${stats.eje_desconocido}`)
if (CAMPANA_ID)            console.log(`\n   campana_id asignado:    "${CAMPANA_ID}"`)
console.log()

if (SUMMARY_ONLY) {
  console.log('ℹ️  Modo --summary: no se escribieron archivos.')
  process.exit(0)
}

// ── Escribir CSVs ──────────────────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)

function writeCsv(filename, records) {
  const headerLine = CSV_HEADERS.join(',')
  const lines = records.map(r => CSV_HEADERS.map(h => csvField(r[h])).join(','))
  const content = [headerLine, ...lines].join('\n')
  const fullPath = path.join(OUT_DIR, filename)
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log(`   ✅ ${filename.padEnd(32)} ${records.length.toLocaleString().padStart(7)} registros`)
  return fullPath
}

console.log('📁 Escribiendo CSVs en scripts/output/\n')
writeCsv('BD_cirugia.csv',       buckets.cirugia)
writeCsv('BD_consulta.csv',      buckets.consulta)
writeCsv('BD_procedimiento.csv', buckets.procedimiento)
writeCsv('BD_sin_correo.csv',    buckets.sin_correo)

// Resumen JSON
const resumen = {
  generado_en:    new Date().toISOString(),
  fuente:         'BD_BOT_Borrador_QA.xlsx → hoja BD_QA',
  criterio:       'QA_ESTADO_PILOTO = INCLUIR',
  total_qa:       rows.length,
  incluir:        incluir.length,
  por_eje_correo: {
    cirugia:       buckets.cirugia.length,
    consulta:      buckets.consulta.length,
    procedimiento: buckets.procedimiento.length,
  },
  sin_correo_wa:  totalSinCorreo,
  detalles: {
    institucionales_a_wa: stats.institucional_a_wa,
    sin_ultimos4_excluidos: stats.sin_ultimos4,
    eje_desconocido_excluidos: stats.eje_desconocido,
  },
  campana_id_asignado: CAMPANA_ID || '(vacío — asignar al importar)',
}
fs.writeFileSync(path.join(OUT_DIR, 'BD_resumen.json'), JSON.stringify(resumen, null, 2))

console.log(`\n✅ Listo. Archivos en: scripts/output/`)
console.log(`   Importar cada CSV desde el panel admin asignando campana_id por eje y lote.\n`)

#!/usr/bin/env node
/**
 * BD Coh2 QA Enricher — genera BD_COH2_QA.xlsx
 *
 * Equivale a _bd-qa-enricher.js pero para la segunda cohorte de procedimientos.
 * Diferencias clave:
 *  - Hoja "Hoja1" (no "BD")
 *  - Filtro: r[45] !== 'NO'  (blanco=INCLUIR, NO=EXCLUIR)
 *  - Índices distintos: cédula=r[15], correo SIAC=r[24], tel SIAC=r[23]
 *  - ARCA completamente vacío — no se usa
 *  - Sin especialidades sensibles (Mariam ya las excluyó)
 *  - Lateralidad vacía — omitida de clave dedup
 *  - POSIBLE_DUPLICIDAD desde Analisis_Detalle (Tipo_Caso)
 *  - Cross-base dedup: lee scripts/output/existing_db_ids.json si existe
 *  - Fecha vencida: usa fecha real de ejecución (no hardcodeada)
 *
 * Uso:
 *   node scripts/_bd-coh2-qa-enricher.js
 *
 * Para cross-dedup contra BD activa, primero exportar IDs con Supabase:
 *   SELECT id_registro FROM registros  →  guardar como scripts/output/existing_db_ids.json
 *
 * Salida: scripts/output/BD_COH2_QA.xlsx
 *   Hoja 1 BD_QA       → todos los registros + columnas QA
 *   Hoja 2 RESUMEN     → estadísticas consolidadas
 *   Hoja 3 EMBUDO      → funnel de filtros
 *   Hoja 4 EXCLUIR     → registros QA_ESTADO=EXCLUIR
 *   Hoja 5 REVISAR     → registros QA_ESTADO=REVISAR
 */

const XLSX = require('xlsx')
const path = require('path')
const fs   = require('fs')

const EXCEL_PATH    = path.join(__dirname,
  '../BD_Coh2_Procedimientos/PROCEMIENTOS COH 2 borrador 14-07-2026.xlsx')
const PATRONES_PATH = path.join(__dirname,
  '../BD_Coh2_Procedimientos/Procedimientos Coh2 patrones y duplicados.xlsx')
const EXISTING_IDS_PATH = path.join(__dirname, 'output', 'existing_db_ids.json')
const OUT_DIR  = path.join(__dirname, 'output')
const OUT_FILE = path.join(OUT_DIR, 'BD_COH2_QA.xlsx')

const HOY = new Date()
HOY.setHours(0, 0, 0, 0)

// ── CONSTANTES DE NEGOCIO ───────────────────────────────────────────────────
const EMAILS_FALSOS = new Set([
  'notiene@notiene.com','notiene@gmail.com','notengo@gmail.com',
  'notiene@hotmail.com','noaplica@gmail.com','sinregistro@gmail.com',
])
const DOMINIOS_INSTITUCIONALES = ['ccss.sa.cr','mj.go.cr','msp.go.cr','tse.go.cr',
  'poder-judicial.go.cr','hacienda.go.cr','bncr.fi.cr']
const DOMINIOS_ALBERGUE = ['albergue','adultomayor','hogarcrea']

const TELS_PLACEHOLDER = new Set([
  '00000000','11111111','22222222','33333333','44444444',
  '55555555','66666666','77777777','88888888','99999999',
  '12345678','87654321','10000000','24381917','24382375',
])
const TEL_PRIMER_DIGITO_INVALIDO = new Set(['0','1','3','5','9'])

// ── UTILIDADES ──────────────────────────────────────────────────────────────
function clean(v) {
  const s = String(v ?? '').trim()
  return (s === '-' || s === '0' || s === '') ? '' : s
}

function isEmailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim().toLowerCase())
}

// Para Coh2: siac=r[24], arca=r[25]
function clasificarEmail(siac, arca) {
  for (const [raw, fuente] of [[siac, 'SIAC'], [arca, 'ARCA']]) {
    const e = String(raw ?? '').trim().toLowerCase()
    if (!isEmailValido(e)) continue
    if (EMAILS_FALSOS.has(e)) return { email: e, tipo: 'FALSO', fuente }
    if (e.includes('notiene') || e.includes('noaplica') || e.includes('sinregistro'))
      return { email: e, tipo: 'FALSO', fuente }
    const dominio = e.split('@')[1] || ''
    if (DOMINIOS_INSTITUCIONALES.some(d => dominio.includes(d)))
      return { email: e, tipo: 'INSTITUCIONAL', fuente }
    if (DOMINIOS_ALBERGUE.some(d => e.includes(d)))
      return { email: e, tipo: 'ALBERGUE', fuente }
    return { email: e, tipo: fuente + '_VALIDO', fuente }
  }
  return { email: '', tipo: 'VACIO', fuente: '' }
}

// Para Coh2: solo SIAC en r[23], ARCA vacío — extraer primer número válido de 8 dígitos
function extraerTelefono(siac) {
  const partes = String(siac ?? '').split(/\D+/)
  for (const p of partes) {
    if (/^\d{8}$/.test(p)) return p
  }
  const todo = String(siac ?? '').replace(/\D/g, '')
  for (let i = 0; i <= todo.length - 8; i++) {
    const sub = todo.slice(i, i + 8)
    if (/^[2678]\d{7}$/.test(sub)) return sub
  }
  return ''
}

function clasificarTelefono(tel) {
  if (!tel) return 'VACIO'
  if (TELS_PLACEHOLDER.has(tel)) return 'PLACEHOLDER'
  if (TEL_PRIMER_DIGITO_INVALIDO.has(tel[0])) return 'INVALIDO'
  if (tel[0] === '2') return 'FIJO_NOWA'
  if (tel[0] === '4') return 'VOIP'
  if (['6', '7', '8'].includes(tel[0])) return 'MOVIL'
  return 'INVALIDO'
}

function parsearFecha(raw) {
  if (!raw || raw === '-' || raw === 0) return null
  if (typeof raw === 'number') {
    return new Date((raw - 25569) * 86400 * 1000)
  }
  const s = String(raw).trim()
  const partes = s.split(/[\/\-]/)
  if (partes.length === 3) {
    const [a, b, c] = partes
    const d1 = new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`)
    if (!isNaN(d1)) return d1
  }
  const d2 = new Date(s)
  return isNaN(d2) ? null : d2
}

function diasDiferencia(fecha, hoy) {
  return Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24))
}

// ── CARGAR DATOS EXTERNOS ───────────────────────────────────────────────────

// 1. IDs existentes en BD (cross-dedup Level 1)
let existingDbIds = new Set()
if (fs.existsSync(EXISTING_IDS_PATH)) {
  const ids = JSON.parse(fs.readFileSync(EXISTING_IDS_PATH, 'utf8'))
  existingDbIds = new Set(ids.map(String))
  console.log(`   ✅ Cross-dedup activo: ${existingDbIds.size.toLocaleString()} IDs en BD`)
} else {
  console.log(`   ⚠️  Sin cross-dedup (no encontrado: scripts/output/existing_db_ids.json)`)
}

// 2. Tipo_Caso desde Analisis_Detalle (POSIBLE_DUPLICIDAD)
const tipoCasoMap = new Map()  // ID_UTLE → Tipo_Caso
{
  console.log('📂 Leyendo Analisis_Detalle...')
  const wb2 = XLSX.readFile(PATRONES_PATH)
  const ws2 = wb2.Sheets['Analisis_Detalle']
  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, raw: true })
  const hdrs2 = rows2[0]
  const idxID = hdrs2.findIndex(h => String(h).includes('ID_UTLE'))
  const idxTC = hdrs2.indexOf('Tipo_Caso')
  if (idxID === -1 || idxTC === -1) {
    console.error('❌ No se encontraron columnas ID_UTLE o Tipo_Caso en Analisis_Detalle')
    process.exit(1)
  }
  for (const r of rows2.slice(1)) {
    const id = String(r[idxID] ?? '').trim()
    const tc = String(r[idxTC] ?? '').trim()
    if (id && tc) tipoCasoMap.set(id, tc)
  }
  console.log(`   ✅ ${tipoCasoMap.size.toLocaleString()} registros cargados`)
}

// ── LEER BD PRINCIPAL ───────────────────────────────────────────────────────
console.log('\n📂 Leyendo Coh2 BD...')
const wb  = XLSX.readFile(EXCEL_PATH)
const ws  = wb.Sheets['Hoja1']
if (!ws) {
  console.error('❌ No se encontró la hoja "Hoja1" en el archivo Coh2.')
  process.exit(1)
}
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
const headers  = raw[0]
const allRows  = raw.slice(1)
console.log(`   Total filas: ${allRows.length.toLocaleString()}`)

// Filtro: blank=INCLUIR, NO=EXCLUIR
// "siRows" = los que NO son 'NO' (equivale a selección=SI en primera BD)
const siRows = allRows.filter(r => String(r[45] ?? '').trim() !== 'NO')
console.log(`   Selección válida (no-NO): ${siRows.length.toLocaleString()}`)
console.log(`   Excluidos por Mariam (NO): ${allRows.length - siRows.length}`)

// ── ÍNDICES — Coh2 ──────────────────────────────────────────────────────────
// r[0]  = Eje
// r[1]  = ID_UTLE
// r[3]  = Centro_Médico
// r[7]  = Servicio
// r[8]  = Especialidad
// r[15] = numeroIdentificacion (cédula)
// r[16] = nombrePaciente
// r[17] = primerApellido
// r[18] = segundoApellido
// r[20] = Edad (ya calculada)
// r[23] = Numeros de telefono de SIAC (única fuente)
// r[24] = Correo electronico SIAC
// r[25] = Correo electronico ARCA (fallback)
// r[26] = Procedimiento homologado (→ mostrar al paciente y guardar en DB)
// r[27] = Procedimiento original (→ clave de dedup)
// r[28] = Categoria
// r[29] = Subcategoria
// r[31] = Tipo Consulta (Enfasis)
// r[32] = Fecha Atención
// r[33] = HORA CUPO
// r[40] = Lateralidad (VACÍO — no incluir en dedup)
// r[45] = Selección final (blank=INCLUIR, NO=EXCLUIR)

// ── PASO 1: CONSTRUIR ÍNDICES GLOBALES ──────────────────────────────────────
console.log('\n⚙️  Construyendo índices...')

const emailCount = {}
const telCount   = {}
const cedulaRegs = {}
const cedulaEjes = {}

for (const r of siRows) {
  const { email } = clasificarEmail(r[24], r[25])
  if (email && !EMAILS_FALSOS.has(email)) {
    emailCount[email] = (emailCount[email] || 0) + 1
  }
  const tel = extraerTelefono(r[23])
  if (tel) {
    telCount[tel] = (telCount[tel] || 0) + 1
  }
  const ced = String(r[15] ?? '').trim()
  if (ced) {
    if (!cedulaRegs[ced]) { cedulaRegs[ced] = 0; cedulaEjes[ced] = new Set() }
    cedulaRegs[ced]++
    cedulaEjes[ced].add(String(r[0] ?? '').trim())
  }
}

// Dedup intra-Coh2: cédula + especialidad + proc_original + categoria + subcategoria
// (sin lateralidad — completamente vacía en Coh2)
const claveVista = {}  // clave → id_utle representativo
for (const r of siRows) {
  const ced   = String(r[15] ?? '').trim()
  const espec = String(r[8]  ?? '').trim()
  const proc  = String(r[27] ?? '').trim()   // procedimiento original
  const cat   = String(r[28] ?? '').trim()
  const sub   = String(r[29] ?? '').trim()
  const clave = [ced, espec, proc, cat, sub].join('|')
  if (!claveVista[clave]) claveVista[clave] = String(r[1] ?? '').trim()
}

// ── PASO 2: PROCESAR FILAS ──────────────────────────────────────────────────
console.log('⚙️  Procesando filas y asignando columnas QA...')

const qaHeaders = [
  'QA_CORREO_FINAL',
  'QA_CORREO_TIPO',
  'QA_CORREO_COMPARTIDO_N',
  'QA_TEL_FINAL',
  'QA_TEL_TIPO',
  'QA_TEL_COMPARTIDO_N',
  'QA_TIENE_CONTACTO',
  'QA_CITA_ESTADO',
  'QA_CITA_FECHA_PARSED',
  'QA_CITA_DIAS_VENCIDA',
  'QA_REGISTROS_PACIENTE',
  'QA_EJES_PACIENTE',
  'QA_ES_DUPLICADO',
  'QA_CROSS_DUP',
  'QA_TIPO_CASO',
  'QA_MENOR_EDAD',
  'QA_CENTENARIO',
  'QA_MOTIVOS_EXCLUSION',
  'QA_ESTADO_PILOTO',
  'QA_CANAL_SUGERIDO',
]

const outputRows    = []
const statsExcluir  = {}
const statsRevisar  = {}

let procCount = 0
const LOG_EVERY = 10000

for (const r of allRows) {
  if (++procCount % LOG_EVERY === 0) {
    process.stdout.write(`\r   Procesadas: ${procCount.toLocaleString()} / ${allRows.length.toLocaleString()}`)
  }

  const esSI   = String(r[45] ?? '').trim() !== 'NO'
  const idUtle = String(r[1]  ?? '').trim()
  const ced    = String(r[15] ?? '').trim()
  const edad   = parseFloat(r[20])  // ya calculada en Coh2

  // ── CORREO ──────────────────────────────────────────────────────────────
  const { email, tipo: emailTipo } = clasificarEmail(r[24], r[25])
  const emailUsable = email && !['FALSO','INSTITUCIONAL','ALBERGUE','VACIO'].includes(emailTipo)
  const emailShared = email ? (emailCount[email] || 0) : 0

  // ── TELÉFONO ─────────────────────────────────────────────────────────────
  const tel      = extraerTelefono(r[23])
  const telTipo  = clasificarTelefono(tel)
  const telUsable = tel && !['PLACEHOLDER','INVALIDO','VACIO'].includes(telTipo)
  const telShared = tel ? (telCount[tel] || 0) : 0

  // ── TIENE CONTACTO ────────────────────────────────────────────────────────
  let tieneContacto
  if (emailUsable && telUsable)       tieneContacto = 'CORREO_Y_TEL'
  else if (emailUsable)               tieneContacto = 'SOLO_CORREO'
  else if (telUsable)                 tieneContacto = 'SOLO_TEL'
  else                                tieneContacto = 'NINGUNO'

  // ── CITA ──────────────────────────────────────────────────────────────────
  // Todos en Coh2 son Procedimientos Ambulatorios — todos tienen fecha
  let citaEstado = 'VIGENTE'
  let citaFechaParsed = ''
  let citaDiasVencida = 0
  const fecha = parsearFecha(r[32])
  if (!fecha) {
    citaEstado = 'SIN_FECHA'
  } else {
    const diffDias = diasDiferencia(fecha, HOY)
    citaFechaParsed = fecha.toISOString().slice(0, 10)
    if (diffDias > 0) {
      citaEstado      = 'VENCIDA'
      citaDiasVencida = diffDias
    }
  }

  // ── PACIENTE ──────────────────────────────────────────────────────────────
  const regsTotal = ced ? (cedulaRegs[ced] || 1) : 1
  const ejesTotal = ced ? (cedulaEjes[ced] ? cedulaEjes[ced].size : 1) : 1

  // ── DUPLICADO INTRA-COH2 ──────────────────────────────────────────────────
  let esDuplicado = 'UNICO'
  if (esSI && ced) {
    const espec = String(r[8]  ?? '').trim()
    const proc  = String(r[27] ?? '').trim()
    const cat   = String(r[28] ?? '').trim()
    const sub   = String(r[29] ?? '').trim()
    const clave = [ced, espec, proc, cat, sub].join('|')
    const repr  = claveVista[clave]
    if (repr === idUtle)   esDuplicado = 'REPRESENTATIVO'
    else if (repr)         esDuplicado = 'DUPLICADO'
  }

  // ── CROSS-DEDUP (Level 1: ID_UTLE ya en BD) ──────────────────────────────
  const crossDup = (esSI && idUtle && existingDbIds.has(idUtle)) ? 'CROSS_DUP_EXACT' : ''

  // ── TIPO_CASO (de Analisis_Detalle) ──────────────────────────────────────
  const tipoCaso = tipoCasoMap.get(idUtle) || 'DESCONOCIDO'

  // ── EDAD ──────────────────────────────────────────────────────────────────
  const esMenor      = !isNaN(edad) && edad < 18  ? 'SI' : 'NO'
  const esCentenario = !isNaN(edad) && edad > 100 ? 'SI' : 'NO'

  // ── MOTIVOS DE EXCLUSIÓN / REVISIÓN ──────────────────────────────────────
  const motivos = []

  if (!esSI) {
    motivos.push('SELECCION_NO')
  } else {
    if (tieneContacto === 'NINGUNO')       motivos.push('SIN_CONTACTO')
    if (esDuplicado === 'DUPLICADO')       motivos.push('DUPLICADO_EXACTO')
    if (crossDup === 'CROSS_DUP_EXACT')   motivos.push('CROSS_DUP_EXACT')
    if (citaEstado === 'VENCIDA')          motivos.push('CITA_VENCIDA')
    if (esMenor === 'SI')                  motivos.push('MENOR_EDAD')
    if (esCentenario === 'SI')             motivos.push('CENTENARIO')
    if (emailTipo === 'INSTITUCIONAL')     motivos.push('CORREO_INSTITUCIONAL')
    if (emailTipo === 'ALBERGUE')          motivos.push('CORREO_ALBERGUE')
    if (telTipo === 'PLACEHOLDER')         motivos.push('TEL_PLACEHOLDER')
    if (emailShared >= 10)                 motivos.push('CORREO_COMPARTIDO_ALTO')
    if (telShared >= 10)                   motivos.push('TEL_COMPARTIDO_ALTO')
    if (tipoCaso === 'POSIBLE_DUPLICIDAD') motivos.push('POSIBLE_DUPLICIDAD')
  }

  // ── ESTADO PILOTO ─────────────────────────────────────────────────────────
  const motivosExcluir = ['SELECCION_NO','SIN_CONTACTO','DUPLICADO_EXACTO',
    'CROSS_DUP_EXACT','CITA_VENCIDA','TEL_PLACEHOLDER',
    'CORREO_INSTITUCIONAL','CORREO_ALBERGUE']
  const motivosRevisar = ['MENOR_EDAD','CENTENARIO',
    'CORREO_COMPARTIDO_ALTO','TEL_COMPARTIDO_ALTO','POSIBLE_DUPLICIDAD']

  let estadoPiloto = 'INCLUIR'
  if (motivos.some(m => motivosExcluir.includes(m)))      estadoPiloto = 'EXCLUIR'
  else if (motivos.some(m => motivosRevisar.includes(m))) estadoPiloto = 'REVISAR'

  for (const m of motivos) {
    if (estadoPiloto === 'EXCLUIR') statsExcluir[m] = (statsExcluir[m] || 0) + 1
    else if (estadoPiloto === 'REVISAR') statsRevisar[m] = (statsRevisar[m] || 0) + 1
  }

  // ── CANAL SUGERIDO ────────────────────────────────────────────────────────
  let canal = 'EXCLUIDO'
  if (estadoPiloto !== 'EXCLUIR') {
    if (emailUsable && telUsable && telTipo === 'MOVIL')     canal = 'CORREO_WA'
    else if (emailUsable && telTipo === 'FIJO_NOWA')         canal = 'CORREO_LLAMADA'
    else if (emailUsable)                                    canal = 'SOLO_CORREO'
    else if (telUsable && telTipo === 'MOVIL')               canal = 'SOLO_WA'
    else if (telUsable && telTipo === 'FIJO_NOWA')           canal = 'SOLO_LLAMADA'
    else                                                     canal = 'PRESENCIAL'
  }

  // ── ARMAR FILA ────────────────────────────────────────────────────────────
  const qaValues = [
    email,
    emailTipo,
    emailShared,
    tel,
    telTipo,
    telShared,
    tieneContacto,
    citaEstado,
    citaFechaParsed,
    citaDiasVencida,
    regsTotal,
    ejesTotal,
    esDuplicado,
    crossDup,
    tipoCaso,
    esMenor,
    esCentenario,
    motivos.join(' | '),
    estadoPiloto,
    canal,
  ]

  // Pad la fila original a headers.length para que qBase sea consistente
  const paddedR = [...r]
  while (paddedR.length < headers.length) paddedR.push(null)
  outputRows.push([...paddedR, ...qaValues])
}

process.stdout.write('\n')
console.log(`✅ Filas procesadas: ${outputRows.length.toLocaleString()}\n`)

// ── PASO 3: ESTADÍSTICAS ────────────────────────────────────────────────────
console.log('📊 Calculando estadísticas...')

const qBase     = headers.length
const siOut     = outputRows.filter(r => String(r[45] ?? '').trim() !== 'NO')
const idxEstado = qBase + qaHeaders.indexOf('QA_ESTADO_PILOTO')
const idxMotivo = qBase + qaHeaders.indexOf('QA_MOTIVOS_EXCLUSION')
const idxCanal  = qBase + qaHeaders.indexOf('QA_CANAL_SUGERIDO')
const idxCitaE  = qBase + qaHeaders.indexOf('QA_CITA_ESTADO')
const idxEmailT = qBase + qaHeaders.indexOf('QA_CORREO_TIPO')
const idxTelT   = qBase + qaHeaders.indexOf('QA_TEL_TIPO')
const idxContacto = qBase + qaHeaders.indexOf('QA_TIENE_CONTACTO')
const idxEsDup  = qBase + qaHeaders.indexOf('QA_ES_DUPLICADO')
const idxTipoCaso = qBase + qaHeaders.indexOf('QA_TIPO_CASO')

const contar = (arr, col) => {
  const res = {}
  arr.forEach(x => { const v = x[col]; res[v] = (res[v]||0)+1 })
  return Object.entries(res).sort((a,b)=>b[1]-a[1])
}

const estadoDist   = contar(siOut, idxEstado)
const canalDist    = contar(siOut, idxCanal)
const citaEDist    = contar(siOut, idxCitaE)
const emailTDist   = contar(siOut, idxEmailT)
const telTDist     = contar(siOut, idxTelT)
const contactoDist = contar(siOut, idxContacto)
const dupDist      = contar(siOut, idxEsDup)
const tipoCasoDist = contar(siOut, idxTipoCaso)

const nIncluir = siOut.filter(r => r[idxEstado] === 'INCLUIR').length
const nExcluir = siOut.filter(r => r[idxEstado] === 'EXCLUIR').length
const nRevisar = siOut.filter(r => r[idxEstado] === 'REVISAR').length

// ── PASO 4: CONSTRUIR EXCEL ─────────────────────────────────────────────────
console.log('📁 Construyendo Excel de salida...')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)

const wbOut = XLSX.utils.book_new()

// ── HOJA 1: BD_QA ────────────────────────────────────────────────────────────
const allHeaders = [...headers, ...qaHeaders]
const wsBDQA     = XLSX.utils.aoa_to_sheet([allHeaders, ...outputRows])
XLSX.utils.book_append_sheet(wbOut, wsBDQA, 'BD_QA')

// ── HOJA 2: RESUMEN ───────────────────────────────────────────────────────────
const resumenData = [
  ['REPORTE DE CALIDAD — BD COH2 PROCEDIMIENTOS', '', ''],
  ['Generado:', new Date().toLocaleString('es-CR'), ''],
  ['Cross-dedup activo:', existingDbIds.size > 0 ? 'SÍ (' + existingDbIds.size.toLocaleString() + ' IDs en BD)' : 'NO (sin existing_db_ids.json)', ''],
  ['', '', ''],
  ['UNIVERSO', '', ''],
  ['Total filas en BD', allRows.length, ''],
  ['Selección válida (no-NO)', siOut.length, ''],
  ['Excluidos por Mariam (NO)', allRows.length - siOut.length, ''],
  ['', '', ''],
  ['ESTADO DEL PILOTO (sobre universo válido)', '', ''],
  ['INCLUIR', nIncluir, (nIncluir/siOut.length*100).toFixed(1)+'%'],
  ['REVISAR', nRevisar, (nRevisar/siOut.length*100).toFixed(1)+'%'],
  ['EXCLUIR', nExcluir, (nExcluir/siOut.length*100).toFixed(1)+'%'],
  ['', '', ''],
  ['MOTIVOS DE EXCLUSIÓN', 'Registros', '%'],
  ...Object.entries(statsExcluir).sort((a,b)=>b[1]-a[1])
    .map(([m,n]) => [m, n, (n/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['MOTIVOS DE REVISIÓN', 'Registros', '%'],
  ...Object.entries(statsRevisar).sort((a,b)=>b[1]-a[1])
    .map(([m,n]) => [m, n, (n/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['CONTACTO', 'Registros', '%'],
  ...contactoDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['TIPO DE CORREO', 'Registros', '%'],
  ...emailTDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['TIPO DE TELÉFONO', 'Registros', '%'],
  ...telTDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['CANAL SUGERIDO', 'Registros', '%'],
  ...canalDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['ESTADO DE CITA', 'Registros', '%'],
  ...citaEDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['DUPLICADOS INTRA-COH2', 'Registros', '%'],
  ...dupDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['TIPO_CASO (Analisis_Detalle)', 'Registros', '%'],
  ...tipoCasoDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
]
const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
wsResumen['!cols'] = [{ wch: 50 }, { wch: 15 }, { wch: 10 }]
XLSX.utils.book_append_sheet(wbOut, wsResumen, 'RESUMEN')

// ── HOJA 3: EMBUDO ────────────────────────────────────────────────────────────
const vencidas    = siOut.filter(r => r[idxCitaE] === 'VENCIDA').length
const sinContacto = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_TIENE_CONTACTO')] === 'NINGUNO').length
const duplicados  = siOut.filter(r => r[idxEsDup] === 'DUPLICADO').length
const crossDupN   = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_CROSS_DUP')] === 'CROSS_DUP_EXACT').length
const menores     = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_MENOR_EDAD')] === 'SI').length
const telPlaceh   = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_TEL_TIPO')] === 'PLACEHOLDER').length
const correoInst  = siOut.filter(r => ['INSTITUCIONAL','ALBERGUE'].includes(r[idxEmailT])).length
const posibleDup  = siOut.filter(r => r[idxTipoCaso] === 'POSIBLE_DUPLICIDAD').length

const embudo = [
  ['EMBUDO DE FILTROS — BD COH2', '', '', ''],
  ['Paso', 'Descripción', 'Registros excluidos', 'Quedan'],
  ['0', 'Universo válido (no-NO)', '—', siOut.length],
  ['1', 'Excluidos por Mariam (NO en selección)', '— (ya fuera)', siOut.length],
  ['2', 'Duplicados exactos intra-Coh2', -duplicados, siOut.length - duplicados],
  ['3', 'Cross-dedup: ID_UTLE ya en BD' + (crossDupN === 0 && existingDbIds.size === 0 ? ' (no verificado, sin IDs file)' : ''), -crossDupN, siOut.length - duplicados - crossDupN],
  ['4', 'Sin correo válido NI teléfono usable', -sinContacto, siOut.length - duplicados - crossDupN - sinContacto],
  ['5', 'Correos institucionales / albergue', -correoInst, siOut.length - duplicados - crossDupN - sinContacto - correoInst],
  ['6', 'Teléfonos placeholder', -telPlaceh, siOut.length - duplicados - crossDupN - sinContacto - correoInst - telPlaceh],
  ['7', 'Citas vencidas (fecha < hoy)', -vencidas, siOut.length - duplicados - crossDupN - sinContacto - correoInst - telPlaceh - vencidas],
  ['8', 'Menores de edad', -menores, siOut.length - duplicados - crossDupN - sinContacto - correoInst - telPlaceh - vencidas - menores],
  ['', '', '', ''],
  ['SUBTOTAL EXCLUIR', '', '', nExcluir],
  ['', '', '', ''],
  ['— POSIBLE_DUPLICIDAD (REVISAR, no excluir automáticamente)', posibleDup, '', ''],
  ['', '', '', ''],
  ['TOTAL INCLUIR', nIncluir, '', ''],
  ['TOTAL REVISAR', nRevisar, '', ''],
]
const wsEmbudo = XLSX.utils.aoa_to_sheet(embudo)
wsEmbudo['!cols'] = [{ wch: 5 }, { wch: 60 }, { wch: 22 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wbOut, wsEmbudo, 'EMBUDO')

// ── HOJA 4: EXCLUIR ───────────────────────────────────────────────────────────
const excluirRows = siOut.filter(r => r[idxEstado] === 'EXCLUIR')
const excluirCols = [1, 15, 16, 17, 18, 8, 26, 45, idxMotivo, idxEstado, idxCanal]
const excluirHdr  = ['ID_UTLE','Cédula','Nombre','Apellido1','Apellido2',
  'Especialidad','Procedimiento Homologado','Selección','QA_MOTIVOS','QA_ESTADO','QA_CANAL']
const wsExcluir   = XLSX.utils.aoa_to_sheet([
  excluirHdr,
  ...excluirRows.map(r => excluirCols.map(c => r[c]))
])
wsExcluir['!cols'] = excluirHdr.map((h,i) => ({ wch: i === 8 ? 55 : 20 }))
XLSX.utils.book_append_sheet(wbOut, wsExcluir, 'EXCLUIR')

// ── HOJA 5: REVISAR ───────────────────────────────────────────────────────────
const revisarRows = siOut.filter(r => r[idxEstado] === 'REVISAR')
const revisarCols = [1, 15, 16, 17, 18, 8, 26,
  qBase + qaHeaders.indexOf('QA_CITA_ESTADO'),
  qBase + qaHeaders.indexOf('QA_CITA_FECHA_PARSED'),
  qBase + qaHeaders.indexOf('QA_TIPO_CASO'),
  idxMotivo, idxCanal]
const revisarHdr  = ['ID_UTLE','Cédula','Nombre','Apellido1','Apellido2',
  'Especialidad','Procedimiento Homologado','QA_CITA_ESTADO','QA_CITA_FECHA',
  'QA_TIPO_CASO','QA_MOTIVOS','QA_CANAL']
const wsRevisar   = XLSX.utils.aoa_to_sheet([
  revisarHdr,
  ...revisarRows.map(r => revisarCols.map(c => r[c]))
])
wsRevisar['!cols'] = revisarHdr.map(() => ({ wch: 22 }))
XLSX.utils.book_append_sheet(wbOut, wsRevisar, 'REVISAR')

// ── ESCRIBIR ARCHIVO ─────────────────────────────────────────────────────────
console.log(`\n💾 Escribiendo ${OUT_FILE}...`)
XLSX.writeFile(wbOut, OUT_FILE)

// ── RESUMEN CONSOLA ───────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('  RESUMEN EJECUTIVO — BD COH2')
console.log('═'.repeat(60))
console.log(`  Universo válido:      ${siOut.length.toLocaleString().padStart(8)}  (100%)`)
console.log(`  ✅ INCLUIR:           ${nIncluir.toLocaleString().padStart(8)}  (${(nIncluir/siOut.length*100).toFixed(1)}%)`)
console.log(`  🟡 REVISAR:           ${nRevisar.toLocaleString().padStart(8)}  (${(nRevisar/siOut.length*100).toFixed(1)}%)`)
console.log(`  ❌ EXCLUIR:           ${nExcluir.toLocaleString().padStart(8)}  (${(nExcluir/siOut.length*100).toFixed(1)}%)`)
console.log('─'.repeat(60))
console.log('  Motivos exclusión (top):')
Object.entries(statsExcluir).sort((a,b)=>b[1]-a[1]).slice(0,8)
  .forEach(([m,n]) => console.log(`    ${m.padEnd(38)} ${n.toLocaleString()}`))
console.log('─'.repeat(60))
console.log('  Motivos revisión (top):')
Object.entries(statsRevisar).sort((a,b)=>b[1]-a[1]).slice(0,5)
  .forEach(([m,n]) => console.log(`    ${m.padEnd(38)} ${n.toLocaleString()}`))
if (existingDbIds.size === 0) {
  console.log('\n  ⚠️  CROSS-DEDUP NO ACTIVO')
  console.log('     Para activarlo: exportar IDs desde Supabase → scripts/output/existing_db_ids.json')
  console.log('     SQL: SELECT json_agg(id_registro) FROM registros')
}
console.log('═'.repeat(60))
console.log(`\n✅ Archivo: scripts/output/BD_COH2_QA.xlsx`)
console.log('   Hojas: BD_QA | RESUMEN | EMBUDO | EXCLUIR | REVISAR\n')

#!/usr/bin/env node
/**
 * BD QA Enricher — genera BD_BOT_Borrador_QA.xlsx
 *
 * Lee la BD original y agrega ~20 columnas de análisis de calidad.
 * NO modifica datos originales — solo agrega columnas QA_ al final.
 *
 * Uso:
 *   node scripts/_bd-qa-enricher.js
 *   node scripts/_bd-qa-enricher.js --solo-si     (solo registros Selección=SI)
 *
 * Salida: scripts/output/BD_BOT_Borrador_QA.xlsx
 *   Hoja 1 BD_QA       → todos los registros + columnas QA
 *   Hoja 2 RESUMEN     → estadísticas consolidadas
 *   Hoja 3 EMBUDO      → funnel de filtros hacia el piloto
 *   Hoja 4 EXCLUIR     → registros con QA_ESTADO=EXCLUIR y motivo
 *   Hoja 5 REVISAR     → registros con QA_ESTADO=REVISAR y motivo
 */

const XLSX = require('xlsx')
const path = require('path')
const fs   = require('fs')

const EXCEL_PATH = path.join(__dirname,
  '../Carpeta Correos Socialización, Infografia UTLE y logo CLEO/Base de datos BOT Borrador.xlsx')
const OUT_DIR  = path.join(__dirname, 'output')
const OUT_FILE = path.join(OUT_DIR, 'BD_BOT_Borrador_QA.xlsx')
const SOLO_SI  = process.argv.includes('--solo-si')

// ── CONSTANTES DE NEGOCIO ───────────────────────────────────────────────────
const HOY = new Date('2026-07-07')

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

const ESPECIALIDADES_SENSIBLES = new Set([
  'oncología médica','oncologia medica','oncología quirúrgica','oncologia quirurgica',
  'hematología','hematologia','geriatría','geriatria',
  'psiquiatría','psiquiatria','psicología clínica','psicologia clinica',
  'infectología','infectologia','cuidados paliativos','clínica del dolor','clinica del dolor',
])

// ── UTILIDADES ──────────────────────────────────────────────────────────────
function clean(v) {
  const s = String(v ?? '').trim()
  return (s === '-' || s === '0' || s === '') ? '' : s
}

function isEmailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim().toLowerCase())
}

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

function extraerTelefono(arca1, siac) {
  // ARCA1 — exactamente 8 dígitos
  const a1 = String(arca1 ?? '').replace(/\D/g, '')
  if (/^\d{8}$/.test(a1)) return a1
  // SIAC — separar por cualquier no-dígito
  const partes = String(siac ?? '').split(/\D+/)
  for (const p of partes) {
    if (/^\d{8}$/.test(p)) return p
  }
  // Números pegados: buscar fragmento de 8 dígitos con primer dígito válido CR
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
    // Intentar DD/MM/YYYY
    const d1 = new Date(`${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`)
    if (!isNaN(d1)) return d1
  }
  const d2 = new Date(s)
  return isNaN(d2) ? null : d2
}

function diasDiferencia(fecha, hoy) {
  return Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24))
}

// ── LEER BD ─────────────────────────────────────────────────────────────────
console.log('📂 Leyendo BD Borrador...')
const wb  = XLSX.readFile(EXCEL_PATH)
const ws  = wb.Sheets['BD']
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
const headers  = raw[0]
const allRows  = raw.slice(1)

console.log(`   Total filas: ${allRows.length.toLocaleString()}`)
const rows = SOLO_SI ? allRows.filter(r => r[42] === 'SI') : allRows
if (SOLO_SI) console.log(`   Filtrado a SI: ${rows.length.toLocaleString()}`)

// ── PASO 1: CONSTRUIR ÍNDICES GLOBALES ───────────────────────────────────────
console.log('\n⚙️  Construyendo índices (contactos, pacientes, duplicados)...')

// Índice de correos: email → count de registros SI
const emailCount   = {}
// Índice de teléfonos: tel → count de registros SI
const telCount     = {}
// Índice de registros por cédula (para multicontacto)
const cedulaEjes   = {}   // ced → Set de ejes
const cedulaRegs   = {}   // ced → count total de registros SI

const siRows = allRows.filter(r => r[42] === 'SI')
for (const r of siRows) {
  const { email } = clasificarEmail(r[22], r[23])
  if (email && !EMAILS_FALSOS.has(email)) {
    emailCount[email] = (emailCount[email] || 0) + 1
  }
  const tel = extraerTelefono(r[19], r[21])
  if (tel) {
    telCount[tel] = (telCount[tel] || 0) + 1
  }
  const ced = String(r[13] ?? '').trim()
  if (ced) {
    if (!cedulaRegs[ced]) { cedulaRegs[ced] = 0; cedulaEjes[ced] = new Set() }
    cedulaRegs[ced]++
    cedulaEjes[ced].add(String(r[0] ?? '').trim())
  }
}

// Índice de duplicados exactos por clave: cédula|eje|especialidad|proc|cat|sub|lat
const claveVista = {}   // clave → id_utle del primero (representativo)
for (const r of siRows) {
  const ced   = String(r[13] ?? '').trim()
  const eje   = String(r[0]  ?? '').trim()
  const espec = String(r[8]  ?? '').trim()
  const proc  = String(r[24] ?? '').trim()
  const cat   = String(r[25] ?? '').trim()
  const sub   = String(r[26] ?? '').trim()
  const lat   = String(r[37] ?? '').trim()
  const clave = [ced, eje, espec, proc, cat, sub, lat].join('|')
  if (!claveVista[clave]) claveVista[clave] = String(r[1] ?? '').trim()
}

// ── PASO 2: PROCESAR CADA FILA ───────────────────────────────────────────────
console.log('⚙️  Procesando filas y asignando columnas QA...')

const qaHeaders = [
  'QA_CORREO_FINAL',
  'QA_CORREO_TIPO',         // SIAC_VALIDO | ARCA_VALIDO | FALSO | INSTITUCIONAL | ALBERGUE | VACIO
  'QA_CORREO_COMPARTIDO_N', // cuántos pacientes SI usan este correo
  'QA_TEL_FINAL',
  'QA_TEL_TIPO',            // MOVIL | FIJO_NOWA | VOIP | PLACEHOLDER | INVALIDO | VACIO
  'QA_TEL_COMPARTIDO_N',    // cuántos pacientes SI usan este teléfono
  'QA_TIENE_CONTACTO',      // CORREO_Y_TEL | SOLO_CORREO | SOLO_TEL | NINGUNO
  'QA_CITA_ESTADO',         // VIGENTE | VENCIDA | VENCIDA_SIN_VERIFICAR | SIN_FECHA | NA_CIRUGIA
  'QA_CITA_FECHA_PARSED',   // fecha legible o vacío
  'QA_CITA_DIAS_VENCIDA',   // días desde vencimiento (0 si vigente o sin fecha)
  'QA_REGISTROS_PACIENTE',  // total registros SI para esta cédula
  'QA_EJES_PACIENTE',       // cuántos ejes distintos tiene esta cédula en SI
  'QA_ES_DUPLICADO',        // REPRESENTATIVO | DUPLICADO | UNICO
  'QA_MENOR_EDAD',          // SI | NO
  'QA_CENTENARIO',          // SI | NO (>100 años)
  'QA_ESPECIALIDAD_SENSIBLE',// nombre especialidad si es sensible, vacío si no
  'QA_MOTIVOS_EXCLUSION',   // pipe-separated lista de motivos
  'QA_ESTADO_PILOTO',       // INCLUIR | EXCLUIR | REVISAR
  'QA_CANAL_SUGERIDO',      // CORREO | CORREO_WA | WA | LLAMADA | PRESENCIAL | EXCLUIDO
]

const outputRows = []
const statsExcluir = {}
const statsRevisar = {}

let procCount = 0
const LOG_EVERY = 10000

for (const r of rows) {
  if (++procCount % LOG_EVERY === 0) {
    process.stdout.write(`\r   Procesadas: ${procCount.toLocaleString()} / ${rows.length.toLocaleString()}`)
  }

  const esSI   = r[42] === 'SI'
  const eje    = String(r[0]  ?? '').trim()
  const idUtle = String(r[1]  ?? '').trim()
  const ced    = String(r[13] ?? '').trim()
  const edad   = parseFloat(r[18])

  // ── CORREO ────────────────────────────────────────────────────────────────
  const { email, tipo: emailTipo } = clasificarEmail(r[22], r[23])
  const emailUsable = email && !['FALSO','INSTITUCIONAL','ALBERGUE','VACIO'].includes(emailTipo)
  const emailShared = email ? (emailCount[email] || 0) : 0

  // ── TELÉFONO ──────────────────────────────────────────────────────────────
  const tel     = extraerTelefono(r[19], r[21])
  const telTipo = clasificarTelefono(tel)
  const telUsable = tel && !['PLACEHOLDER','INVALIDO','VACIO'].includes(telTipo)
  const telShared = tel ? (telCount[tel] || 0) : 0

  // ── TIENE CONTACTO ────────────────────────────────────────────────────────
  let tieneContacto
  if (emailUsable && telUsable)       tieneContacto = 'CORREO_Y_TEL'
  else if (emailUsable)               tieneContacto = 'SOLO_CORREO'
  else if (telUsable)                 tieneContacto = 'SOLO_TEL'
  else                                tieneContacto = 'NINGUNO'

  // ── CITA ──────────────────────────────────────────────────────────────────
  let citaEstado = 'NA_CIRUGIA'
  let citaFechaParsed = ''
  let citaDiasVencida = 0
  if (eje !== 'Cirugía') {
    const fecha = parsearFecha(r[29])
    if (!fecha) {
      citaEstado = 'SIN_FECHA'
    } else {
      const diffDias = diasDiferencia(fecha, HOY)
      citaFechaParsed = fecha.toISOString().slice(0, 10)
      if (diffDias > 0) {
        citaEstado      = 'VENCIDA_SIN_VERIFICAR'
        citaDiasVencida = diffDias
      } else {
        citaEstado = 'VIGENTE'
      }
    }
  }

  // ── PACIENTE ──────────────────────────────────────────────────────────────
  const regsTotal = ced ? (cedulaRegs[ced] || 1) : 1
  const ejesTotal = ced ? (cedulaEjes[ced] ? cedulaEjes[ced].size : 1) : 1

  // ── DUPLICADO ─────────────────────────────────────────────────────────────
  let esDuplicado = 'UNICO'
  if (esSI && ced) {
    const espec = String(r[8]  ?? '').trim()
    const proc  = String(r[24] ?? '').trim()
    const cat   = String(r[25] ?? '').trim()
    const sub   = String(r[26] ?? '').trim()
    const lat   = String(r[37] ?? '').trim()
    const clave = [ced, eje, espec, proc, cat, sub, lat].join('|')
    const repr  = claveVista[clave]
    if (repr === idUtle)      esDuplicado = 'REPRESENTATIVO'
    else if (repr)            esDuplicado = 'DUPLICADO'
  }

  // ── EDAD ──────────────────────────────────────────────────────────────────
  const esMenor      = !isNaN(edad) && edad < 18  ? 'SI' : 'NO'
  const esCentenario = !isNaN(edad) && edad > 100 ? 'SI' : 'NO'

  // ── ESPECIALIDAD SENSIBLE ─────────────────────────────────────────────────
  const especRaw     = String(r[8] ?? '').trim()
  const especNorm    = especRaw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  const especSensible = ESPECIALIDADES_SENSIBLES.has(especNorm) ||
    [...ESPECIALIDADES_SENSIBLES].some(e => especNorm.includes(e))
      ? especRaw : ''

  // ── MOTIVOS DE EXCLUSIÓN / REVISIÓN ───────────────────────────────────────
  const motivos = []

  if (!esSI) {
    motivos.push('SELECCION_NO')
  } else {
    if (tieneContacto === 'NINGUNO')          motivos.push('SIN_CONTACTO')
    if (esDuplicado === 'DUPLICADO')          motivos.push('DUPLICADO_EXACTO')
    if (citaEstado === 'VENCIDA_SIN_VERIFICAR') motivos.push('CITA_VENCIDA_SIN_VERIFICAR')
    if (especSensible)                        motivos.push('ESPECIALIDAD_SENSIBLE')
    if (esMenor === 'SI')                     motivos.push('MENOR_EDAD')
    if (esCentenario === 'SI')                motivos.push('CENTENARIO')
    if (emailTipo === 'INSTITUCIONAL')        motivos.push('CORREO_INSTITUCIONAL')
    if (emailTipo === 'ALBERGUE')             motivos.push('CORREO_ALBERGUE')
    if (telTipo === 'PLACEHOLDER')            motivos.push('TEL_PLACEHOLDER')
    if (emailShared >= 10)                    motivos.push('CORREO_COMPARTIDO_ALTO')
    if (telShared >= 10)                      motivos.push('TEL_COMPARTIDO_ALTO')
  }

  // ── ESTADO PILOTO ─────────────────────────────────────────────────────────
  const motivosExcluir = ['SELECCION_NO','SIN_CONTACTO','DUPLICADO_EXACTO',
    'ESPECIALIDAD_SENSIBLE','TEL_PLACEHOLDER','CORREO_INSTITUCIONAL','CORREO_ALBERGUE']
  const motivosRevisar = ['CITA_VENCIDA_SIN_VERIFICAR','MENOR_EDAD','CENTENARIO',
    'CORREO_COMPARTIDO_ALTO','TEL_COMPARTIDO_ALTO']

  let estadoPiloto = 'INCLUIR'
  if (motivos.some(m => motivosExcluir.includes(m)))  estadoPiloto = 'EXCLUIR'
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
    esMenor,
    esCentenario,
    especSensible,
    motivos.join(' | '),
    estadoPiloto,
    canal,
  ]

  outputRows.push([...r, ...qaValues])
}

process.stdout.write('\n')
console.log(`✅ Filas procesadas: ${outputRows.length.toLocaleString()}\n`)

// ── PASO 3: ESTADÍSTICAS ─────────────────────────────────────────────────────
console.log('📊 Calculando estadísticas...')

const siOut    = outputRows.filter(r => r[42] === 'SI')
const qBase    = headers.length // índice donde empiezan las columnas QA
const idxEstado = qBase + qaHeaders.indexOf('QA_ESTADO_PILOTO')
const idxMotivo = qBase + qaHeaders.indexOf('QA_MOTIVOS_EXCLUSION')
const idxCanal  = qBase + qaHeaders.indexOf('QA_CANAL_SUGERIDO')
const idxCitaE  = qBase + qaHeaders.indexOf('QA_CITA_ESTADO')
const idxEmailT = qBase + qaHeaders.indexOf('QA_CORREO_TIPO')
const idxTelT   = qBase + qaHeaders.indexOf('QA_TEL_TIPO')
const idxContacto = qBase + qaHeaders.indexOf('QA_TIENE_CONTACTO')
const idxEsDup  = qBase + qaHeaders.indexOf('QA_ES_DUPLICADO')

const contar = (arr, col) => {
  const r = {}
  arr.forEach(x => { const v = x[col]; r[v] = (r[v]||0)+1 })
  return Object.entries(r).sort((a,b)=>b[1]-a[1])
}

const estadoDist = contar(siOut, idxEstado)
const canalDist  = contar(siOut, idxCanal)
const citaEDist  = contar(siOut, idxCitaE)
const emailTDist = contar(siOut, idxEmailT)
const telTDist   = contar(siOut, idxTelT)
const contactoDist = contar(siOut, idxContacto)
const dupDist    = contar(siOut, idxEsDup)

const nIncluir   = siOut.filter(r => r[idxEstado] === 'INCLUIR').length
const nExcluir   = siOut.filter(r => r[idxEstado] === 'EXCLUIR').length
const nRevisar   = siOut.filter(r => r[idxEstado] === 'REVISAR').length

// ── PASO 4: CONSTRUIR EXCEL ──────────────────────────────────────────────────
console.log('📁 Construyendo Excel de salida...')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)

const wbOut = XLSX.utils.book_new()

// ── HOJA 1: BD_QA ────────────────────────────────────────────────────────────
const allHeaders = [...headers, ...qaHeaders]
const bdQaData   = [allHeaders, ...outputRows]
const wsBDQA     = XLSX.utils.aoa_to_sheet(bdQaData)

// Colores de fondo para la columna QA_ESTADO_PILOTO (col AQ = headers.length + 17)
// xlsx no soporta colores en open-format; usamos comentario en el header
XLSX.utils.book_append_sheet(wbOut, wsBDQA, 'BD_QA')

// ── HOJA 2: RESUMEN ───────────────────────────────────────────────────────────
const resumenData = [
  ['REPORTE DE CALIDAD — BD BOT BORRADOR', '', ''],
  ['Generado:', new Date().toLocaleString('es-CR'), ''],
  ['', '', ''],
  ['UNIVERSO', '', ''],
  ['Total filas en BD', allRows.length, ''],
  ['Registros Selección=SI', siOut.length, ''],
  ['Registros Selección=NO', allRows.length - siOut.length, ''],
  ['', '', ''],
  ['ESTADO DEL PILOTO (sobre universo SI)', '', ''],
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
  ['CONTACTO', 'Registros SI', '%'],
  ...contactoDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['TIPO DE CORREO', 'Registros SI', '%'],
  ...emailTDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['TIPO DE TELÉFONO', 'Registros SI', '%'],
  ...telTDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['CANAL SUGERIDO', 'Registros SI', '%'],
  ...canalDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['ESTADO DE CITA (CE + Procedimientos)', 'Registros', '%'],
  ...citaEDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
  ['', '', ''],
  ['DUPLICADOS', 'Registros SI', '%'],
  ...dupDist.map(([k,v]) => [k, v, (v/siOut.length*100).toFixed(1)+'%']),
]
const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
wsResumen['!cols'] = [{ wch: 45 }, { wch: 15 }, { wch: 10 }]
XLSX.utils.book_append_sheet(wbOut, wsResumen, 'RESUMEN')

// ── HOJA 3: EMBUDO ────────────────────────────────────────────────────────────
const vencidas   = siOut.filter(r => r[idxCitaE] === 'VENCIDA_SIN_VERIFICAR').length
const sinContacto = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_TIENE_CONTACTO')] === 'NINGUNO').length
const duplicados = siOut.filter(r => r[idxEsDup] === 'DUPLICADO').length
const sensibles  = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_ESPECIALIDAD_SENSIBLE')] !== '').length
const menores    = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_MENOR_EDAD')] === 'SI').length
const telPlaceh  = siOut.filter(r => r[qBase + qaHeaders.indexOf('QA_TEL_TIPO')] === 'PLACEHOLDER').length
const correoInst = siOut.filter(r => ['INSTITUCIONAL','ALBERGUE'].includes(r[idxEmailT])).length

const embudo = [
  ['EMBUDO DE FILTROS — HACIA EL PILOTO', '', '', ''],
  ['Paso', 'Descripción', 'Registros excluidos', 'Quedan'],
  ['0', 'Universo Selección=SI', '—', siOut.length],
  ['1', 'Duplicados exactos (conservar 1 por grupo)', -duplicados, siOut.length - duplicados],
  ['2', 'Sin correo válido NI teléfono usable', -sinContacto, siOut.length - duplicados - sinContacto],
  ['3', 'Especialidades sensibles (onco, hemato, geria)', -sensibles, siOut.length - duplicados - sinContacto - sensibles],
  ['4', 'Correos institucionales / albergue (riesgo privacidad)', -correoInst, siOut.length - duplicados - sinContacto - sensibles - correoInst],
  ['5', 'Teléfonos placeholder (22222222, etc.)', -telPlaceh, siOut.length - duplicados - sinContacto - sensibles - correoInst - telPlaceh],
  ['6', 'Menores de edad (manejo especial)', -menores, siOut.length - duplicados - sinContacto - sensibles - correoInst - telPlaceh - menores],
  ['', '', '', ''],
  ['SUBTOTAL EXCLUIR', '', '', nExcluir],
  ['', '', '', ''],
  ['— Citas vencidas sin verificar (REVISAR, no excluir aún)', -vencidas, '', ''],
  ['  Motivo: no sabemos si la cita se efectuó. Opciones:', '', '', ''],
  ['  A) Excluir y reportar al hospital para verificación manual', '', '', ''],
  ['  B) Contactar con mensaje diferente ("¿Su cita de [fecha] se realizó?")', '', '', ''],
  ['  C) Solicitar actualización de BD al hospital antes del piloto', '', '', ''],
  ['', '', '', ''],
  ['TOTAL INCLUIR (automático, sin decisión de citas)', nIncluir, '', ''],
  ['TOTAL REVISAR (incluye citas vencidas)', nRevisar, '', ''],
  ['SI se excluyen las citas vencidas también:', nIncluir, '', ''],
  ['SI se incluyen con mensaje especial:', nIncluir + nRevisar, '', ''],
]
const wsEmbudo = XLSX.utils.aoa_to_sheet(embudo)
wsEmbudo['!cols'] = [{ wch: 5 }, { wch: 55 }, { wch: 22 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wbOut, wsEmbudo, 'EMBUDO')

// ── HOJA 4: EXCLUIR ───────────────────────────────────────────────────────────
const excluirRows = siOut.filter(r => r[idxEstado] === 'EXCLUIR')
const excluirCols = [1, 0, 13, 14, 15, 16, 8, 42, idxMotivo, idxEstado, idxCanal]
const excluirHdr  = ['ID_UTLE','Eje','Cédula','Nombre','Apellido1','Apellido2',
  'Especialidad','Selección','QA_MOTIVOS_EXCLUSION','QA_ESTADO_PILOTO','QA_CANAL_SUGERIDO']
const wsExcluir   = XLSX.utils.aoa_to_sheet([
  excluirHdr,
  ...excluirRows.map(r => excluirCols.map(c => r[c]))
])
wsExcluir['!cols'] = excluirHdr.map((h,i) => ({ wch: i === 8 ? 50 : 18 }))
XLSX.utils.book_append_sheet(wbOut, wsExcluir, 'EXCLUIR')

// ── HOJA 5: REVISAR ───────────────────────────────────────────────────────────
const revisarRows = siOut.filter(r => r[idxEstado] === 'REVISAR')
const revisarCols = [1, 0, 13, 14, 15, 16, 8,
  qBase + qaHeaders.indexOf('QA_CITA_ESTADO'),
  qBase + qaHeaders.indexOf('QA_CITA_FECHA_PARSED'),
  qBase + qaHeaders.indexOf('QA_CITA_DIAS_VENCIDA'),
  idxMotivo, idxCanal]
const revisarHdr  = ['ID_UTLE','Eje','Cédula','Nombre','Apellido1','Apellido2',
  'Especialidad','QA_CITA_ESTADO','QA_CITA_FECHA','QA_DIAS_VENCIDA',
  'QA_MOTIVOS','QA_CANAL_SUGERIDO']
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
console.log('\n' + '═'.repeat(55))
console.log('  RESUMEN EJECUTIVO')
console.log('═'.repeat(55))
console.log(`  Universo SI:       ${siOut.length.toLocaleString().padStart(8)}  (100%)`)
console.log(`  ✅ INCLUIR:        ${nIncluir.toLocaleString().padStart(8)}  (${(nIncluir/siOut.length*100).toFixed(1)}%)`)
console.log(`  🟡 REVISAR:        ${nRevisar.toLocaleString().padStart(8)}  (${(nRevisar/siOut.length*100).toFixed(1)}%)`)
console.log(`  ❌ EXCLUIR:        ${nExcluir.toLocaleString().padStart(8)}  (${(nExcluir/siOut.length*100).toFixed(1)}%)`)
console.log('─'.repeat(55))
console.log('  Motivos exclusión (top):')
Object.entries(statsExcluir).sort((a,b)=>b[1]-a[1]).slice(0,6)
  .forEach(([m,n]) => console.log(`    ${m.padEnd(35)} ${n.toLocaleString()}`))
console.log('─'.repeat(55))
console.log('  Motivos revisión (top):')
Object.entries(statsRevisar).sort((a,b)=>b[1]-a[1]).slice(0,4)
  .forEach(([m,n]) => console.log(`    ${m.padEnd(35)} ${n.toLocaleString()}`))
console.log('═'.repeat(55))
console.log(`\n✅ Archivo: scripts/output/BD_BOT_Borrador_QA.xlsx`)
console.log('   Hojas: BD_QA | RESUMEN | EMBUDO | EXCLUIR | REVISAR\n')

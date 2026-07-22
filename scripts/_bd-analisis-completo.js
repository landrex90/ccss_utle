#!/usr/bin/env node
/**
 * Análisis completo de calidad — Base de datos BOT Borrador
 * Genera reporte Excel con múltiples hojas
 *
 * Uso: node scripts/_bd-analisis-completo.js
 * Salida: scripts/output/BD_Analisis_Completo.xlsx
 */

const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

const EXCEL_PATH = path.join(
  __dirname,
  '../Carpeta Correos Socialización, Infografia UTLE y logo CLEO/Base de datos BOT Borrador.xlsx'
)
const OUT_DIR  = path.join(__dirname, 'output')
const OUT_FILE = path.join(OUT_DIR, 'BD_Analisis_Completo.xlsx')

// ── Columnas ───────────────────────────────────────────────────────────────────
const COL = {
  eje: 0, id_utle: 1, up: 2, centro: 3, region: 4, fecha_registro: 5,
  anio: 6, servicio: 7, especialidad: 8, plazo: 9, estado_cita: 10,
  modalidad: 11, tipo_id: 12, num_id: 13, nombre: 14, ap1: 15, ap2: 16,
  fecha_nac: 17, edad: 18, tel_arca1: 19, tel_arca2: 20, tel_siac: 21,
  correo_siac: 22, correo_arca: 23, procedimiento: 24, categoria: 25,
  subcategoria: 26, proc_concat: 27, tipo_consulta: 28,
  fecha_atencion: 29, hora_cupo: 30, lateralidad: 37, sexo: 38, seleccion: 42,
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const clean = v => { const s = String(v ?? '').trim(); return (s==='-'||s==='0'||s==='') ? null : s }
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v??'').trim())
const isDash  = v => String(v??'').trim() === '-' || String(v??'').trim() === ''

function extractPhone(arca1, siac) {
  const a1 = String(arca1 ?? '').replace(/\D/g, '')
  if (/^\d{8}$/.test(a1)) return a1
  for (const p of String(siac ?? '').split(/[/,;]/)) {
    const d = p.replace(/\D/g, '').trim()
    if (/^\d{8}$/.test(d)) return d
  }
  return null
}

function bestEmail(siac, arca) {
  if (isEmail(siac)) return String(siac).trim().toLowerCase()
  if (isEmail(arca)) return String(arca).trim().toLowerCase()
  return null
}

function freq(arr) {
  const m = {}
  arr.forEach(v => { const k = String(v??'(vacío)'); m[k] = (m[k]||0)+1 })
  return Object.entries(m).sort((a,b)=>b[1]-a[1])
}

function pct(n, total) { return total ? Math.round(n/total*100*10)/10 : 0 }

// ── Leer y preparar ────────────────────────────────────────────────────────────
console.log('📂 Leyendo BD Borrador...')
const wb   = XLSX.readFile(EXCEL_PATH)
const ws   = wb.Sheets['BD']
const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
const rows = data.slice(1)
const si   = rows.filter(r => r[COL.seleccion] === 'SI')
const no   = rows.filter(r => r[COL.seleccion] !== 'SI')

console.log(`   Total: ${rows.length.toLocaleString()} | SI: ${si.length.toLocaleString()} | NO: ${no.length.toLocaleString()}`)

// Enriquecer cada registro SI con campos calculados
const pacientes = si.map((r, i) => {
  const correo    = bestEmail(r[COL.correo_siac], r[COL.correo_arca])
  const telefono  = extractPhone(r[COL.tel_arca1], r[COL.tel_siac])
  const numId     = String(r[COL.num_id] ?? '').replace(/\D/g, '')
  const u4        = numId.length >= 4 ? numId.slice(-4) : null
  const nombre    = [r[COL.nombre], r[COL.ap1], r[COL.ap2]].map(s=>String(s??'').trim()).filter(Boolean).join(' ')
  const eje       = String(r[COL.eje]??'').trim()
  const edad      = parseInt(r[COL.edad]) || null
  const correoSiac = isEmail(r[COL.correo_siac]) ? String(r[COL.correo_siac]).trim().toLowerCase() : null
  const correoArca = isEmail(r[COL.correo_arca]) ? String(r[COL.correo_arca]).trim().toLowerCase() : null

  return {
    _idx:         i,
    id_utle:      clean(r[COL.id_utle]),
    nombre,
    eje,
    centro:       clean(r[COL.centro]),
    region:       clean(r[COL.region]),
    especialidad: clean(r[COL.especialidad]),
    servicio:     clean(r[COL.servicio]),
    tipo_id:      clean(r[COL.tipo_id]),
    num_id:       r[COL.num_id] ?? null,
    num_id_limpio: numId || null,
    ultimos_4:    u4,
    edad,
    sexo:         clean(r[COL.sexo]),
    modalidad:    clean(r[COL.modalidad]),
    correo,
    correo_siac:  correoSiac,
    correo_arca:  correoArca,
    correo_ambos: (correoSiac && correoArca && correoSiac !== correoArca),
    telefono,
    tel_arca1_raw: String(r[COL.tel_arca1]??'').trim(),
    tel_siac_raw:  String(r[COL.tel_siac]??'').trim(),
    lateralidad:   clean(r[COL.lateralidad]),
    fecha_atencion: clean(r[COL.fecha_atencion]),
    hora_cupo:     clean(r[COL.hora_cupo]),
    tipo_consulta: clean(r[COL.tipo_consulta]),
    proc_concat:   clean(r[COL.proc_concat]),
    // flags
    tiene_correo:  !!correo,
    tiene_telefono: !!telefono,
    tiene_ambos:   !!correo && !!telefono,
    sin_contacto:  !correo && !telefono,
    sin_ultimos4:  !u4,
    es_menor:      edad !== null && edad < 18,
    fecha_cita_missing: (eje === 'Consulta Externa' || eje === 'Procedimientos Ambulatorios') && !clean(r[COL.fecha_atencion]),
  }
})

console.log('   Datos enriquecidos ✅')

// ── ANÁLISIS DE DUPLICADOS ─────────────────────────────────────────────────────
console.log('🔍 Analizando duplicados...')

// 1. Duplicados por ID_UTLE
const byIdUtle = {}
pacientes.forEach(p => { const k = String(p.id_utle??''); (byIdUtle[k]=byIdUtle[k]||[]).push(p) })
const dupIdUtle = Object.entries(byIdUtle).filter(([k,v]) => v.length > 1 && k !== 'null')

// 2. Duplicados por Número de Identificación (mismo paciente distintos ejes o filas)
const byNumId = {}
pacientes.forEach(p => { const k = p.num_id_limpio; if(k) (byNumId[k]=byNumId[k]||[]).push(p) })
const dupNumId = Object.entries(byNumId).filter(([,v]) => v.length > 1)
const dupMismoEje = dupNumId.filter(([,v]) => { const ejes = [...new Set(v.map(p=>p.eje))]; return ejes.length < v.length })

// 3. Duplicados por correo
const byCorreo = {}
pacientes.filter(p=>p.correo).forEach(p => { (byCorreo[p.correo]=byCorreo[p.correo]||[]).push(p) })
const dupCorreo = Object.entries(byCorreo).filter(([,v]) => v.length > 1)

// 4. Duplicados por teléfono
const byTel = {}
pacientes.filter(p=>p.telefono).forEach(p => { (byTel[p.telefono]=byTel[p.telefono]||[]).push(p) })
const dupTel = Object.entries(byTel).filter(([,v]) => v.length > 1)

// 5. Mismo paciente en múltiples ejes (cédula repetida, ejes distintos)
const dupMultiEje = dupNumId.filter(([,v]) => { const ejes=[...new Set(v.map(p=>p.eje))]; return ejes.length > 1 })

console.log(`   Dup ID_UTLE: ${dupIdUtle.length} | Dup cédula: ${dupNumId.length} | Multi-eje: ${dupMultiEje.length} | Dup correo: ${dupCorreo.length} | Dup teléfono: ${dupTel.length}`)

// ── CONSTRUIR EXCEL ────────────────────────────────────────────────────────────
console.log('📊 Construyendo reporte Excel...')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)
const wb_out = XLSX.utils.book_new()

function addSheet(name, aoaData, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(aoaData)
  if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb_out, ws, name)
}

// ── HOJA 1: Resumen General ────────────────────────────────────────────────────
const totalSI = pacientes.length
const conCorreo    = pacientes.filter(p=>p.tiene_correo).length
const conTel       = pacientes.filter(p=>p.tiene_telefono).length
const conAmbos     = pacientes.filter(p=>p.tiene_ambos).length
const sinContacto  = pacientes.filter(p=>p.sin_contacto).length
const sinU4        = pacientes.filter(p=>p.sin_ultimos4).length
const menores      = pacientes.filter(p=>p.es_menor).length
const sinFechaCita = pacientes.filter(p=>p.fecha_cita_missing).length

const resumenData = [
  ['REPORTE DE CALIDAD — BASE DE DATOS BOT BORRADOR', '', ''],
  ['', '', ''],
  ['UNIVERSO DE TRABAJO', '', ''],
  ['Total registros en BD', rows.length, ''],
  ['Selección NO (excluidos HCG-AES)', no.length, `${pct(no.length, rows.length)}%`],
  ['Selección SI (universo campaña)', si.length, `${pct(si.length, rows.length)}%`],
  ['', '', ''],
  ['DISTRIBUCIÓN POR EJE (solo SI)', '', ''],
  ...freq(pacientes.map(p=>p.eje)).map(([k,v]) => [k, v, `${pct(v,totalSI)}%`]),
  ['', '', ''],
  ['ALCANCE POR CANAL', '', ''],
  ['Con correo válido', conCorreo, `${pct(conCorreo,totalSI)}%`],
  ['Con teléfono válido', conTel, `${pct(conTel,totalSI)}%`],
  ['Con correo Y teléfono', conAmbos, `${pct(conAmbos,totalSI)}%`],
  ['Solo correo (sin teléfono)', conCorreo-conAmbos, `${pct(conCorreo-conAmbos,totalSI)}%`],
  ['Solo teléfono (sin correo)', conTel-conAmbos, `${pct(conTel-conAmbos,totalSI)}%`],
  ['SIN CORREO NI TELÉFONO', sinContacto, `${pct(sinContacto,totalSI)}%`],
  ['', '', ''],
  ['PROBLEMAS IDENTIFICADOS', '', ''],
  ['Cédulas duplicadas (mismo paciente, varias filas)', dupNumId.length, dupNumId.length > 0 ? '⚠️ REVISAR' : '✅ OK'],
  ['Paciente en múltiples ejes (misma cédula)', dupMultiEje.length, dupMultiEje.length > 0 ? '⚠️ REVISAR' : '✅ OK'],
  ['ID_UTLE duplicados', dupIdUtle.length, dupIdUtle.length > 0 ? '⚠️ REVISAR' : '✅ OK'],
  ['Correos compartidos (1 correo → N pacientes)', dupCorreo.length, dupCorreo.length > 0 ? '⚠️ ATENCIÓN' : '✅ OK'],
  ['Teléfonos compartidos (1 tel → N pacientes)', dupTel.length, dupTel.length > 0 ? '⚠️ ATENCIÓN' : '✅ OK'],
  ['Sin ultimos_4_asegurado (no importables)', sinU4, sinU4 > 0 ? '❌ EXCLUIR' : '✅ OK'],
  ['Pacientes menores de edad', menores, menores > 0 ? '⚠️ REVISAR' : '✅ OK'],
  ['Consulta/Proced. sin fecha de cita', sinFechaCita, sinFechaCita > 0 ? '⚠️ INCOMPLETO' : '✅ OK'],
]
addSheet('1. Resumen General', resumenData, [45, 15, 15])

// ── HOJA 2: Calidad de Correo ──────────────────────────────────────────────────
const correoSiacValid = pacientes.filter(p=>p.correo_siac).length
const correoArcaValid = pacientes.filter(p=>p.correo_arca).length
const ambosCorreos    = pacientes.filter(p=>p.correo_siac && p.correo_arca).length
const correosDifer    = pacientes.filter(p=>p.correo_ambos).length
const dominios = freq(pacientes.filter(p=>p.correo).map(p=>p.correo.split('@')[1]))

const correoData = [
  ['ANÁLISIS DE CORREO ELECTRÓNICO', '', '', ''],
  ['', '', '', ''],
  ['FUENTES DISPONIBLES', 'Cantidad', '% del total SI', ''],
  ['Con correo SIAC válido', correoSiacValid, `${pct(correoSiacValid,totalSI)}%`, ''],
  ['Con correo ARCA válido', correoArcaValid, `${pct(correoArcaValid,totalSI)}%`, ''],
  ['Con ambas fuentes', ambosCorreos, `${pct(ambosCorreos,totalSI)}%`, ''],
  ['Ambas fuentes con correos DISTINTOS', correosDifer, `${pct(correosDifer,totalSI)}%`, '⚠️ SIAC tiene prioridad'],
  ['Con al menos un correo válido', conCorreo, `${pct(conCorreo,totalSI)}%`, ''],
  ['SIN ningún correo válido', totalSI-conCorreo, `${pct(totalSI-conCorreo,totalSI)}%`, '→ WA/Voicebot directo'],
  ['', '', '', ''],
  ['DISTRIBUCIÓN DE CORREOS POR EJE', '', '', ''],
  ['Eje', 'Con correo', '% del eje', 'Sin correo'],
  ...['Cirugía','Consulta Externa','Procedimientos Ambulatorios'].map(eje => {
    const sub = pacientes.filter(p=>p.eje===eje)
    const con = sub.filter(p=>p.tiene_correo).length
    return [eje, con, `${pct(con,sub.length)}%`, sub.length-con]
  }),
  ['', '', '', ''],
  ['CORREOS DUPLICADOS (1 correo → varios pacientes)', '', '', ''],
  ['Total correos compartidos', dupCorreo.length, '', ''],
  ['Pacientes afectados', dupCorreo.reduce((s,[,v])=>s+v.length,0), '', ''],
  ['', '', '', ''],
  ['TOP 20 DOMINIOS', 'Cantidad', '% de con-correo', ''],
  ...dominios.slice(0,20).map(([k,v])=>[k, v, `${pct(v,conCorreo)}%`, '']),
]
addSheet('2. Calidad Correo', correoData, [40, 15, 15, 30])

// ── HOJA 3: Calidad de Teléfono ───────────────────────────────────────────────
const telArca1Ok  = pacientes.filter(p=>{ const a=/^\d{8}$/.test(String(p.tel_arca1_raw||'').replace(/\D/g,'')); return a }).length
const telSiacParseable = pacientes.filter(p=>{ return !(/^\d{8}$/.test(String(p.tel_arca1_raw||'').replace(/\D/g,''))) && p.telefono }).length

const telData = [
  ['ANÁLISIS DE TELÉFONOS', '', '', ''],
  ['', '', '', ''],
  ['CALIDAD ARCA1 (campo principal)', 'Cantidad', '% del total SI', ''],
  ['ARCA1 válido (exactamente 8 dígitos)', telArca1Ok, `${pct(telArca1Ok,totalSI)}%`, ''],
  ['ARCA1 con guión "-" o vacío', totalSI-telArca1Ok, `${pct(totalSI-telArca1Ok,totalSI)}%`, '→ usar SIAC como fallback'],
  ['', '', '', ''],
  ['RESULTADO CON FALLBACK A SIAC', '', '', ''],
  ['Con teléfono extraído (ARCA1 + SIAC)', conTel, `${pct(conTel,totalSI)}%`, ''],
  ['ARCA1 fue suficiente', telArca1Ok, `${pct(telArca1Ok,conTel)}% de los con-tel`, ''],
  ['Recuperados por SIAC', telSiacParseable, `${pct(telSiacParseable,conTel)}% de los con-tel`, ''],
  ['Sin ningún teléfono', totalSI-conTel, `${pct(totalSI-conTel,totalSI)}%`, ''],
  ['', '', '', ''],
  ['DISTRIBUCIÓN POR EJE', '', '', ''],
  ['Eje', 'Con teléfono', '% del eje', 'Sin teléfono'],
  ...['Cirugía','Consulta Externa','Procedimientos Ambulatorios'].map(eje => {
    const sub = pacientes.filter(p=>p.eje===eje)
    const con = sub.filter(p=>p.tiene_telefono).length
    return [eje, con, `${pct(con,sub.length)}%`, sub.length-con]
  }),
  ['', '', '', ''],
  ['TELÉFONOS DUPLICADOS (1 número → varios pacientes)', '', '', ''],
  ['Números compartidos', dupTel.length, '', ''],
  ['Pacientes afectados', dupTel.reduce((s,[,v])=>s+v.length,0), '', '⚠️ Un WA llegaría a N pacientes'],
]
addSheet('3. Calidad Teléfono', telData, [45, 15, 20, 35])

// ── HOJA 4: Duplicados por Cédula ─────────────────────────────────────────────
const dupCedulaRows = [
  ['DUPLICADOS POR NÚMERO DE IDENTIFICACIÓN', '', '', '', '', ''],
  ['Total cédulas duplicadas', dupNumId.length, '', '', '', ''],
  ['Pacientes en múltiples ejes (misma cédula, ejes distintos)', dupMultiEje.length, '', '', '', ''],
  ['', '', '', '', '', ''],
  ['Identificación', 'Veces', 'Ejes', 'Nombre', 'Correo', 'Nota'],
]
dupNumId.slice(0, 500).forEach(([id, ps]) => {
  const ejes = [...new Set(ps.map(p=>p.eje))].join(' / ')
  const nota = ps.length > 1 && new Set(ps.map(p=>p.eje)).size > 1 ? '⚠️ MULTI-EJE' : '⚠️ DUPLICADO'
  dupCedulaRows.push([id, ps.length, ejes, ps[0].nombre, ps[0].correo||'(sin correo)', nota])
})
addSheet('4. Dup Cédula', dupCedulaRows, [20, 8, 40, 35, 30, 15])

// ── HOJA 5: Duplicados por Correo ─────────────────────────────────────────────
const dupCorreoRows = [
  ['CORREOS COMPARTIDOS ENTRE PACIENTES', '', '', '', ''],
  ['Total correos compartidos', dupCorreo.length, '', '', ''],
  ['Pacientes afectados', dupCorreo.reduce((s,[,v])=>s+v.length,0), '', '', ''],
  ['Impacto: el mismo correo recibirá N encuestas distintas', '', '', '', ''],
  ['', '', '', '', ''],
  ['Correo', 'N pacientes', 'Ejes', 'Nombres', 'IDs'],
]
dupCorreo.slice(0, 500).forEach(([email, ps]) => {
  const ejes = [...new Set(ps.map(p=>p.eje))].join(' / ')
  const nombres = ps.map(p=>p.nombre).join(' | ')
  const ids = ps.map(p=>p.id_utle).join(' / ')
  dupCorreoRows.push([email, ps.length, ejes, nombres.slice(0,80), ids])
})
addSheet('5. Dup Correo', dupCorreoRows, [35, 10, 35, 55, 25])

// ── HOJA 6: Duplicados por Teléfono ───────────────────────────────────────────
const dupTelRows = [
  ['TELÉFONOS COMPARTIDOS ENTRE PACIENTES', '', '', '', ''],
  ['Total teléfonos compartidos', dupTel.length, '', '', ''],
  ['Pacientes afectados', dupTel.reduce((s,[,v])=>s+v.length,0), '', '', ''],
  ['Impacto: un WA con N encuestas llegaría al mismo número', '', '', '', ''],
  ['', '', '', '', ''],
  ['Teléfono', 'N pacientes', 'Ejes', 'Nombres', 'IDs'],
]
dupTel.slice(0, 500).forEach(([tel, ps]) => {
  const ejes = [...new Set(ps.map(p=>p.eje))].join(' / ')
  const nombres = ps.map(p=>p.nombre).join(' | ')
  const ids = ps.map(p=>p.id_utle).join(' / ')
  dupTelRows.push([tel, ps.length, ejes, nombres.slice(0,80), ids])
})
addSheet('6. Dup Teléfono', dupTelRows, [15, 10, 35, 55, 25])

// ── HOJA 7: Sin contacto (ni correo ni teléfono) ──────────────────────────────
const sinContactoPacientes = pacientes.filter(p=>p.sin_contacto)
const sinContactoRows = [
  ['PACIENTES SIN NINGÚN MEDIO DE CONTACTO', '', '', '', '', ''],
  ['Total', sinContactoPacientes.length, '', '', '', ''],
  ['Estos pacientes no pueden ser contactados por ningún canal digital', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['ID_UTLE', 'Nombre', 'Eje', 'Centro', 'Especialidad', 'Tipo ID'],
  ...sinContactoPacientes.map(p => [p.id_utle, p.nombre, p.eje, p.centro, p.especialidad, p.tipo_id]),
]
addSheet('7. Sin Contacto', sinContactoRows, [12, 35, 22, 35, 25, 22])

// ── HOJA 8: Menores de edad ────────────────────────────────────────────────────
const menoresPacientes = pacientes.filter(p=>p.es_menor)
const menoresRows = [
  ['PACIENTES MENORES DE EDAD', '', '', '', '', ''],
  ['Total', menoresPacientes.length, '', '', '', ''],
  ['Nota: verificar si pueden firmar el consentimiento o requiere tutor', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['ID_UTLE', 'Nombre', 'Edad', 'Eje', 'Centro', 'Correo'],
  ...menoresPacientes.map(p => [p.id_utle, p.nombre, p.edad, p.eje, p.centro, p.correo||'(sin correo)']),
]
addSheet('8. Menores de Edad', menoresRows, [12, 35, 8, 22, 35, 30])

// ── HOJA 9: Fecha de cita faltante ────────────────────────────────────────────
const sinFecha = pacientes.filter(p=>p.fecha_cita_missing)
const sinFechaRows = [
  ['CONSULTA EXTERNA / PROCEDIMIENTOS SIN FECHA DE CITA', '', '', '', ''],
  ['Total', sinFecha.length, '', '', ''],
  ['Impacto: el formulario mostrará fecha vacía a estos pacientes', '', '', '', ''],
  ['', '', '', '', ''],
  ['ID_UTLE', 'Nombre', 'Eje', 'Centro', 'Especialidad'],
  ...sinFecha.map(p => [p.id_utle, p.nombre, p.eje, p.centro, p.especialidad]),
]
addSheet('9. Sin Fecha Cita', sinFechaRows, [12, 35, 25, 35, 25])

// ── HOJA 10: Distribución por Centro Médico ───────────────────────────────────
const centroData = [
  ['DISTRIBUCIÓN POR CENTRO MÉDICO (Selección SI)', '', '', '', ''],
  ['', '', '', '', ''],
  ['Centro Médico', 'Total', '% del total', 'Con correo', '% correo del centro'],
]
const byCentro = {}
pacientes.forEach(p => { const k = p.centro||'(sin centro)'; (byCentro[k]=byCentro[k]||[]).push(p) })
Object.entries(byCentro).sort((a,b)=>b[1].length-a[1].length).forEach(([k,ps]) => {
  const con = ps.filter(p=>p.tiene_correo).length
  centroData.push([k, ps.length, `${pct(ps.length,totalSI)}%`, con, `${pct(con,ps.length)}%`])
})
addSheet('10. Por Centro', centroData, [45, 10, 12, 12, 18])

// ── HOJA 11: Distribución por Especialidad ────────────────────────────────────
const espData = [
  ['DISTRIBUCIÓN POR ESPECIALIDAD (Selección SI)', '', '', ''],
  ['', '', '', ''],
  ['Especialidad', 'Total', '% del total', 'Eje principal'],
]
const byEsp = {}
pacientes.forEach(p => { const k = p.especialidad||'(sin especialidad)'; (byEsp[k]=byEsp[k]||[]).push(p) })
Object.entries(byEsp).sort((a,b)=>b[1].length-a[1].length).forEach(([k,ps]) => {
  const ejeFreq = freq(ps.map(p=>p.eje))
  espData.push([k, ps.length, `${pct(ps.length,totalSI)}%`, ejeFreq[0]?.[0]||''])
})
addSheet('11. Por Especialidad', espData, [40, 10, 12, 25])

// ── HOJA 12: Resumen por eje con todos los indicadores ────────────────────────
const ejeDetalleData = [
  ['RESUMEN DETALLADO POR EJE', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['Indicador', 'TOTAL SI', 'Cirugía', 'Consulta Externa', 'Procedimientos', '', '', ''],
]
const ejes = { 'Cirugía': pacientes.filter(p=>p.eje==='Cirugía'), 'Consulta Externa': pacientes.filter(p=>p.eje==='Consulta Externa'), 'Procedimientos Ambulatorios': pacientes.filter(p=>p.eje==='Procedimientos Ambulatorios') }
const indicadores = [
  ['Total pacientes', ps=>ps.length],
  ['Con correo', ps=>ps.filter(p=>p.tiene_correo).length],
  ['% con correo', ps=>`${pct(ps.filter(p=>p.tiene_correo).length, ps.length)}%`],
  ['Con teléfono', ps=>ps.filter(p=>p.tiene_telefono).length],
  ['% con teléfono', ps=>`${pct(ps.filter(p=>p.tiene_telefono).length, ps.length)}%`],
  ['Con ambos', ps=>ps.filter(p=>p.tiene_ambos).length],
  ['Sin contacto', ps=>ps.filter(p=>p.sin_contacto).length],
  ['Menores de edad', ps=>ps.filter(p=>p.es_menor).length],
  ['Con fecha cita', ps=>ps.filter(p=>p.fecha_atencion).length],
  ['Sin fecha cita', ps=>ps.filter(p=>p.fecha_cita_missing).length],
  ['Cédula duplicada', ps=>{
    const ids = ps.map(p=>p.num_id_limpio).filter(Boolean)
    const set = new Set(ids)
    return ids.length - set.size
  }],
]
indicadores.forEach(([label, fn]) => {
  ejeDetalleData.push([
    label,
    fn(pacientes),
    fn(ejes['Cirugía']),
    fn(ejes['Consulta Externa']),
    fn(ejes['Procedimientos Ambulatorios']),
    '', '', ''
  ])
})
addSheet('12. Detalle por Eje', ejeDetalleData, [30, 12, 12, 18, 16])

// ── Escribir archivo ───────────────────────────────────────────────────────────
XLSX.writeFile(wb_out, OUT_FILE)
console.log(`\n✅ Reporte generado: scripts/output/BD_Analisis_Completo.xlsx`)
console.log(`   12 hojas con análisis completo de calidad, duplicados y distribución.\n`)

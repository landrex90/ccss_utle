#!/usr/bin/env node
/**
 * _ce02-import.js
 *
 * Importa los 32,000 registros INCLUIR de BD_HCG_CE_PROCESADA.xlsx
 * a Supabase como campaña ENCUESTA-CE-02, con envío escalonado:
 *   - dia_envio = 1 → primer registro por paciente (mayoría: 26,842)
 *   - dia_envio = 2 → segundo registro (pacientes con 2+ registros)
 *   - dia_envio = 3..7 → registros adicionales
 *
 * Uso:
 *   node --env-file=.env.local scripts/_ce02-import.js [--dry-run]
 *
 * Con --dry-run: muestra estadísticas sin insertar nada en Supabase.
 *
 * Prerrequisito: Migración 019 aplicada en Supabase.
 */

const XLSX             = require('xlsx')
const path             = require('path')
const crypto           = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

const FILE_PATH  = path.join(__dirname, 'output', 'BD_HCG_CE_PROCESADA.xlsx')
const DRY_RUN    = process.argv.includes('--dry-run')
const BATCH_SIZE = 200
const CAMPANA_ID = 'ENCUESTA-CE-02'
const TIPO       = 'consulta'

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(v) { return String(v ?? '').trim() }

function soloDigitos(v) { return clean(v).replace(/[^0-9]/g, '') }

function parseFechaTexto(v) {
  if (!v) return null
  if (typeof v === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(v)
      return new Date(Date.UTC(d.y, d.m - 1, d.d))
    } catch { return null }
  }
  const s = clean(v)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function formatDate(d) {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📥 CE-02 IMPORT — Cargando registros INCLUIR desde Excel')
  console.log(`   Modo: ${DRY_RUN ? 'DRY RUN (no inserta en Supabase)' : 'PRODUCCIÓN'}\n`)

  // ── 1. Leer Excel procesado ────────────────────────────────────────────────
  let wb
  try {
    wb = XLSX.readFile(FILE_PATH)
  } catch (e) {
    console.error('❌ No se pudo leer el archivo:', e.message)
    console.error('   Asegúrese de que scripts/output/BD_HCG_CE_PROCESADA.xlsx existe.')
    process.exit(1)
  }

  const sheet = wb.Sheets['procesada'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  console.log(`   Total filas en Excel: ${rows.length}`)

  // Detectar columnas por nombre
  const keys = Object.keys(rows[0] ?? {})
  const colId      = keys.find(k => k.toUpperCase().includes('ID_UTLE'))                                  ?? 'ID_UTLE (ID en ARCA o cupo en siac)'
  const colCedula  = keys.find(k => k.toLowerCase().includes('numero') && k.toLowerCase().includes('identificacion')) ?? 'numeroIdentificacion'
  const colEsp     = keys.find(k => k.toLowerCase().includes('especialidad'))                              ?? 'Especialidad'
  const colCentro  = keys.find(k => k.toLowerCase().includes('centro'))                                   ?? 'Centro_Médico'
  const colServ    = keys.find(k => k.toLowerCase() === 'servicio')                                       ?? 'Servicio'
  const colTConsul = keys.find(k => k.toLowerCase().includes('tipo') && k.toLowerCase().includes('consul')) ?? 'Tipo Consulta (Enfasis)'
  const colFCita   = keys.find(k => k.toLowerCase().includes('fecha') && k.toLowerCase().includes('aten')) ?? 'Fecha Atención'
  const colHCita   = keys.find(k => k.toLowerCase().includes('hora') || k.toLowerCase().includes('cupo')) ?? 'HORA CUPO'
  const colEdad    = keys.find(k => k.toLowerCase() === 'edad')                                            ?? 'Edad'
  const colAnio    = keys.find(k => k.toLowerCase().includes('anio'))                                     ?? 'anio_de_registro'
  const colSexo    = keys.find(k => k.toLowerCase() === 'sexo')                                            ?? 'Sexo'

  console.log(`   Columnas detectadas:`)
  console.log(`     ID_UTLE  : "${colId}"`)
  console.log(`     Cédula   : "${colCedula}"`)
  console.log(`     Esp.     : "${colEsp}"`)
  console.log(`     F. Cita  : "${colFCita}"`)

  // ── 2. Filtrar solo INCLUIR ────────────────────────────────────────────────
  const incluir = rows.filter(r => r['COCO_ESTADO'] === 'INCLUIR')
  console.log(`\n   Registros INCLUIR   : ${incluir.length}`)

  if (incluir.length === 0) {
    console.error('❌ No se encontraron registros con COCO_ESTADO=INCLUIR. Revise el Excel.')
    process.exit(1)
  }

  // ── 3. Asignar dia_envio por cédula ───────────────────────────────────────
  // Agrupa por cédula, ordena dentro del grupo por fecha_cita ASC (cita más pronto primero)
  const porCedula = new Map()
  for (const r of incluir) {
    const ced = soloDigitos(r[colCedula]) || clean(r[colCedula])
    if (!porCedula.has(ced)) porCedula.set(ced, [])
    porCedula.get(ced).push(r)
  }

  // Ordenar cada grupo por fecha_cita ASC (más próxima primero)
  for (const [, grupo] of porCedula) {
    grupo.sort((a, b) => {
      const fa = parseFechaTexto(a[colFCita])
      const fb = parseFechaTexto(b[colFCita])
      if (fa && fb) return fa - fb
      if (fa) return -1
      if (fb) return  1
      return 0
    })
  }

  // Asignar dia_envio a cada registro
  const registrosConDia = []
  for (const [, grupo] of porCedula) {
    grupo.forEach((r, i) => registrosConDia.push({ row: r, dia: i + 1 }))
  }

  // Estadísticas de distribución
  const distDia = {}
  for (const { dia } of registrosConDia) distDia[dia] = (distDia[dia] ?? 0) + 1

  console.log('\n   Distribución por día de envío:')
  Object.entries(distDia).sort((a,b) => +a[0] - +b[0]).forEach(([d, n]) =>
    console.log(`     Día ${d}: ${n.toLocaleString()} correos`)
  )
  console.log(`     ─────────────────────`)
  console.log(`     Total: ${registrosConDia.length.toLocaleString()}`)

  // ── 4. Construir objetos para insertar ────────────────────────────────────
  const now     = new Date()
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) // +90 días

  const toInsert = registrosConDia.map(({ row: r, dia }) => {
    const cedRaw    = soloDigitos(r[colCedula]) || clean(r[colCedula])
    const ultimos4  = cedRaw.slice(-4) || '0000'
    const idRegistro = clean(r[colId])

    return {
      id_registro:         idRegistro,
      nombre_paciente:     clean(r['COCO_NOMBRE']) || 'PACIENTE',
      numero_asegurado:    clean(r[colCedula]) || cedRaw,
      cedula_raw:          cedRaw,
      correo:              clean(r['COCO_CORREO']) || null,
      telefono:            clean(r['COCO_TELEFONO']) || null,
      canal_orden:         clean(r['COCO_CANAL']) || 'correo',
      canal_actual:        'correo',
      especialidad:        clean(r[colEsp]) || null,
      centro_medico:       clean(r[colCentro]) || 'HCG',
      tipo_atencion:       TIPO,
      nombre_servicio:     clean(r[colServ]) || null,
      tipo_consulta:       clean(r[colTConsul]) || null,
      fecha_cita:          formatDate(parseFechaTexto(r[colFCita])),
      hora_cita:           clean(r[colHCita]) || null,
      edad:                parseFloat(clean(r[colEdad])) || null,
      anio_registro:       parseInt(clean(r[colAnio]), 10) || null,
      sexo:                clean(r[colSexo]) || null,
      ultimos_4_asegurado: ultimos4,
      token:               crypto.randomUUID(),
      link_expires_at:     expires.toISOString(),
      estado:              'PENDIENTE',
      warmup_estado:       'enviado',    // dominio ya calentado, va directo a campaña
      encuesta_campana_id: null,         // el script de envío lo asigna al mandar
      dia_envio:           dia,
    }
  })

  // ── 5. Validaciones básicas ────────────────────────────────────────────────
  const sinId     = toInsert.filter(r => !r.id_registro).length
  const sinCorreo = toInsert.filter(r => !r.correo).length
  const sinNombre = toInsert.filter(r => r.nombre_paciente === 'PACIENTE').length

  console.log('\n   Validación antes de insertar:')
  console.log(`     Sin id_registro : ${sinId}`)
  console.log(`     Sin correo      : ${sinCorreo}`)
  console.log(`     Sin nombre      : ${sinNombre}`)

  if (sinId > 0) {
    console.error('\n❌ Hay registros sin id_registro — revisar columna ID_UTLE en el Excel.')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — sin insertar. Muestra de primeros 3 registros:')
    toInsert.slice(0, 3).forEach((r, i) => {
      console.log(`\n  [${i+1}] id=${r.id_registro} | dia=${r.dia_envio} | correo=${r.correo} | ${r.nombre_paciente}`)
    })
    console.log()
    return
  }

  // ── 6. Insertar en Supabase por lotes ─────────────────────────────────────
  console.log(`\n📤 Insertando ${toInsert.length.toLocaleString()} registros en Supabase...`)
  console.log(`   Campaña: ${CAMPANA_ID} | Lote: ${BATCH_SIZE} filas | tipo_atencion: ${TIPO}`)

  let insertados = 0
  let errores    = 0

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const lote = toInsert.slice(i, i + BATCH_SIZE)

    const { error } = await sb
      .from('registros')
      .insert(lote)

    if (error) {
      console.error(`\n❌ Error en lote ${i}–${i + lote.length}: ${error.message}`)
      if (error.message.includes('dia_envio')) {
        console.error('   → Aplique primero la migración 019 en el SQL Editor de Supabase.')
        process.exit(1)
      }
      if (error.message.includes('duplicate key') || error.code === '23505') {
        console.warn(`   ⚠️  Algunos id_registro ya existen — omitidos (idempotente).`)
        errores += lote.length
      } else {
        errores += lote.length
      }
    } else {
      insertados += lote.length
    }

    process.stdout.write(`\r   Progreso: ${insertados + errores}/${toInsert.length}  (✅${insertados}  ❌${errores})`)
    await sleep(120)
  }

  console.log(`\n\n✅ Importación completa`)
  console.log(`   Insertados : ${insertados.toLocaleString()}`)
  console.log(`   Errores    : ${errores.toLocaleString()}`)
  console.log(`\n   Siguiente paso:`)
  console.log(`   node --env-file=.env.local scripts/_encuesta-send.js \\`)
  console.log(`        --campana ${CAMPANA_ID} --tipo ${TIPO} --dia 1 --dry-run`)
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

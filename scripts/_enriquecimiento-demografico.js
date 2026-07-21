/**
 * Enriquecimiento demográfico — migración 018
 *
 * Lee BD_BOT_Borrador_QA.xlsx y puebla las columnas demográficas en `registros`
 * usando DOBLE LLAVE: id_registro + cedula_raw.
 *
 * Por qué doble llave: 62 ID_UTLE en la fuente están asignados a dos pacientes
 * distintos. La cédula desambigua. Con doble llave NUNCA se pone el dato de un
 * paciente en el registro de otro.
 *
 * Columnas que puebla (requiere migración 018 aplicada en Supabase):
 *   edad, anio_registro, modalidad_asegurado, sexo, provincia,
 *   canton, grado_priorizacion, complejidad, plazo_espera, fecha_nacimiento
 *
 * Uso:
 *   node --env-file=.env.local scripts/_enriquecimiento-demografico.js
 *   node --env-file=.env.local scripts/_enriquecimiento-demografico.js --dry-run
 */

import XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DRY_RUN    = process.argv.includes('--dry-run')
const PAGE_SIZE  = 1000
const BATCH_UPD  = 50   // registros por UPDATE batch

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const QA_FILE      = path.join(__dirname, 'output', 'BD_BOT_Borrador_QA.xlsx')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Normaliza cédula: solo dígitos, igual que cedula_raw en BD
function normCedula(raw) {
  return String(raw ?? '').replace(/[^0-9]/g, '')
}

// Convierte número decimal de Excel (días desde 1900) a fecha ISO
function excelDateToISO(serial) {
  if (!serial || isNaN(serial)) return null
  try {
    const d = XLSX.SSF.parse_date_code(serial)
    if (!d) return null
    const mm = String(d.m).padStart(2,'0')
    const dd = String(d.d).padStart(2,'0')
    return `${d.y}-${mm}-${dd}`
  } catch { return null }
}

// ── 1. Cargar mapa desde fuente ───────────────────────────────────────────────
console.log('\n📖 Leyendo BD_BOT_Borrador_QA.xlsx…')
const wb   = XLSX.readFile(QA_FILE)
const ws   = wb.Sheets['BD_QA']
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`   Filas en fuente: ${rows.length.toLocaleString()}`)

// Construir mapa: "ID_UTLE|cedula_normalizada" → datos demográficos
const mapa = new Map()
let sinId = 0

for (const r of rows) {
  const idUtle  = String(r['ID_UTLE (ID en ARCA o cupo en siac)'] ?? '').trim()
  const cedula  = normCedula(r['numeroIdentificacion'])
  if (!idUtle) { sinId++; continue }

  const key = `${idUtle}|${cedula}`
  mapa.set(key, {
    edad:               typeof r['Edad'] === 'number' ? Math.round(r['Edad'] * 10) / 10 : null,
    anio_registro:      r['anio_de_registro'] ? parseInt(r['anio_de_registro']) : null,
    modalidad_asegurado: r['modalidad de aseguramiento'] || null,
    sexo:               r['Sexo'] || null,
    provincia:          r['Provincia'] || null,
    canton:             r['Canton'] || null,
    grado_priorizacion: r['GradoPriorizacion'] ? String(r['GradoPriorizacion']) : null,
    complejidad:        r['Complejidad'] || null,
    plazo_espera:       r['plazoEspera'] ? Math.round(Number(r['plazoEspera'])) : null,
    fecha_nacimiento:   excelDateToISO(r['Fecha de nacimiento']),
  })
}

console.log(`   Entradas en mapa: ${mapa.size.toLocaleString()} (${sinId} filas sin ID_UTLE ignoradas)`)

if (DRY_RUN) {
  console.log('\n🧪 DRY RUN — mostrando muestra del mapa:')
  let n = 0
  for (const [k, v] of mapa) {
    if (n++ >= 3) break
    console.log(' Clave:', k)
    console.log('  Edad:', v.edad, '| Año:', v.anio_registro, '| Modalidad:', v.modalidad_asegurado)
    console.log('  Sexo:', v.sexo, '| Provincia:', v.provincia, '| Cantón:', v.canton)
  }
}

// ── 2. Paginar registros y hacer match ───────────────────────────────────────
console.log('\n🔍 Cruzando con registros en Supabase…')

let from      = 0
let total     = 0
let matchados = 0
let sinMatch  = 0
let errores   = 0

while (true) {
  const { data, error } = await sb
    .from('registros')
    .select('id_registro, cedula_raw')
    .range(from, from + PAGE_SIZE - 1)

  if (error) {
    console.error('❌ Error leyendo registros:', error.message)
    break
  }
  if (!data || data.length === 0) break

  total += data.length

  // Separar en matched / sin match
  const updates = []

  for (const reg of data) {
    const key = `${reg.id_registro}|${normCedula(reg.cedula_raw)}`
    const demo = mapa.get(key)
    if (demo) {
      updates.push({ id_registro: reg.id_registro, ...demo })
      matchados++
    } else {
      sinMatch++
    }
  }

  // Actualizar en batches de BATCH_UPD
  if (!DRY_RUN && updates.length > 0) {
    for (let i = 0; i < updates.length; i += BATCH_UPD) {
      const batch = updates.slice(i, i + BATCH_UPD)
      for (const upd of batch) {
        const { id_registro, ...campos } = upd
        const { error: ue } = await sb
          .from('registros')
          .update(campos)
          .eq('id_registro', id_registro)
        if (ue) errores++
      }
      await sleep(150)
    }
  }

  process.stdout.write(`\r   Procesados: ${total.toLocaleString()} | Match: ${matchados.toLocaleString()} | Sin match: ${sinMatch.toLocaleString()}`)

  if (data.length < PAGE_SIZE) break
  from += PAGE_SIZE
}

// ── 3. Reporte final ──────────────────────────────────────────────────────────
console.log(`\n\n${'─'.repeat(55)}`)
console.log(`📊 RESULTADO DEL ENRIQUECIMIENTO`)
console.log(`   Total registros procesados : ${total.toLocaleString()}`)
console.log(`   ✅ Con match (datos cargados): ${matchados.toLocaleString()} (${(matchados/total*100).toFixed(1)}%)`)
console.log(`   ⚠️  Sin match en fuente      : ${sinMatch.toLocaleString()} (${(sinMatch/total*100).toFixed(1)}%)`)
if (errores > 0) console.log(`   ❌ Errores de UPDATE        : ${errores}`)
if (DRY_RUN) console.log('\n🧪 DRY RUN — no se actualizó nada en BD')
else         console.log('\n✅ Enriquecimiento completado')

#!/usr/bin/env node
/**
 * _proc-homologar.js
 *
 * Lee el CATALOGO de homologación y actualiza `procedimiento_homologado`
 * en registros que tengan `encuesta_campana_id` de tipo procedimiento.
 *
 * Uso:
 *   node --env-file=.env.local scripts/_proc-homologar.js --dry-run
 *   node --env-file=.env.local scripts/_proc-homologar.js --campana ENCUESTA-PROC-01
 */

const XLSX             = require('xlsx')
const path             = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? (process.argv[i + 1] ?? '') : ''
}

const DRY_RUN  = process.argv.includes('--dry-run')
const CAMPANA  = arg('--campana') || null   // ej: ENCUESTA-PROC-01
const BATCH    = 200
const PAGE     = 1000

const CATALOG_FILE = path.join(__dirname,
  '../Carpeta de analisis BD borrador/CATALOGO_PROPUESTA DE PROCEDIMIENTOS DIAGNOSTICOS.xlsx')

// ── 1. Cargar catálogo ───────────────────────────────────────────────────────
const wb  = XLSX.readFile(CATALOG_FILE)
const cat = XLSX.utils.sheet_to_json(wb.Sheets['CATALOGO'], { defval: '' })

// Mapa de lookup con tres niveles de fallback
// Nivel 1: nombre + categoría + subcategoría (exacto)
const mapExacto = new Map()
// Nivel 2: nombre + categoría
const mapCat    = new Map()
// Nivel 3: nombre solo (si entrada es única)
const mapNombre = new Map()

for (const r of cat) {
  const nombre = String(r.Procedimiento).trim()
  const categ  = String(r.Categoria).trim()
  const sub    = String(r.Subcategoria).trim()
  const prop   = String(r.Propuesta).trim()
  if (!nombre || !prop) continue

  mapExacto.set(`${nombre}|${categ}|${sub}`, prop)

  const keyCat = `${nombre}|${categ}`
  if (!mapCat.has(keyCat)) mapCat.set(keyCat, prop)

  if (!mapNombre.has(nombre)) {
    mapNombre.set(nombre, prop)
  } else {
    mapNombre.set(nombre, null)  // múltiples → ambiguo
  }
}

console.log(`📖 Catálogo cargado: ${cat.length} entradas`)

// ── 2. Parser del formato SIAC: NOMBRE(CATEGORIA)(SUBCATEGORIA) ──────────────
function parseSiac(raw) {
  if (!raw) return null
  const parts = raw.split('|')
  if (parts.length < 2) return null
  return {
    nombre: parts[0].trim(),
    cat:    (parts[1] ?? '').trim(),
    sub:    (parts[2] ?? '').trim(),
  }
}

function lookup(raw) {
  const p = parseSiac(raw)
  if (!p) return null

  // Nivel 1: exacto
  const k1 = `${p.nombre}|${p.cat}|${p.sub}`
  if (mapExacto.has(k1)) return mapExacto.get(k1)

  // Nivel 2: nombre + categoría (ignora subcategoría)
  const k2 = `${p.nombre}|${p.cat}`
  if (mapCat.has(k2)) return mapCat.get(k2)

  // Nivel 3: nombre solo si es único en catálogo
  const v3 = mapNombre.get(p.nombre)
  if (v3) return v3

  return null
}

// ── 3. Fetch registros ───────────────────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

async function fetchRegistros() {
  const rows = []
  let from = 0
  while (true) {
    let q = sb.from('registros')
      .select('id_registro, procedimiento')
      .not('procedimiento', 'is', null)
      .order('id_registro')
      .range(from, from + PAGE - 1)

    if (CAMPANA) q = q.eq('encuesta_campana_id', CAMPANA)

    const { data, error } = await q
    if (error) { console.error('❌', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    rows.push(...data)
    process.stdout.write(`\r   Cargados: ${rows.length}`)
    if (data.length < PAGE) break
    from += PAGE
  }
  process.stdout.write('\n')
  return rows
}

// ── 4. Main ──────────────────────────────────────────────────────────────────
async function main() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'PRODUCCIÓN'
  console.log(`\n🔧 Homologación de procedimientos — ${mode}`)
  if (CAMPANA) console.log(`   Campaña: ${CAMPANA}`)
  else         console.log(`   Campaña: TODAS (con procedimiento no nulo)`)

  console.log('\n📥 Cargando registros...')
  const registros = await fetchRegistros()
  console.log(`   Total: ${registros.length}`)

  // Clasificar
  const con_match = []
  const sin_match = []
  const sin_parse = []

  for (const r of registros) {
    const p = parseSiac(r.procedimiento)
    if (!p) { sin_parse.push(r); continue }
    const homologado = lookup(r.procedimiento)
    if (homologado) con_match.push({ id: r.id_registro, homologado, original: r.procedimiento })
    else            sin_match.push({ id: r.id_registro, original: r.procedimiento, parsed: p.nombre })
  }

  console.log(`\n📊 Análisis:`)
  console.log(`   Con match    : ${con_match.length}`)
  console.log(`   Sin match    : ${sin_match.length}`)
  console.log(`   Sin formato  : ${sin_parse.length}`)

  if (sin_match.length > 0) {
    console.log(`\n⚠️  Procedimientos sin match en catálogo (${Math.min(sin_match.length, 20)} de ${sin_match.length}):`)
    const unicos = [...new Set(sin_match.map(r => r.parsed))]
    unicos.slice(0, 20).forEach(u => console.log(`   - "${u}"`))
  }

  if (DRY_RUN) {
    console.log('\n✅ Dry-run completado. Sin cambios en BD.')
    console.log('   Para aplicar: omita --dry-run\n')
    return
  }

  if (con_match.length === 0) {
    console.log('\n⚠️  Sin registros con match. Nada que actualizar.')
    return
  }

  // Actualizar en lotes
  console.log(`\n📤 Actualizando ${con_match.length} registros...`)
  let ok = 0
  let err = 0
  for (let i = 0; i < con_match.length; i += BATCH) {
    const batch = con_match.slice(i, i + BATCH)
    await Promise.all(batch.map(async ({ id, homologado }) => {
      const { error } = await sb.from('registros')
        .update({ procedimiento_homologado: homologado })
        .eq('id_registro', id)
      if (error) err++
      else ok++
    }))
    process.stdout.write(`\r   Progreso: ${Math.min(i + BATCH, con_match.length)}/${con_match.length}`)
  }
  process.stdout.write('\n')

  console.log(`\n✅ Completado`)
  console.log(`   Actualizados : ${ok}`)
  console.log(`   Errores      : ${err}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })

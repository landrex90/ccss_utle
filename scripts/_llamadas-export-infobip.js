#!/usr/bin/env node
/**
 * _llamadas-export-infobip.js
 *
 * Exporta candidatos para campaña IVR de Infobip.
 * Candidatos: whatsapp_estado='no_respondio' + encuesta_completada_at IS NULL
 *
 * Uso:
 *   node --env-file=.env.local scripts/_llamadas-export-infobip.js --llamada LLAMADA-CIRUGIA-01 --dry-run
 *   node --env-file=.env.local scripts/_llamadas-export-infobip.js --llamada LLAMADA-CIRUGIA-01
 *   node --env-file=.env.local scripts/_llamadas-export-infobip.js --llamada LLAMADA-CE-01
 *   node --env-file=.env.local scripts/_llamadas-export-infobip.js --llamada LLAMADA-PROC-01
 */

const XLSX             = require('xlsx')
const path             = require('path')
const fs               = require('fs')
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

const LLAMADA_ID = arg('--llamada')
const DRY_RUN    = process.argv.includes('--dry-run')
const PAGE       = 1000
const BATCH_UPD  = 200

if (!LLAMADA_ID) {
  console.error('❌ --llamada requerido. Ej: --llamada LLAMADA-CIRUGIA-01')
  process.exit(1)
}

// ── Configuración por ID de llamada ──────────────────────────────────────────
// llamada_campana_id en BD: uno por encuesta (diferenciado)
// encuesta_a_llamada: mapeo para marcar cada registro con su ID correcto
const CONFIG = {
  'LLAMADA-CIRUGIA-01': {
    encuesta_campanas:  ['ENCUESTA-CIRUGIA-01_1500', 'ENCUESTA-CIRUGIA-02'],
    encuesta_a_llamada: {
      'ENCUESTA-CIRUGIA-01_1500': 'LLAMADA-CIRUGIA-01',
      'ENCUESTA-CIRUGIA-02':      'LLAMADA-CIRUGIA-02',
    },
    tipo_atencion: 'cirugia',
    descripcion:   'Cirugía (CIRUGIA-01 + CIRUGIA-02)',
  },
  'LLAMADA-CE-01': {
    encuesta_campanas:  ['ENCUESTA-CE-01'],
    encuesta_a_llamada: { 'ENCUESTA-CE-01': 'LLAMADA-CE-01' },
    tipo_atencion: 'consulta',
    descripcion:   'Consulta Externa (CE-01)',
  },
  'LLAMADA-PROC-01': {
    encuesta_campanas:  ['ENCUESTA-PROC-01'],
    encuesta_a_llamada: { 'ENCUESTA-PROC-01': 'LLAMADA-PROC-01' },
    tipo_atencion: 'procedimiento',
    descripcion:   'Procedimientos (PROC-01)',
  },
}

const cfg = CONFIG[LLAMADA_ID]
if (!cfg) {
  console.error(`❌ LLAMADA_ID no reconocido: ${LLAMADA_ID}`)
  console.error('   Válidos:', Object.keys(CONFIG).join(', '))
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

function splitNombre(nombreCompleto) {
  const partes = (nombreCompleto ?? '').trim().split(/\s+/)
  if (partes.length <= 2) return { firstname: partes[0] ?? '', lastname: partes.slice(1).join(' ') }
  // CR: siempre 2 apellidos → últimas 2 palabras = lastname
  const lastname  = partes.slice(-2).join(' ')
  const firstname = partes.slice(0, -2).join(' ')
  return { firstname, lastname }
}

function limpiarTelefono(tel) {
  return (tel ?? '').replace(/\D/g, '')
}

function mapTipoAtencion(tipo) {
  if (tipo === 'consulta')      return 'CONSULTA_EXTERNA'
  if (tipo === 'cirugia')       return 'CIRUGIA'
  if (tipo === 'procedimiento') return 'PROCEDIMIENTO'
  return (tipo ?? '').toUpperCase()
}

// ── Fetch registros ───────────────────────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SERVICE_KEY)

async function fetchCandidatos() {
  const rows = []
  for (const campana of cfg.encuesta_campanas) {
    let from = 0
    while (true) {
      const { data, error } = await sb
        .from('registros')
        .select([
          'id_registro', 'nombre_paciente', 'cedula_raw', 'ultimos_4_asegurado',
          'telefono', 'encuesta_campana_id', 'tipo_atencion',
          'nombre_servicio', 'especialidad', 'centro_medico',
          'procedimiento', 'procedimiento_homologado',
          'lateralidad', 'tipo_consulta', 'fecha_cita', 'hora_cita',
        ].join(', '))
        .eq('encuesta_campana_id', campana)
        .eq('whatsapp_estado', 'no_respondio')
        .is('encuesta_completada_at', null)
        .order('id_registro')
        .range(from, from + PAGE - 1)

      if (error) { console.error('❌', error.message); process.exit(1) }
      if (!data || data.length === 0) break
      rows.push(...data)
      process.stdout.write(`\r   [${campana}] Cargados: ${rows.length}`)
      if (data.length < PAGE) break
      from += PAGE
      await sleep(100)
    }
    process.stdout.write('\n')
  }
  return rows
}

// ── Generar fila Excel ────────────────────────────────────────────────────────
function buildRow(r) {
  const { firstname, lastname } = splitNombre(r.nombre_paciente)
  const esCirugia   = r.tipo_atencion === 'cirugia'
  const esConsulta  = r.tipo_atencion === 'consulta'
  const esProced    = r.tipo_atencion === 'procedimiento'

  return {
    id:                r.cedula_raw ?? '',
    firstname,
    lastname,
    phone:             limpiarTelefono(r.telefono),
    // Data payload — trazabilidad
    id_registro_utle:  r.id_registro,
    campana_origen:    r.encuesta_campana_id,
    ultimos_4:         r.ultimos_4_asegurado ?? '',
    // Datos clínicos para el flujo IVR
    tipo_atencion:     mapTipoAtencion(r.tipo_atencion),
    servicio:          r.nombre_servicio ?? '',
    especialidad:      r.especialidad ?? '',
    centro_medico:     r.centro_medico ?? '',
    procedimiento:     (esProced || esConsulta) ? (r.procedimiento_homologado ?? r.procedimiento ?? '') : '',
    lateralidad:       esCirugia ? (r.lateralidad ?? 'No aplica') : '',
    tipo_consulta:     esConsulta ? (r.tipo_consulta ?? '') : '',
    fecha_cita:        (esConsulta || esProced) ? (r.fecha_cita ?? '') : '',
    hora_cita:         (esConsulta || esProced) ? (r.hora_cita  ?? '') : '',
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const modo = DRY_RUN ? 'DRY-RUN' : 'PRODUCCIÓN'
  console.log(`\n📞 Llamadas Export — ${LLAMADA_ID} (${cfg.descripcion}) — ${modo}`)
  console.log(`   Campañas origen: ${cfg.encuesta_campanas.join(', ')}\n`)

  console.log('📥 Cargando candidatos (no_respondio WA + sin correo completado)...')
  const candidatos = await fetchCandidatos()
  console.log(`\n   Total candidatos: ${candidatos.length}`)

  if (candidatos.length === 0) {
    console.log('⚠️  Sin candidatos. Verifique que el WA fue importado para estas campañas.')
    return
  }

  // Distribución — muestra llamada_campana_id asignado por grupo
  const porCampana = {}
  candidatos.forEach(r => {
    porCampana[r.encuesta_campana_id] = (porCampana[r.encuesta_campana_id] ?? 0) + 1
  })
  Object.entries(porCampana).forEach(([c, n]) => {
    const lid = cfg.encuesta_a_llamada[c] ?? LLAMADA_ID
    console.log(`   · ${c} (${n}) → llamada_campana_id='${lid}'`)
  })

  // Generar Excel — todas las celdas forzadas a texto (evita que Excel/Infobip auto-conviertan fechas)
  const rows = candidatos.map(buildRow)
  const ws = XLSX.utils.json_to_sheet(rows)
  // Forzar tipo texto en cada celda
  Object.keys(ws).forEach(addr => {
    if (addr.startsWith('!')) return
    const cell = ws[addr]
    if (cell.t !== 's') { cell.t = 's'; cell.v = String(cell.v ?? ''); delete cell.w }
    cell.z = '@'
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Llamadas')

  const outDir  = path.join(__dirname, 'llamadas-data', LLAMADA_ID)
  const outFile = path.join(outDir, `${LLAMADA_ID}_infobip_${candidatos.length}registros.xlsx`)

  if (!DRY_RUN) {
    fs.mkdirSync(outDir, { recursive: true })
    XLSX.writeFile(wb, outFile)
    console.log(`\n💾 Archivo generado: ${outFile}`)
  } else {
    console.log(`\n✅ Dry-run — se generaría: ${path.basename(outFile)}`)
    console.log('   Muestra (primeras 3 filas):')
    rows.slice(0, 3).forEach(r => console.log('  ', JSON.stringify(r)))
  }

  if (DRY_RUN) {
    console.log('\n   Para ejecutar: omita --dry-run\n')
    return
  }

  // Marcar en BD — diferenciado por encuesta_campana_id
  console.log(`\n📤 Marcando registros en BD (diferenciado por campaña)...`)
  let ok = 0, err = 0, totalMarcado = 0

  // Agrupar por llamada_campana_id que les corresponde
  const porLlamada = {}
  for (const r of candidatos) {
    const lid = cfg.encuesta_a_llamada[r.encuesta_campana_id] ?? LLAMADA_ID
    if (!porLlamada[lid]) porLlamada[lid] = []
    porLlamada[lid].push(r.id_registro)
  }

  for (const [lid, ids] of Object.entries(porLlamada)) {
    console.log(`   · ${lid}: ${ids.length} registros`)
    for (let i = 0; i < ids.length; i += BATCH_UPD) {
      const batch = ids.slice(i, i + BATCH_UPD)
      const { error } = await sb.from('registros')
        .update({ llamada_campana_id: lid, llamada_estado: 'pendiente' })
        .in('id_registro', batch)
      if (error) err += batch.length
      else ok += batch.length
      totalMarcado = ok + err
      process.stdout.write(`\r     Progreso ${lid}: ${Math.min(i + BATCH_UPD, ids.length)}/${ids.length}`)
      await sleep(80)
    }
    process.stdout.write('\n')
  }

  console.log(`\n✅ Completado`)
  console.log(`   Registros marcados : ${ok}`)
  console.log(`   Errores            : ${err}`)
  console.log(`   Archivo            : ${outFile}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })

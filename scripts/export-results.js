#!/usr/bin/env node
/**
 * Exporta los resultados de la encuesta desde Supabase a un CSV.
 * Ese CSV se puede abrir directamente en Excel o importar a Google Sheets.
 *
 * Uso:
 *   node --env-file=.env.local scripts/export-results.js [--campana ID] [archivo.csv]
 *
 * Ejemplos:
 *   node --env-file=.env.local scripts/export-results.js
 *   node --env-file=.env.local scripts/export-results.js --campana 2026-05-01_HospMexico
 *   node --env-file=.env.local scripts/export-results.js --campana 2026-05-01_HospMexico resultados_mayo.csv
 */

const fs     = require('fs')
const { createClient } = require('@supabase/supabase-js')

const args       = process.argv.slice(2)
const campanaArg = args.indexOf('--campana')
const campanaId  = campanaArg !== -1 ? args[campanaArg + 1] : null
const suffix     = campanaId ? `_${campanaId}` : ''
const outputFile = args.find(a => a.endsWith('.csv')) ?? `resultados${suffix}_${new Date().toISOString().slice(0,10)}.csv`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function escapeCSV(val) {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

async function main() {
  if (campanaId) console.log(`📣 Filtrando por campaña: ${campanaId}`)

  let query = supabase
    .from('respuestas')
    .select(`
      id, created_at, canal, completado, estado_final, paso_abandono,
      paso_1_consentimiento, paso_2_verificacion, paso_2_intentos,
      paso_3_info_correcta, paso_4_desea_continuar, motivo_retiro,
      paso_5a_flexibilidad_centro, paso_5b_condiciones_asistir,
      paso_5b_motivo_no_asistir, paso_6_medio_contacto,
      registros (
        id_registro, nombre_paciente, correo, telefono,
        tipo_atencion, especialidad, centro_medico, estado, campana_id
      )
    `)
    .order('created_at', { ascending: false })

  if (campanaId) {
    query = query.eq('registros.campana_id', campanaId)
  }

  const { data, error } = await query

  if (error) { console.error('Error:', error.message); process.exit(1) }

  if (!data || data.length === 0) {
    console.log('No hay resultados aún.')
    return
  }

  const cols = [
    'id_registro', 'nombre_paciente', 'correo', 'telefono',
    'tipo_atencion', 'especialidad', 'centro_medico', 'campana_id',
    'estado_registro', 'fecha_respuesta', 'canal', 'completado', 'estado_final',
    'paso_abandono', 'consentimiento', 'verificacion', 'intentos_verificacion',
    'info_correcta', 'desea_continuar', 'motivo_retiro',
    'flexibilidad_centro', 'condiciones_asistir', 'motivo_no_asistir',
    'medio_contacto',
  ]

  const filas = data.map(r => {
    const reg = r.registros || {}
    return {
      id_registro:            reg.id_registro,
      nombre_paciente:        reg.nombre_paciente,
      correo:                 reg.correo,
      telefono:               reg.telefono,
      tipo_atencion:          reg.tipo_atencion,
      especialidad:           reg.especialidad,
      centro_medico:          reg.centro_medico,
      campana_id:             reg.campana_id,
      estado_registro:        reg.estado,
      fecha_respuesta:        r.created_at?.slice(0, 19).replace('T', ' '),
      canal:                  r.canal,
      completado:             r.completado ? 'Sí' : 'No',
      estado_final:           r.estado_final,
      paso_abandono:          r.paso_abandono,
      consentimiento:         r.paso_1_consentimiento,
      verificacion:           r.paso_2_verificacion,
      intentos_verificacion:  r.paso_2_intentos,
      info_correcta:          r.paso_3_info_correcta,
      desea_continuar:        r.paso_4_desea_continuar,
      motivo_retiro:          r.motivo_retiro,
      flexibilidad_centro:    r.paso_5a_flexibilidad_centro,
      condiciones_asistir:    r.paso_5b_condiciones_asistir,
      motivo_no_asistir:      r.paso_5b_motivo_no_asistir,
      medio_contacto:         r.paso_6_medio_contacto,
    }
  })

  const csv = [
    cols.join(','),
    ...filas.map(f => cols.map(c => escapeCSV(f[c])).join(',')),
  ].join('\n')

  fs.writeFileSync(outputFile, '﻿' + csv, 'utf-8') // BOM para Excel
  console.log(`✅ ${data.length} respuestas exportadas a: ${outputFile}`)
}

main().catch(err => { console.error(err); process.exit(1) })

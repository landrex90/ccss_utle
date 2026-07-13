#!/usr/bin/env node
/**
 * _warmup-send.js — Campaña warmup CCSS UTLE
 *
 * Lee BD_cirugia.csv + BD_consulta.csv + BD_procedimiento.csv de scripts/output/,
 * crea registros en Supabase (con token para encuesta futura), y envía
 * warmup_template_ccss.html en batches de 1,000 vía SendGrid con delay
 * entre llamadas para no bloquear la API.
 *
 * Uso:
 *   node --env-file=.env.local scripts/_warmup-send.js --campana WARMUP-CORREO-01
 *   node --env-file=.env.local scripts/_warmup-send.js --campana WARMUP-CORREO-01 --dry-run
 *
 * --dry-run: muestra conteos y primera fila de cada batch, no toca SendGrid ni Supabase.
 * --campana: requerido. Identificador de campaña (ej. WARMUP-CORREO-01).
 *
 * Requisito previo: generar los CSVs con
 *   node scripts/_bd-to-csv.js
 *
 * Migración requerida: 014_warmup_fields.sql (warmup_enviado_at, warmup_estado)
 */

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

// ── Configuración ─────────────────────────────────────────────────────────────
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

const FROM      = 'gm_utle_gelisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'Aviso: CLEO le contactará próximamente — CCSS Lista de Espera'

const BATCH_SIZE        = 1000  // Límite de personalizations por llamada SendGrid
const DELAY_SENDGRID_MS = 10000 // Pausa entre llamadas a SendGrid (ms)
const DELAY_SUPABASE_MS = 300   // Pausa entre operaciones Supabase (ms)
const LINK_EXPIRES_DAYS = 90    // Validez del token para la encuesta

// ── Args ──────────────────────────────────────────────────────────────────────
const campanaIdx = process.argv.indexOf('--campana')
const CAMPANA_ID = campanaIdx !== -1 ? (process.argv[campanaIdx + 1] ?? '') : ''
const DRY_RUN    = process.argv.includes('--dry-run')

if (!CAMPANA_ID) {
  console.error('\n❌ Argumento --campana requerido.')
  console.error('   Ejemplo: node --env-file=.env.local scripts/_warmup-send.js --campana WARMUP-CORREO-01\n')
  process.exit(1)
}

// ── Validar variables de entorno ───────────────────────────────────────────────
const missingEnv = [
  ['SENDGRID_API_KEY',              SENDGRID_API_KEY],
  ['NEXT_PUBLIC_SUPABASE_URL',      SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY',     SUPABASE_KEY],
].filter(([, v]) => !v).map(([k]) => k)

if (missingEnv.length > 0) {
  console.error(`\n❌ Variables de entorno faltantes: ${missingEnv.join(', ')}`)
  console.error('   Asegúrese de usar --env-file=.env.local\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Utilidades ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

function parseCSV(filepath) {
  if (!fs.existsSync(filepath)) {
    console.warn(`⚠️  No encontrado: ${path.basename(filepath)} — omitido`)
    return []
  }
  const lines = fs.readFileSync(filepath, 'utf-8')
    .replace(/^﻿/, '')   // strip BOM
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = []
    let field = '', inQ = false
    for (const ch of line + ',') {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { values.push(field); field = '' }
      else { field += ch }
    }
    return headers.reduce((obj, h, i) => {
      obj[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim() || null
      return obj
    }, {})
  })
}

function primerNombre(nombreCompleto) {
  return (nombreCompleto ?? '').trim().split(/\s+/)[0] || ''
}

// ── Cargar template ────────────────────────────────────────────────────────────
const templatePath = path.join(__dirname, 'warmup_template_ccss.html')
if (!fs.existsSync(templatePath)) {
  console.error('\n❌ Template no encontrado: scripts/warmup_template_ccss.html\n')
  process.exit(1)
}
const htmlTemplate = fs.readFileSync(templatePath, 'utf-8')

// ── Cargar CSVs ────────────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, 'output')
console.log('\n📂 Cargando CSVs desde scripts/output/...')
const cirugia      = parseCSV(path.join(OUT_DIR, 'BD_cirugia.csv'))
const consulta     = parseCSV(path.join(OUT_DIR, 'BD_consulta.csv'))
const procedimiento = parseCSV(path.join(OUT_DIR, 'BD_procedimiento.csv'))
const todos = [...cirugia, ...consulta, ...procedimiento]

// ── Envío ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Campaña warmup: ${CAMPANA_ID}${DRY_RUN ? ' [DRY RUN — sin envíos reales]' : ''}`)
  console.log(`   Cirugía:       ${cirugia.length.toLocaleString()}`)
  console.log(`   Consulta:      ${consulta.length.toLocaleString()}`)
  console.log(`   Procedimiento: ${procedimiento.length.toLocaleString()}`)
  console.log(`   Total:         ${todos.length.toLocaleString()}`)
  console.log(`   Batch size:    ${BATCH_SIZE} | Delay SendGrid: ${DELAY_SENDGRID_MS}ms`)

  // Filtrar registros sin correo o sin id (no deberían existir, pero por seguridad)
  const validos = todos.filter(r => r.correo && r.id_registro)
  if (validos.length < todos.length) {
    console.warn(`\n⚠️  ${todos.length - validos.length} registros omitidos por falta de correo o id_registro`)
  }

  // Obtener ids ya enviados para no re-enviar (permite retomar si el script se interrumpe)
  console.log('\n🔍 Consultando registros ya enviados en Supabase...')
  const { data: yaEnviados, error: qErr } = await supabase
    .from('registros')
    .select('id_registro')
    .eq('warmup_estado', 'enviado')
  if (qErr) {
    console.error(`❌ Error consultando Supabase: ${qErr.message}`)
    process.exit(1)
  }
  const yaEnviadosSet = new Set((yaEnviados ?? []).map(r => r.id_registro))
  console.log(`   Ya enviados anteriormente: ${yaEnviadosSet.size.toLocaleString()}`)

  const pendientes = validos.filter(r => !yaEnviadosSet.has(r.id_registro))
  console.log(`   Pendientes de envío:       ${pendientes.length.toLocaleString()}`)

  if (pendientes.length === 0) {
    console.log('\n✅ Sin registros pendientes. Campaña ya completada.\n')
    return
  }

  const totalBatches = Math.ceil(pendientes.length / BATCH_SIZE)
  let totalEnviados = 0
  let totalErrores  = 0
  let totalOmitidos = 0

  const linkExpiresAt = new Date(Date.now() + LINK_EXPIRES_DAYS * 86_400_000).toISOString()

  for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
    const batch    = pendientes.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1

    console.log(`\n${'─'.repeat(55)}`)
    console.log(`📦 Batch ${batchNum}/${totalBatches} — ${batch.length} registros (${(i + batch.length).toLocaleString()}/${pendientes.length.toLocaleString()} total)`)

    // ── 1. Upsert en Supabase ────────────────────────────────────────────────
    if (!DRY_RUN) {
      const registros = batch.map(r => ({
        id_registro:         r.id_registro,
        nombre_paciente:     r.nombre_paciente,
        numero_asegurado:    r.numero_asegurado,
        cedula_raw:          (r.numero_asegurado ?? '').replace(/\D/g, ''),
        telefono:            r.telefono ?? null,
        correo:              r.correo,
        especialidad:        r.especialidad ?? null,
        centro_medico:       r.centro_medico,
        tipo_atencion:       r.tipo_atencion,
        nombre_servicio:     r.nombre_servicio ?? null,
        lateralidad:         r.lateralidad ?? null,
        procedimiento:       r.procedimiento ?? null,
        tipo_consulta:       r.tipo_consulta ?? null,
        fecha_cita:          r.fecha_cita ?? null,
        hora_cita:           r.hora_cita ?? null,
        ultimos_4_asegurado: r.ultimos_4_asegurado,
        token:               crypto.randomUUID(),
        link_expires_at:     linkExpiresAt,
        estado:              'PENDIENTE',
        campana_id:          CAMPANA_ID,
        canal_orden:         'correo,whatsapp,llamada',
        canal_actual:        'correo',
      }))

      const { error: upsertErr } = await supabase
        .from('registros')
        .upsert(registros, { onConflict: 'id_registro', ignoreDuplicates: true })

      if (upsertErr) {
        console.error(`   ❌ Upsert Supabase falló: ${upsertErr.message}`)
        console.error('   ⚠️  Batch omitido — el script puede retomarse con el mismo comando.')
        totalErrores += batch.length
        await sleep(DELAY_SUPABASE_MS)
        continue
      }
      console.log(`   ✅ Supabase upsert OK`)
      await sleep(DELAY_SUPABASE_MS)
    }

    // ── 2. Construir personalizations SendGrid ────────────────────────────────
    const personalizations = batch.map(r => ({
      to: [{ email: r.correo, name: r.nombre_paciente }],
      substitutions: {
        '-FNAME-':        primerNombre(r.nombre_paciente),
        '-ESPECIALIDAD-': r.especialidad ?? '',
        '-CENTRO-':       r.centro_medico ?? '',
        '-ASEGURADO-':    r.numero_asegurado ?? '',
        '-ULT4-':         r.ultimos_4_asegurado ?? '',
        '-EMAIL-':        r.correo ?? '',
      },
    }))

    // ── 3. Enviar via SendGrid ────────────────────────────────────────────────
    if (DRY_RUN) {
      const muestra = batch[0]
      console.log(`   🧪 DRY RUN — muestra primer destinatario:`)
      console.log(`      ${primerNombre(muestra.nombre_paciente)} <${muestra.correo}> | ${muestra.especialidad} | ${muestra.centro_medico}`)
      totalEnviados += batch.length
      continue
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations,
        from:    { email: FROM, name: FROM_NAME },
        subject: SUBJECT,
        content: [{ type: 'text/html', value: htmlTemplate }],
      }),
    })

    if (res.status === 202) {
      console.log(`   ✅ SendGrid: 202 Accepted — ${batch.length} correos en cola`)

      // ── 4. Marcar como enviados en Supabase ──────────────────────────────
      const ids = batch.map(r => r.id_registro)
      const { error: updErr } = await supabase
        .from('registros')
        .update({
          warmup_enviado_at: new Date().toISOString(),
          warmup_estado:     'enviado',
        })
        .in('id_registro', ids)

      if (updErr) {
        console.error(`   ⚠️  Error actualizando warmup_estado: ${updErr.message}`)
      } else {
        console.log(`   ✅ Supabase: warmup_estado='enviado' marcado`)
      }
      totalEnviados += batch.length

    } else {
      const errText = await res.text()
      console.error(`   ❌ SendGrid error ${res.status}: ${errText.slice(0, 300)}`)
      totalErrores += batch.length
    }

    // Pausa entre batches para no saturar la API
    if (i + BATCH_SIZE < pendientes.length) {
      console.log(`   ⏳ Esperando ${DELAY_SENDGRID_MS}ms antes del próximo batch...`)
      await sleep(DELAY_SENDGRID_MS)
    }
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ Campaña warmup finalizada — ${CAMPANA_ID}`)
  console.log(`   Enviados:          ${totalEnviados.toLocaleString()}`)
  console.log(`   Errores:           ${totalErrores.toLocaleString()}`)
  console.log(`   Ya enviados (skip): ${yaEnviadosSet.size.toLocaleString()}`)
  if (DRY_RUN) console.log(`   Modo:              DRY RUN — ningún correo fue enviado`)
  console.log()
}

main().catch(err => {
  console.error(`\n❌ Error fatal: ${err.message}`)
  process.exit(1)
})

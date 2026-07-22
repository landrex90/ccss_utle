#!/usr/bin/env node
/**
 * _encuesta-send.js — Campaña encuesta CCSS UTLE
 *
 * Lee registros desde Supabase (warmup_estado='enviado', sin encuesta_campana_id aún),
 * asigna un encuesta_campana_id independiente del warmup, y envía el correo de encuesta
 * personalizado con el token único de cada paciente.
 *
 * El warmup y la encuesta tienen IDs de campaña distintos y campos de trazabilidad separados:
 *   Warmup  → campana_id         / warmup_estado    / warmup_enviado_at
 *   Encuesta → encuesta_campana_id / correo_estado    / correo_enviado_at
 *
 * Uso:
 *   node --env-file=.env.local scripts/_encuesta-send.js \
 *        --campana ENCUESTA-CIRUGIA-01 \
 *        --tipo cirugia \
 *        --limite 1500
 *
 *   node --env-file=.env.local scripts/_encuesta-send.js \
 *        --campana ENCUESTA-CIRUGIA-01 --tipo cirugia --limite 1500 --dry-run
 *
 * Argumentos:
 *   --campana  ID de la campaña encuesta (requerido)  ej: ENCUESTA-CIRUGIA-01
 *   --tipo     Filtro tipo_atencion (requerido)        cirugia | consulta | procedimiento
 *   --limite   Máximo de registros a procesar          omitir para enviar todos
 *   --dry-run  Muestra qué se haría sin tocar nada
 *
 * Prerrequisitos:
 *   - Migración 015 aplicada en Supabase (columna encuesta_campana_id)
 *   - UTLE_template_ccss aprobacion.html con tags SendGrid (-FNAME-, -LINK-, -EMAIL-)
 */

const fs     = require('fs')
const path   = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Config ─────────────────────────────────────────────────────────────────────
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

const FROM      = 'gm_utle_glisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'La CCSS le solicita actualizar su información en lista de espera'
const BASE_URL  = 'https://ccss.cocoreservas.com'

const BATCH_SIZE        = 1000   // Límite de personalizations por llamada SendGrid
const DELAY_SENDGRID_MS = 10000  // 10 seg entre batches SendGrid
const DELAY_SUPABASE_MS = 300

// ── Args ───────────────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? (process.argv[i + 1] ?? '') : ''
}

const CAMPANA_ID = arg('--campana')
const TIPO       = arg('--tipo')
const LIMITE     = parseInt(arg('--limite') || '0', 10) || null
const DRY_RUN    = process.argv.includes('--dry-run')

const TIPOS_VALIDOS = ['cirugia', 'consulta', 'procedimiento']

if (!CAMPANA_ID) {
  console.error('\n❌ --campana requerido.  Ej: ENCUESTA-CIRUGIA-01\n')
  process.exit(1)
}
if (!TIPO || !TIPOS_VALIDOS.includes(TIPO)) {
  console.error(`\n❌ --tipo requerido. Opciones: ${TIPOS_VALIDOS.join(' | ')}\n`)
  process.exit(1)
}

const missingEnv = [
  ['SENDGRID_API_KEY', SENDGRID_API_KEY],
  ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_KEY],
].filter(([, v]) => !v).map(([k]) => k)

if (missingEnv.length) {
  console.error(`\n❌ Variables de entorno faltantes: ${missingEnv.join(', ')}\n`)
  process.exit(1)
}

// ── Template ───────────────────────────────────────────────────────────────────
const templatePath = path.join(__dirname, 'UTLE_template_ccss aprobacion.html')
if (!fs.existsSync(templatePath)) {
  console.error('\n❌ Template no encontrado: scripts/UTLE_template_ccss aprobacion.html\n')
  process.exit(1)
}
const htmlTemplate = fs.readFileSync(templatePath, 'utf-8')

// Verificar que el template ya tiene tags SendGrid (no Mailchimp)
if (htmlTemplate.includes('*|FNAME|*') || htmlTemplate.includes('*|MMERGE6|*')) {
  console.error('\n❌ El template aún usa formato Mailchimp (*|...|*). Ejecutar la conversión primero.\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const sleep    = ms => new Promise(r => setTimeout(r, ms))

function primerNombre(nombreCompleto) {
  return (nombreCompleto ?? '').trim().split(/\s+/)[0] || ''
}

// ── Cargar registros desde Supabase ───────────────────────────────────────────
async function getRegistros() {
  const registros = []
  let from = 0

  while (true) {
    // Si hay límite y ya tenemos suficientes, parar
    if (LIMITE && registros.length >= LIMITE) break

    const toFetch = LIMITE ? Math.min(BATCH_SIZE, LIMITE - registros.length) : BATCH_SIZE

    const { data, error } = await supabase
      .from('registros')
      .select('id_registro, nombre_paciente, numero_asegurado, correo, especialidad, centro_medico, tipo_atencion, token, encuesta_campana_id')
      .eq('warmup_estado', 'enviado')
      .eq('tipo_atencion', TIPO)
      .is('encuesta_campana_id', null)   // Solo los que no tienen encuesta asignada aún
      .not('correo', 'is', null)
      .not('token', 'is', null)
      .range(from, from + toFetch - 1)
      .order('id_registro')

    if (error) {
      console.error(`❌ Error consultando Supabase: ${error.message}`)
      // Si el error es que la columna no existe, dar instrucción clara
      if (error.message.includes('encuesta_campana_id')) {
        console.error('   → Aplique primero la migración 015 en Supabase SQL Editor.')
      }
      process.exit(1)
    }

    if (!data || data.length === 0) break
    registros.push(...data)
    if (data.length < toFetch) break
    from += toFetch
  }

  return registros
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📧 Campaña encuesta: ${CAMPANA_ID}`)
  console.log(`   Tipo:    ${TIPO}`)
  console.log(`   Límite:  ${LIMITE ? LIMITE.toLocaleString() : 'todos'}`)
  console.log(`   Modo:    ${DRY_RUN ? 'DRY RUN — sin envíos reales' : 'PRODUCCIÓN'}`)

  console.log('\n🔍 Consultando registros en Supabase...')
  const registros = await getRegistros()

  console.log(`   Elegibles (warmup enviado, sin encuesta, con correo): ${registros.length.toLocaleString()}`)

  if (registros.length === 0) {
    console.log('\n✅ Sin registros pendientes para este lote.\n')
    return
  }

  if (DRY_RUN) {
    console.log('\n🧪 Muestra de primeros destinatarios:')
    registros.slice(0, 5).forEach(r => {
      const link = `${BASE_URL}/utle?t=${r.token}`
      console.log(`   ${primerNombre(r.nombre_paciente)} | ${r.correo} | ${r.especialidad ?? r.tipo_atencion}`)
      console.log(`   → ${link}`)
    })
    const batches = Math.ceil(registros.length / BATCH_SIZE)
    console.log(`\n   Batches SendGrid: ${batches} × ${BATCH_SIZE} (último: ${registros.length % BATCH_SIZE || BATCH_SIZE})`)
    console.log(`   Tiempo estimado: ~${Math.round(batches * DELAY_SENDGRID_MS / 1000)} seg`)
    console.log(`\n✅ DRY RUN — se enviarían ${registros.length.toLocaleString()} correos con campana '${CAMPANA_ID}'.\n`)
    return
  }

  const totalBatches = Math.ceil(registros.length / BATCH_SIZE)
  let totalEnviados  = 0
  let totalErrores   = 0

  for (let i = 0; i < registros.length; i += BATCH_SIZE) {
    const batch    = registros.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const ids      = batch.map(r => r.id_registro)

    console.log(`\n${'─'.repeat(55)}`)
    console.log(`📦 Batch ${batchNum}/${totalBatches} — ${batch.length} registros`)

    // ── 1. Asignar encuesta_campana_id ANTES de enviar ────────────────────────
    const { error: assignErr } = await supabase
      .from('registros')
      .update({ encuesta_campana_id: CAMPANA_ID })
      .in('id_registro', ids)
      .is('encuesta_campana_id', null)   // Solo si no está asignado (idempotente)

    if (assignErr) {
      console.error(`   ❌ Error asignando encuesta_campana_id: ${assignErr.message}`)
      totalErrores += batch.length
      await sleep(DELAY_SUPABASE_MS)
      continue
    }
    console.log(`   ✅ encuesta_campana_id='${CAMPANA_ID}' asignado`)
    await sleep(DELAY_SUPABASE_MS)

    // ── 2. Construir personalizations SendGrid ─────────────────────────────────
    const personalizations = batch.map(r => ({
      to: [{ email: r.correo, name: r.nombre_paciente }],
      substitutions: {
        '-FNAME-': primerNombre(r.nombre_paciente),
        '-LINK-':  `${BASE_URL}/utle?t=${r.token}`,
        '-EMAIL-': r.correo ?? '',
      },
    }))

    // ── 3. Enviar via SendGrid ─────────────────────────────────────────────────
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

      // ── 4. Marcar correo_estado='enviado' en Supabase ──────────────────────
      const { error: updErr } = await supabase
        .from('registros')
        .update({
          correo_enviado_at: new Date().toISOString(),
          correo_estado:     'enviado',
        })
        .in('id_registro', ids)

      if (updErr) {
        console.error(`   ⚠️  Error marcando correo_estado: ${updErr.message}`)
      } else {
        console.log(`   ✅ correo_estado='enviado' marcado en Supabase`)
      }

      totalEnviados += batch.length
    } else {
      const errText = await res.text()
      console.error(`   ❌ SendGrid error ${res.status}: ${errText.slice(0, 400)}`)
      // Revertir encuesta_campana_id para que el lote sea reintentable
      await supabase
        .from('registros')
        .update({ encuesta_campana_id: null })
        .in('id_registro', ids)
        .eq('correo_estado', 'pendiente')
      console.error('   ↩️  encuesta_campana_id revertido — batch reintentable')
      totalErrores += batch.length
    }

    if (i + BATCH_SIZE < registros.length) {
      console.log(`   ⏳ Esperando ${DELAY_SENDGRID_MS / 1000}s antes del próximo batch...`)
      await sleep(DELAY_SENDGRID_MS)
    }
  }

  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ Campaña ${CAMPANA_ID} finalizada`)
  console.log(`   Enviados: ${totalEnviados.toLocaleString()}`)
  if (totalErrores > 0) console.log(`   Errores:  ${totalErrores.toLocaleString()} (re-ejecute para reintentar)`)
  console.log()
}

main().catch(err => {
  console.error(`\n❌ Error fatal: ${err.message}`)
  process.exit(1)
})

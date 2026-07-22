#!/usr/bin/env node
/**
 * Test puntual — insertar registro en producción y enviar correo de encuesta a Jeancarlo Chacón.
 * Uso: node --env-file=.env.local scripts/_test-send-jeancarlo.js
 */

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDGRID_API_KEY  = process.env.SENDGRID_API_KEY

const BASE_URL  = 'https://ccss.cocoreservas.com'
const FROM      = 'gm_utle_glisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'La CCSS le solicita actualizar su información en lista de espera'
const CONTACTO  = 'mailto:gm_utle_glisespera@ccss.sa.cr'

const PACIENTE = {
  id_registro:         'REG-TEST-JEANCARLO-001',
  nombre_paciente:     'Jeancarlo Chacón',
  numero_asegurado:    '114150004',
  correo:              'jcchacov@ccss.sa.cr',
  telefono:            null,
  especialidad:        'Medicina General',
  centro_medico:       'Hospital San Juan de Dios',
  tipo_atencion:       'consulta',
  nombre_servicio:     'Consulta Externa - Medicina General',
  fecha_cita:          '2026-07-15',
  hora_cita:           '09:00',
  ultimos_4_asegurado: '0004',
  estado:              'PENDIENTE',
  campana_id:          'CAMP-TEST-JEANCARLO-2026',
  canal_orden:         'correo,whatsapp,llamada',
  canal_actual:        'correo',
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SENDGRID_API_KEY) {
    console.error('❌ Variables de entorno faltantes. Ejecutar con --env-file=.env.local')
    process.exit(1)
  }

  // ── 1. Insertar registro en producción ─────────────────────────────────────
  const token         = crypto.randomUUID()
  const linkExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const registro = { ...PACIENTE, token, link_expires_at: linkExpiresAt }

  console.log(`\n⏳ Insertando registro ${PACIENTE.id_registro} en producción...`)
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/registros`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(registro),
  })

  if (!insertRes.ok) {
    const err = await insertRes.text()
    console.error('❌ Error Supabase:', insertRes.status, err)
    process.exit(1)
  }

  const url = `${BASE_URL}/utle?t=${token}`
  console.log(`✅ Registro creado`)
  console.log(`🔗 URL: ${url}\n`)

  // ── 2. Cargar template HTML ─────────────────────────────────────────────────
  const templatePath = path.join(__dirname, 'mailchimp_template_ccss.html')
  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template no encontrado:', templatePath)
    process.exit(1)
  }

  let html = fs.readFileSync(templatePath, 'utf-8')
  html = html.replace(/\*\|FNAME\|\*/g,          '-FNAME-')
  html = html.replace(/\*\|MMERGE6\|\*/g,         '-LINK-')
  html = html.replace(/\*\|EMAIL\|\*/g,            '-EMAIL-')
  html = html.replace(/\*\|UNSUB\|\*/g,            CONTACTO)
  html = html.replace(/\*\|UPDATE_PROFILE\|\*/g,   CONTACTO)

  // ── 3. Enviar correo vía SendGrid ───────────────────────────────────────────
  const payload = {
    personalizations: [{
      to: [{ email: PACIENTE.correo, name: PACIENTE.nombre_paciente }],
      substitutions: {
        '-FNAME-': 'Jeancarlo',
        '-LINK-':  url,
        '-EMAIL-': PACIENTE.correo,
      },
    }],
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
  }

  console.log(`📤 Enviando correo a ${PACIENTE.nombre_paciente} <${PACIENTE.correo}>...`)
  const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (sgRes.status === 202) {
    console.log(`✅ Correo enviado exitosamente (202 Accepted)`)
    console.log(`   ✓ ${PACIENTE.nombre_paciente} <${PACIENTE.correo}>`)
    console.log(`   🔗 ${url}\n`)
  } else {
    const data = await sgRes.json().catch(() => sgRes.text())
    console.error('❌ Error SendGrid:', sgRes.status, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

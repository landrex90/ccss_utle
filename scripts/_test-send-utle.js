#!/usr/bin/env node
/**
 * Test visual — paciente ficticio enviado al buzón UTLE para captura de pantalla.
 * Uso: node --env-file=.env.local scripts/_test-send-utle.js
 */

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const BASE_URL  = 'https://ccss.cocoreservas.com'
const FROM      = 'gm_utle_glisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'La CCSS le solicita actualizar su información en lista de espera'
const CONTACTO  = 'mailto:gm_utle_glisespera@ccss.sa.cr'

const PACIENTE = {
  id_registro:         'REG-TEST-UTLE-VISUAL-001',
  nombre_paciente:     'María Fernanda Rodríguez Solano',
  numero_asegurado:    '203450789',
  correo:              'gm_utle_glisespera@ccss.sa.cr',
  telefono:            null,
  especialidad:        'Traumatología y Ortopedia',
  centro_medico:       'Hospital Dr. Rafael Ángel Calderón Guardia',
  tipo_atencion:       'consulta',
  nombre_servicio:     'Consulta Externa - Traumatología y Ortopedia',
  fecha_cita:          '2026-08-10',
  hora_cita:           '10:30',
  ultimos_4_asegurado: '0789',
  estado:              'PENDIENTE',
  campana_id:          'CAMP-TEST-VISUAL-2026',
  canal_orden:         'correo,whatsapp,llamada',
  canal_actual:        'correo',
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SENDGRID_API_KEY) {
    console.error('❌ Variables de entorno faltantes. Ejecutar con --env-file=.env.local')
    process.exit(1)
  }

  const token         = crypto.randomUUID()
  const linkExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  console.log(`\n⏳ Insertando paciente ficticio en producción...`)
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/registros`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ ...PACIENTE, token, link_expires_at: linkExpiresAt }),
  })

  if (!insertRes.ok) {
    console.error('❌ Error Supabase:', insertRes.status, await insertRes.text())
    process.exit(1)
  }

  const url = `${BASE_URL}/utle?t=${token}`
  console.log(`✅ Registro creado\n🔗 URL: ${url}\n`)

  let html = fs.readFileSync(path.join(__dirname, 'mailchimp_template_ccss.html'), 'utf-8')
  html = html.replace(/\*\|FNAME\|\*/g,         '-FNAME-')
  html = html.replace(/\*\|MMERGE6\|\*/g,        '-LINK-')
  html = html.replace(/\*\|EMAIL\|\*/g,           '-EMAIL-')
  html = html.replace(/\*\|UNSUB\|\*/g,           CONTACTO)
  html = html.replace(/\*\|UPDATE_PROFILE\|\*/g,  CONTACTO)

  const payload = {
    personalizations: [{
      to: [{ email: PACIENTE.correo, name: PACIENTE.nombre_paciente }],
      substitutions: {
        '-FNAME-': 'María Fernanda',
        '-LINK-':  url,
        '-EMAIL-': PACIENTE.correo,
      },
    }],
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
  }

  console.log(`📤 Enviando a ${PACIENTE.correo}...`)
  const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (sgRes.status === 202) {
    console.log(`✅ Correo enviado (202 Accepted)`)
    console.log(`   Paciente: ${PACIENTE.nombre_paciente}`)
    console.log(`   Para:     ${PACIENTE.correo}`)
    console.log(`   🔗 ${url}\n`)
  } else {
    const data = await sgRes.json().catch(() => sgRes.text())
    console.error('❌ Error SendGrid:', sgRes.status, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

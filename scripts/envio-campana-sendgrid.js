#!/usr/bin/env node
/**
 * Envío de campaña CCSS UTLE vía SendGrid.
 * Una sola llamada a la API, independientemente del número de destinatarios.
 * Uso: node --env-file=.env.local scripts/envio-campana-sendgrid.js
 */

const fs   = require('fs')
const path = require('path')

const API_KEY   = process.env.SENDGRID_API_KEY
const FROM      = 'gm_utle_gelisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'La CCSS le solicita actualizar su información en lista de espera'
const BASE_URL  = 'https://ccss-utle-preprod.netlify.app'
const CONTACTO  = 'mailto:gm_utle_gelisespera@ccss.sa.cr'

// Destinatarios de la campaña TEST-EQUIPO-2026-06-12
const DESTINATARIOS = [
  {
    nombre: 'Mariam Naranjo Bustos',
    email:  'comercial.cr@cocotech.ai',
    link:   `${BASE_URL}/utle?t=a01a712b-1980-4e83-8635-043194b58bc8`,
  },
  {
    nombre: 'Andrés David Zapata Cano',
    email:  'a.zapata@cocotech.ai',
    link:   `${BASE_URL}/utle?t=131ee041-0ac1-4ef2-bfe2-b3686d2fa5ed`,
  },
]

async function main() {
  if (!API_KEY) {
    console.error('❌ SENDGRID_API_KEY no definida en .env.local')
    process.exit(1)
  }

  const templatePath = path.join(__dirname, 'mailchimp_template_ccss.html')
  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template no encontrado: scripts/mailchimp_template_ccss.html')
    process.exit(1)
  }

  // Reemplazar tags de Mailchimp con tokens de sustitución de SendGrid
  let html = fs.readFileSync(templatePath, 'utf-8')
  html = html.replace(/\*\|FNAME\|\*/g,          '-FNAME-')
  html = html.replace(/\*\|MMERGE6\|\*/g,        '-LINK-')
  html = html.replace(/\*\|EMAIL\|\*/g,           '-EMAIL-')
  html = html.replace(/\*\|UNSUB\|\*/g,           CONTACTO)
  html = html.replace(/\*\|UPDATE_PROFILE\|\*/g,  CONTACTO)

  const personalizations = DESTINATARIOS.map(d => ({
    to: [{ email: d.email, name: d.nombre }],
    substitutions: {
      '-FNAME-':  d.nombre.split(' ')[0],
      '-LINK-':   d.link,
      '-EMAIL-':  d.email,
    },
  }))

  const payload = {
    personalizations,
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
  }

  console.log(`\n📤 Enviando a ${DESTINATARIOS.length} destinatarios en una sola llamada...`)

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (res.status === 202) {
    console.log('✅ Correos enviados exitosamente (202 Accepted)\n')
    DESTINATARIOS.forEach(d => console.log(`   ✓ ${d.nombre} <${d.email}>`))
    console.log()
  } else {
    const data = await res.json()
    console.error('❌ Error:', res.status, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

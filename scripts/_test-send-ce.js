#!/usr/bin/env node
/**
 * Prueba de envío CE — valida nuevo remitente gm_utle_glisespera@ccss.sa.cr
 * Usa plantilla correcta: UTLE_template_ccss aprobacion.html (NO mailchimp)
 * Simula paciente Consulta Externa para validar antes del envío automático CE-01
 *
 * Uso: node --env-file=.env.local scripts/_test-send-ce.js
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

const ID_PRUEBA = 'REG-TEST-CE-ANDRES-2026'

const PACIENTE = {
  id_registro:         ID_PRUEBA,
  nombre_paciente:     'Andrés Zapata',
  cedula_raw:          '900000001',
  numero_asegurado:    '900000001',
  correo:              'a.zapata@cocotech.ai',
  telefono:            null,
  especialidad:        'Cardiología',
  centro_medico:       'Hospital San Juan de Dios',
  tipo_atencion:       'consulta',
  nombre_servicio:     'Consulta Externa - Cardiología',
  fecha_cita:          '2026-09-15',
  hora_cita:           '08:30',
  ultimos_4_asegurado: '0001',
  estado:              'PENDIENTE',
  campana_id:          'CAMP-TEST-CE-2026',
  canal_orden:         'correo,whatsapp,llamada',
  canal_actual:        'correo',
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SENDGRID_API_KEY) {
    console.error('❌ Variables de entorno faltantes. Ejecutar con --env-file=.env.local')
    process.exit(1)
  }

  // 1. Limpiar registros de prueba anteriores
  console.log('\n🗑️  Limpiando registros de prueba anteriores...')
  for (const id of ['REG-TEST-ANDRES-2026', ID_PRUEBA]) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/registros?id_registro=eq.${id}`,
      {
        method:  'DELETE',
        headers: {
          'apikey':        SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Prefer':        'return=minimal',
        },
      }
    )
    if (res.ok) console.log(`   ✅ ${id} eliminado (si existía)`)
    else        console.log(`   ⚠️  ${id}: status ${res.status}`)
  }

  // 2. Insertar registro de prueba con link de 90 días
  const token         = crypto.randomUUID()
  const linkExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  console.log(`\n⏳ Insertando ${ID_PRUEBA}...`)
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
  console.log(`✅ Registro creado`)
  console.log(`🔗 URL: ${url}\n`)

  // 3. Cargar plantilla correcta — sin conversión Mailchimp
  const templatePath = path.join(__dirname, 'UTLE_template_ccss aprobacion.html')
  let html
  try {
    html = fs.readFileSync(templatePath, 'utf-8')
  } catch (e) {
    console.error('❌ No se encontró la plantilla:', templatePath)
    process.exit(1)
  }

  if (html.includes('*|')) {
    console.error('❌ La plantilla contiene tags Mailchimp — archivo incorrecto')
    process.exit(1)
  }
  console.log('✅ Plantilla cargada: UTLE_template_ccss aprobacion.html (sin tags Mailchimp)')

  // 4. Construir payload con substituciones SendGrid (-FNAME-, -LINK-, -EMAIL-)
  const payload = {
    personalizations: [{
      to: [{ email: PACIENTE.correo, name: PACIENTE.nombre_paciente }],
      substitutions: {
        '-FNAME-': 'Andrés',
        '-LINK-':  url,
        '-EMAIL-': PACIENTE.correo,
      },
    }],
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
  }

  // 5. Enviar
  console.log(`📤 Enviando a ${PACIENTE.correo} desde ${FROM}...`)
  const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (sgRes.status === 202) {
    console.log('\n✅ Correo enviado (202 Accepted)')
    console.log(`   Para:      ${PACIENTE.correo}`)
    console.log(`   Desde:     ${FROM}`)
    console.log(`   Asunto:    ${SUBJECT}`)
    console.log(`   Plantilla: UTLE_template_ccss aprobacion.html`)
    console.log(`   Link:      ${url}`)
  } else {
    const data = await sgRes.json().catch(() => sgRes.text())
    console.error('❌ Error SendGrid:', sgRes.status, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

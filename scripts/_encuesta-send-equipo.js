#!/usr/bin/env node
/**
 * _encuesta-send-equipo.js
 *
 * Test pre-producción del template de encuesta CCSS UTLE.
 * Inserta un registro real en Supabase para cada miembro del equipo
 * (con token funcional) y envía el correo de encuesta personalizado.
 *
 * Uso: node --env-file=.env.local scripts/_encuesta-send-equipo.js
 */

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !SENDGRID_API_KEY) {
  console.error('❌ Variables de entorno faltantes. Usar --env-file=.env.local')
  process.exit(1)
}

const BASE_URL    = 'https://ccss.cocoreservas.com'
const FROM        = 'gm_utle_glisespera@ccss.sa.cr'
const FROM_NAME   = 'CCSS - Lista de Espera'
const SUBJECT     = 'La CCSS le solicita actualizar su información en lista de espera'
const CAMPANA_ID  = 'CAMP-TEST-ENCUESTA-2026'

// ── Equipo ─────────────────────────────────────────────────────────────────────
// Datos clínicos ficticios para que el formulario tenga sentido
// 3 cirugías · 2 consultas · 2 procedimientos — cubre los tres flujos en un solo test
const EQUIPO = [
  {
    id_registro:         'REG-TEST-ENCUESTA-ANDRES',
    nombre_paciente:     'Andrés David Zapata Cano',
    numero_asegurado:    '1128401918',
    correo:              'a.zapata@cocotech.ai',
    telefono:            null,
    especialidad:        'Cirugía General',
    centro_medico:       'Hospital México',
    tipo_atencion:       'cirugia',
    nombre_servicio:     'Cirugía General',
    ultimos_4_asegurado: '1918',
  },
  {
    id_registro:         'REG-TEST-ENCUESTA-MARIAMN',
    nombre_paciente:     'Mariam Naranjo Bustos',
    numero_asegurado:    '402060165',
    correo:              'comercial.cr@cocotech.ai',
    telefono:            null,
    especialidad:        'Medicina Interna',
    centro_medico:       'Hospital San Juan de Dios',
    tipo_atencion:       'consulta',
    nombre_servicio:     'Consulta Externa - Medicina Interna',
    ultimos_4_asegurado: '0165',
  },
  {
    id_registro:         'REG-TEST-ENCUESTA-MAURICIO',
    nombre_paciente:     'Mauricio Paba',
    numero_asegurado:    '80422081',
    correo:              'mauricio.paba@cocotech.ai',
    telefono:            null,
    especialidad:        'Radiología',
    centro_medico:       'Hospital Calderón Guardia',
    tipo_atencion:       'procedimiento',
    nombre_servicio:     'Ultrasonido Abdominal',
    ultimos_4_asegurado: '2081',
  },
  {
    id_registro:         'REG-TEST-ENCUESTA-JEANCARLO',
    nombre_paciente:     'Jeancarlo Chacón Villalobos',
    numero_asegurado:    '114150004',
    correo:              'jcchacov@ccss.sa.cr',
    telefono:            null,
    especialidad:        'Oftalmología',
    centro_medico:       'Hospital México',
    tipo_atencion:       'cirugia',
    nombre_servicio:     'Cirugía Oftalmológica',
    ultimos_4_asegurado: '0004',
  },
  {
    id_registro:         'REG-TEST-ENCUESTA-MARIAMC',
    nombre_paciente:     'Mariam Castillo Carvajal',
    numero_asegurado:    '114130264',
    correo:              'mcastillc@ccss.sa.cr',
    telefono:            null,
    especialidad:        'Gastroenterología',
    centro_medico:       'Hospital San Juan de Dios',
    tipo_atencion:       'procedimiento',
    nombre_servicio:     'Endoscopía Digestiva Alta',
    ultimos_4_asegurado: '0264',
  },
  {
    id_registro:         'REG-TEST-ENCUESTA-RODRIGO',
    nombre_paciente:     'Enué Rodrigo Arrieta Espinoza',
    numero_asegurado:    '503400320',
    correo:              'erarriet@ccss.sa.cr',
    telefono:            null,
    especialidad:        'Cardiología',
    centro_medico:       'Hospital Calderón Guardia',
    tipo_atencion:       'consulta',
    nombre_servicio:     'Consulta Externa - Cardiología',
    ultimos_4_asegurado: '0320',
  },
  {
    id_registro:         'REG-TEST-ENCUESTA-KATHERINE',
    nombre_paciente:     'Katherine Colby Jiménez',
    numero_asegurado:    '402110069',
    correo:              'kcolby@ccss.sa.cr',
    telefono:            null,
    especialidad:        'Ginecología y Obstetricia',
    centro_medico:       'Hospital de las Mujeres Dr. Adolfo Carit Eva',
    tipo_atencion:       'cirugia',
    nombre_servicio:     'Cirugía Ginecológica',
    ultimos_4_asegurado: '0069',
  },
]

// ── Template ───────────────────────────────────────────────────────────────────
const templatePath = path.join(__dirname, 'UTLE_template_ccss aprobacion.html')
if (!fs.existsSync(templatePath)) {
  console.error('❌ Template no encontrado:', templatePath)
  process.exit(1)
}
const htmlTemplate = fs.readFileSync(templatePath, 'utf-8')

// ── Helpers ────────────────────────────────────────────────────────────────────
const sleep        = ms => new Promise(r => setTimeout(r, ms))
const primerNombre = nombre => (nombre ?? '').trim().split(/\s+/)[0] || ''

async function upsertRegistro(paciente, token, linkExpiresAt) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/registros`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      ...paciente,
      cedula_raw:      paciente.numero_asegurado.replace(/\D/g, ''),
      token,
      link_expires_at: linkExpiresAt,
      estado:          'PENDIENTE',
      campana_id:      CAMPANA_ID,
      canal_orden:     'correo,whatsapp,llamada',
      canal_actual:    'correo',
      warmup_estado:   'enviado',   // Test — se asume que el warmup ya fue
    }),
  })
  return res.ok
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📧 Test encuesta — enviando a ${EQUIPO.length} miembros del equipo\n`)

  const linkExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  let ok = 0, err = 0

  for (const paciente of EQUIPO) {
    const token = crypto.randomUUID()
    const link  = `${BASE_URL}/utle?t=${token}`
    const fname = primerNombre(paciente.nombre_paciente)

    process.stdout.write(`  ${paciente.nombre_paciente} <${paciente.correo}>`)

    // 1. Upsert en Supabase
    const inserted = await upsertRegistro(paciente, token, linkExpiresAt)
    if (!inserted) {
      console.log(' ❌ Supabase error — skip')
      err++
      continue
    }

    // 2. Enviar vía SendGrid (llamada individual por destinatario para tests)
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: paciente.correo, name: paciente.nombre_paciente }],
          substitutions: {
            '-FNAME-': fname,
            '-LINK-':  link,
            '-EMAIL-': paciente.correo,
          },
        }],
        from:    { email: FROM, name: FROM_NAME },
        subject: SUBJECT,
        content: [{ type: 'text/html', value: htmlTemplate }],
      }),
    })

    if (sgRes.status === 202) {
      console.log(` ✅`)
      console.log(`     🔗 ${link}`)
      ok++
    } else {
      const txt = await sgRes.text()
      console.log(` ❌ SendGrid ${sgRes.status}: ${txt.slice(0, 120)}`)
      err++
    }

    await sleep(500) // Pausa cortesía entre envíos individuales
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`✅ Test completado — ${ok} enviados, ${err} errores`)
  console.log(`   Campaña: ${CAMPANA_ID} | Expira: ${new Date(linkExpiresAt).toLocaleDateString('es-CR')}`)
  console.log()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

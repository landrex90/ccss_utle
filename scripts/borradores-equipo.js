#!/usr/bin/env node
/**
 * Crea un borrador individual de Mailchimp por cada contacto definido abajo.
 * Uso: node --env-file=.env.local scripts/borradores-equipo.js
 */

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')

const API_KEY   = process.env.MAILCHIMP_API_KEY
const LIST_ID   = process.env.MAILCHIMP_LIST_ID
const FROM_NAME = process.env.MAILCHIMP_FROM_NAME ?? 'CCSS - Lista de Espera'
const REPLY_TO  = process.env.MAILCHIMP_REPLY_TO  ?? 'noreply@ccss.sa.cr'
const SERVER    = API_KEY.split('-').pop()
const BASE_URL  = `https://${SERVER}.api.mailchimp.com/3.0`
const AUTH      = Buffer.from(`anystring:${API_KEY}`).toString('base64')

const SUBJECT   = 'La CCSS le solicita actualizar su información en lista de espera'
const CAMPANA   = 'Test_Equipo_2026-06-01'

const CONTACTOS = [
  {
    nombre: 'Andrés David Zapata Cano',
    email:  'adzapata8@hotmail.com',
    phone:  '',
    link:   'https://ccss-utle-preprod.netlify.app/utle?t=1d61750a-2a64-448f-b08b-1f9f29f48d67',
  },
  {
    nombre: 'Mauricio Paba',
    email:  'mauricio.paba@cocotech.ai',
    phone:  '+13056086788',
    link:   'https://ccss-utle-preprod.netlify.app/utle?t=74d87a99-6b21-466c-bd0d-f2ce7532aad9',
  },
  {
    nombre: 'Robert Parada',
    email:  'robert.parada@cocotech.ai',
    phone:  '3007212010',
    link:   'https://ccss-utle-preprod.netlify.app/utle?t=f1e62783-bf95-4a05-ae98-688ff08165e8',
  },
  {
    nombre: 'Jonnathan Pulgarin Muñoz',
    email:  'jpulgarinmau@gmail.com',
    phone:  '3192373942',
    link:   'https://ccss-utle-preprod.netlify.app/utle?t=eb642c43-67f7-4d31-8173-757d3d966e9d',
  },
]

async function mc(method, endpoint, body = null) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 204) return {}
  const data = await res.json()
  if (!res.ok) throw new Error(`MC ${method} ${endpoint} → ${res.status}: ${data.detail ?? data.title ?? JSON.stringify(data)}`)
  return data
}

function md5(str) {
  return crypto.createHash('md5').update(str.toLowerCase()).digest('hex')
}

async function main() {
  const templatePath = path.join(__dirname, 'mailchimp_template_ccss.html')
  if (!fs.existsSync(templatePath)) {
    console.error('Template no encontrado: scripts/mailchimp_template_ccss.html')
    process.exit(1)
  }
  const html = fs.readFileSync(templatePath, 'utf-8')

  console.log(`\n📋 ${CONTACTOS.length} borradores a crear\n`)

  for (const c of CONTACTOS) {
    const fname = c.nombre.split(' ')[0]
    const lname = c.nombre.split(' ').slice(1).join(' ')

    process.stdout.write(`👤 ${c.nombre}...`)

    // 1. Upsert contacto
    await mc('PUT', `/lists/${LIST_ID}/members/${md5(c.email)}`, {
      email_address: c.email,
      status_if_new: 'subscribed',
      merge_fields:  { FNAME: fname, LNAME: lname, PHONE: c.phone, MMERGE6: c.link, CAMPANA },
    })

    // 2. Crear campaña segmentada por email exacto
    const campaign = await mc('POST', '/campaigns', {
      type: 'regular',
      settings: {
        subject_line: SUBJECT,
        title:        `CCSS UTLE — ${c.nombre} — ${CAMPANA}`,
        from_name:    FROM_NAME,
        reply_to:     REPLY_TO,
      },
      recipients: {
        list_id:      LIST_ID,
        segment_opts: {
          match: 'all',
          conditions: [{
            condition_type: 'EmailAddress',
            field:          'EMAIL',
            op:             'is',
            value:          c.email,
          }],
        },
      },
    })

    // 3. Inyectar HTML
    await mc('PUT', `/campaigns/${campaign.id}/content`, { html })

    console.log(` ✓  (ID: ${campaign.id})`)
  }

  console.log('\n✅ 4 borradores creados. Revise Mailchimp > Campaigns > Drafts.\n')
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1) })

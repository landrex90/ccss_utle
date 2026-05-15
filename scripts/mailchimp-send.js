#!/usr/bin/env node
/**
 * Sincroniza pacientes con Mailchimp y crea (opcionalmente envía) una campaña.
 *
 * Uso:
 *   node --env-file=.env.local scripts/mailchimp-send.js <urls_csv> [opciones]
 *
 * Opciones:
 *   --tag "Nombre"        Tag de Mailchimp para etiquetar contactos y segmentar la campaña
 *   --subject "Texto"     Asunto del correo (requerido con --draft o --send)
 *   --campana ID          Etiqueta interna CCSS (merge field CAMPANA, para reportes)
 *   --draft               Crea la campaña como borrador en Mailchimp
 *   --send                Crea Y envía la campaña (pide confirmación)
 *
 * Variables de entorno requeridas:
 *   MAILCHIMP_API_KEY     Clave API de Mailchimp (formato: key-us6)
 *   MAILCHIMP_LIST_ID     ID de la audiencia
 *
 * Variables de entorno opcionales:
 *   MAILCHIMP_FROM_NAME   Nombre del remitente (default: "CCSS - Lista de Espera")
 *   MAILCHIMP_REPLY_TO    Correo de respuesta (default: noreply@ccss.sa.cr)
 *
 * Ejemplos:
 *   # Sincronizar + etiquetar (sin campaña)
 *   node --env-file=.env.local scripts/mailchimp-send.js scripts/prueba_equipo_urls.csv \
 *     --tag "Prueba_UTLE" --campana 2026-05-05_Prueba_Equipo
 *
 *   # Sincronizar + crear borrador segmentado por tag
 *   node --env-file=.env.local scripts/mailchimp-send.js scripts/prueba_equipo_urls.csv \
 *     --tag "Prueba_UTLE" --campana 2026-05-05_Prueba_Equipo \
 *     --subject "La CCSS le solicita actualizar su información en lista de espera" \
 *     --draft
 *
 *   # Sincronizar + enviar
 *   node --env-file=.env.local scripts/mailchimp-send.js scripts/prueba_equipo_urls.csv \
 *     --tag "Prueba_UTLE" --campana 2026-05-05_Prueba_Equipo \
 *     --subject "La CCSS le solicita actualizar su información en lista de espera" \
 *     --send
 */

const fs       = require('fs')
const path     = require('path')
const crypto   = require('crypto')
const readline = require('readline')

// ── Arg parsing ───────────────────────────────────────────────────────────────
const args        = process.argv.slice(2)
const csvFile     = args.find(a => !a.startsWith('--') && a.endsWith('.csv'))
const tagIdx      = args.indexOf('--tag')
const tag         = tagIdx !== -1 ? args[tagIdx + 1] : null
const subjectIdx  = args.indexOf('--subject')
const subject     = subjectIdx !== -1 ? args[subjectIdx + 1] : null
const campanaIdx  = args.indexOf('--campana')
const campanaId   = campanaIdx !== -1 ? args[campanaIdx + 1] : null
const createDraft = args.includes('--draft') || args.includes('--send')
const doSend      = args.includes('--send')

if (!csvFile) {
  console.error('Uso: node --env-file=.env.local scripts/mailchimp-send.js <urls_csv> [--tag "Nombre"] [--subject "..."] [--campana ID] [--draft|--send]')
  process.exit(1)
}
if (!fs.existsSync(csvFile)) {
  console.error(`Archivo no encontrado: ${csvFile}`)
  process.exit(1)
}
if (createDraft && !subject) {
  console.error('Error: --subject es requerido cuando se usa --draft o --send')
  process.exit(1)
}

// ── Env vars ──────────────────────────────────────────────────────────────────
const API_KEY   = process.env.MAILCHIMP_API_KEY
const LIST_ID   = process.env.MAILCHIMP_LIST_ID
const FROM_NAME = process.env.MAILCHIMP_FROM_NAME ?? 'CCSS - Lista de Espera'
const REPLY_TO  = process.env.MAILCHIMP_REPLY_TO  ?? 'noreply@ccss.sa.cr'

if (!API_KEY) { console.error('Falta MAILCHIMP_API_KEY en .env.local'); process.exit(1) }
if (!LIST_ID) { console.error('Falta MAILCHIMP_LIST_ID en .env.local');  process.exit(1) }

const SERVER   = API_KEY.split('-').pop()
const BASE_URL = `https://${SERVER}.api.mailchimp.com/3.0`
const AUTH     = Buffer.from(`anystring:${API_KEY}`).toString('base64')

// ── Mailchimp API helper ──────────────────────────────────────────────────────
async function mc(method, endpoint, body = null) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 204) return {}
  const data = await res.json()
  if (!res.ok) {
    const detail = data.detail ?? data.title ?? JSON.stringify(data)
    throw new Error(`Mailchimp ${method} ${endpoint} → ${res.status}: ${detail}`)
  }
  return data
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let field = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(field.trim()); field = ''
    } else field += ch
  }
  result.push(field.trim())
  return result
}

function parseCSV(content) {
  const lines   = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿/, '').replace(/^"|"$/g, '').trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCSVLine(line)
    return headers.reduce((obj, h, i) => {
      obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim() || null
      return obj
    }, {})
  })
}

function chunk(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function md5(str) {
  return crypto.createHash('md5').update(str.toLowerCase()).digest('hex')
}

// ── Confirm prompt ────────────────────────────────────────────────────────────
function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()) })
  })
}

// ── Ensure required merge fields exist ───────────────────────────────────────
async function ensureMergeFields() {
  const { merge_fields } = await mc('GET', `/lists/${LIST_ID}/merge-fields?count=100`)
  const existing = new Set(merge_fields.map(f => f.tag))

  const required = [
    { tag: 'CAMPANA', name: 'Campaña', type: 'text' },
  ]

  for (const { tag, name, type } of required) {
    if (!existing.has(tag)) {
      await mc('POST', `/lists/${LIST_ID}/merge-fields`, { tag, name, type, required: false })
      console.log(`  + Merge field creado: ${tag}`)
    }
  }
}

// ── Resolve tag name → ID (crea el tag si no existe) ─────────────────────────
async function resolveTagId(tagName) {
  const { tags } = await mc('GET', `/lists/${LIST_ID}/tag-search?name=${encodeURIComponent(tagName)}`)
  const found = tags?.find(t => t.name === tagName)
  if (found) return found.id

  // El tag no existe: se creará automáticamente al aplicarlo a un miembro.
  // Devolvemos null para indicar que la búsqueda del ID se hace después.
  return null
}

// ── Aplicar tag a una lista de emails (en paralelo, lotes de 10) ──────────────
async function applyTagToMembers(emails, tagName) {
  let ok = 0, fail = 0
  for (const batch of chunk(emails, 10)) {
    const results = await Promise.allSettled(
      batch.map(email =>
        mc('POST', `/lists/${LIST_ID}/members/${md5(email)}/tags`, {
          tags: [{ name: tagName, status: 'active' }],
        })
      )
    )
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok++
      else { fail++; console.warn(`  ⚠️  ${batch[i]}: ${r.reason?.message}`) }
    })
  }
  console.log(`  ✓ Tag "${tagName}" aplicado: ${ok} ok  |  ${fail} error(es)`)
}

// ── Build Mailchimp member from a CSV row ─────────────────────────────────────
function buildMember(row, overrideCampana) {
  const email = (row.correo ?? row['Email Address'] ?? '').toLowerCase().trim()
  if (!email) return null

  const nombre  = row.nombre_paciente ?? ''
  const fname   = row['First Name'] ?? nombre.split(' ')[0] ?? ''
  const lname   = row['Last Name']  ?? nombre.split(' ').slice(1).join(' ') ?? ''
  const phone   = row.telefono  ?? row.PHONE         ?? ''
  const link    = row.url       ?? row.LINK_PERSONAL ?? ''
  const campana = overrideCampana ?? row.campana_id ?? row.CAMPANA ?? ''

  return {
    email_address: email,
    status_if_new: 'subscribed',
    merge_fields:  { FNAME: fname, LNAME: lname, PHONE: phone, MMERGE6: link, CAMPANA: campana },
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const content = fs.readFileSync(csvFile, 'utf-8')
  const rows    = parseCSV(content)

  // Si el CSV ya tiene campana_id asignados, filtrar por el indicado.
  // Si campana_id está vacío en todas las filas, usar todas (se les asigna --campana).
  const csvHasCampana = rows.some(r => r.campana_id || r.CAMPANA)
  const filtered = campanaId && csvHasCampana
    ? rows.filter(r => (r.campana_id ?? r.CAMPANA) === campanaId)
    : rows

  if (filtered.length === 0) {
    console.error(campanaId && csvHasCampana
      ? `No se encontraron registros con campana_id="${campanaId}" en el CSV`
      : 'El archivo CSV está vacío')
    process.exit(1)
  }

  console.log(`\n📋 ${filtered.length} contacto(s) a sincronizar`)
  if (tag)         console.log(`🏷️  Tag:     ${tag}`)
  if (campanaId)   console.log(`📣 Campaña: ${campanaId}`)
  if (createDraft) console.log(`📧 Asunto:  ${subject}`)
  if (doSend)           console.log('🚀 Modo:    ENVÍO INMEDIATO')
  else if (createDraft) console.log('📝 Modo:    BORRADOR')
  else                  console.log('🔄 Modo:    solo sincronizar contactos')

  // ── Confirmación para envío real ──────────────────────────────────────────
  if (doSend) {
    const ans = await confirm(`\n⚠️  Está a punto de ENVIAR un correo a ${filtered.length} persona(s). ¿Confirma? (si/no): `)
    if (ans !== 'si' && ans !== 's') {
      console.log('Operación cancelada.')
      process.exit(0)
    }
  }

  // ── 1. Merge fields ───────────────────────────────────────────────────────
  console.log('\n🔧 Verificando merge fields...')
  await ensureMergeFields()
  console.log('  ✓ Merge fields listos')

  // ── 2. Batch upsert contactos (máx 500 por request) ──────────────────────
  console.log('\n📤 Sincronizando contactos...')
  const members = filtered.map(r => buildMember(r, campanaId)).filter(Boolean)
  let synced = 0, errored = 0

  for (const batch of chunk(members, 500)) {
    const result = await mc('POST', `/lists/${LIST_ID}`, {
      members: batch,
      update_existing: true,
    })
    synced  += (result.new_members?.length ?? 0) + (result.updated_members?.length ?? 0)
    errored += result.error_count ?? 0
    if (result.errors?.length) {
      result.errors.forEach(e => console.warn(`  ⚠️  ${e.email_address}: ${e.error}`))
    }
  }
  console.log(`  ✓ ${synced} sincronizados  |  ${errored} error(es)`)

  // ── 3. Aplicar tag de Mailchimp ───────────────────────────────────────────
  let tagId = null
  if (tag) {
    console.log(`\n🏷️  Aplicando tag "${tag}"...`)
    const emails = members.map(m => m.email_address)
    await applyTagToMembers(emails, tag)
    tagId = await resolveTagId(tag)
  }

  if (!createDraft) {
    console.log('\n✅ Sincronización completa.\n   Use --draft para crear borrador o --send para enviar directamente.\n')
    return
  }

  // ── 4. Leer template HTML ─────────────────────────────────────────────────
  const templatePath = path.join(path.dirname(path.resolve(csvFile)), 'mailchimp_template_ccss.html')
  if (!fs.existsSync(templatePath)) {
    console.error(`Template no encontrado: ${templatePath}`)
    console.error('Asegúrese de que mailchimp_template_ccss.html esté en la misma carpeta que el CSV.')
    process.exit(1)
  }
  const html = fs.readFileSync(templatePath, 'utf-8')

  // ── 5. Crear campaña ──────────────────────────────────────────────────────
  console.log('\n📧 Creando campaña en Mailchimp...')
  const campaignTitle = campanaId ?? tag ?? `CCSS_UTLE_${new Date().toISOString().slice(0, 10)}`

  // Segmentar por tag (preferido) o por merge field CAMPANA como fallback
  let segmentOpts = {}
  if (tag && tagId) {
    segmentOpts = {
      segment_opts: {
        match: 'all',
        conditions: [{
          condition_type: 'StaticSegment',
          field:          'static_segment',
          op:             'static_is',
          value:          tagId,
        }],
      },
    }
  } else if (campanaId) {
    segmentOpts = {
      segment_opts: {
        match: 'all',
        conditions: [{
          condition_type: 'TextMerge',
          field:          'CAMPANA',
          op:             'is',
          value:          campanaId,
        }],
      },
    }
  }

  const campaign = await mc('POST', '/campaigns', {
    type: 'regular',
    recipients: { list_id: LIST_ID, ...segmentOpts },
    settings: {
      subject_line: subject,
      from_name:    FROM_NAME,
      reply_to:     REPLY_TO,
      title:        campaignTitle,
    },
  })

  // ── 6. Asignar contenido HTML ─────────────────────────────────────────────
  await mc('PUT', `/campaigns/${campaign.id}/content`, { html })
  console.log(`  ✓ Campaña creada: "${campaignTitle}"`)
  console.log(`  ID: ${campaign.id}`)

  // ── 7. Enviar o dejar como borrador ───────────────────────────────────────
  if (doSend) {
    console.log('\n🚀 Enviando campaña...')
    await mc('POST', `/campaigns/${campaign.id}/actions/send`)
    console.log('  ✓ Campaña enviada exitosamente\n')
  } else {
    console.log('\n✅ Borrador listo en Mailchimp.')
    console.log('   Revíselo en Campaigns antes de enviarlo.\n')
  }
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`)
  process.exit(1)
})

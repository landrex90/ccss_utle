#!/usr/bin/env node
/**
 * Validación masiva de números de WhatsApp via Infobip
 * Lee BD Borrador, limpia teléfonos, consulta Infobip /whatsapp/2/contacts
 *
 * NO envía mensajes — es una consulta silenciosa de metadatos.
 * No afecta la reputación del número ni activa el chatbot.
 *
 * Uso:
 *   node --env-file=.env.local scripts/_wa-validate-phones.js
 *   node --env-file=.env.local scripts/_wa-validate-phones.js --limit=10   (prueba con 10 registros)
 *   node --env-file=.env.local scripts/_wa-validate-phones.js --dry-run    (solo limpieza, sin llamar Infobip)
 *
 * Salida: scripts/_wa-validation-results.json  +  scripts/_wa-validation-results.csv
 */

const XLSX = require('xlsx')
const fs   = require('fs')
const path = require('path')

// ── Configuración ──────────────────────────────────────────────────────────────
const INFOBIP_BASE    = (process.env.INFOBIP_BASE_URL || 'https://grwjne.api.infobip.com').replace(/\/$/, '')
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY
const COUNTRY_CODE    = '506'   // Costa Rica
const BATCH_SIZE      = 100     // Infobip recomienda máx 100 por request
const DELAY_MS        = 1200    // pausa entre batches

const EXCEL_PATH  = path.join(__dirname, '../Carpeta Correos Socialización, Infografia UTLE y logo CLEO/Base de datos BOT Borrador.xlsx')
const OUT_JSON    = path.join(__dirname, '_wa-validation-results.json')
const OUT_CSV     = path.join(__dirname, '_wa-validation-results.csv')

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT   = (() => {
  const arg = process.argv.find(a => a.startsWith('--limit='))
  return arg ? parseInt(arg.split('=')[1]) : null
})()

// ── Limpieza de teléfonos ──────────────────────────────────────────────────────
function extraerTelefono(arca1, siac) {
  // 1. ARCA1 — si es exactamente 8 dígitos
  const a1 = String(arca1 || '').replace(/\D/g, '').trim()
  if (/^\d{8}$/.test(a1)) return COUNTRY_CODE + a1

  // 2. SIAC — puede tener múltiples números separados por / o espacios
  const siacStr = String(siac || '')
  const candidatos = siacStr.split(/[/,;]/).map(s => s.replace(/\D/g, '').trim())
  for (const c of candidatos) {
    if (/^\d{8}$/.test(c)) return COUNTRY_CODE + c
    // Si viene con 506 adelante (11 dígitos)
    if (/^506\d{8}$/.test(c)) return c
  }

  return null
}

// ── Llamada a Infobip ──────────────────────────────────────────────────────────
async function checkBatch(numeros) {
  const res = await fetch(`${INFOBIP_BASE}/whatsapp/2/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `App ${INFOBIP_API_KEY}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: JSON.stringify({ contacts: numeros }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }

  return res.json()
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !INFOBIP_API_KEY) {
    console.error('❌ INFOBIP_API_KEY no encontrada en el entorno.')
    console.error('   Agrega INFOBIP_API_KEY=App xxx... a .env.local')
    process.exit(1)
  }

  console.log('📂 Leyendo BD Borrador...')
  const wb   = XLSX.readFile(EXCEL_PATH)
  const ws   = wb.Sheets['BD']
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const rows = data.slice(1)

  // Filtrar solo "Selección SI"
  const si = rows.filter(r => r[42] === 'SI')
  console.log(`   Total pacientes SI: ${si.length.toLocaleString()}`)

  // Extraer y limpiar teléfonos
  const pacientes = []
  for (const r of si) {
    const idUtle       = r[1]
    const nombre       = [r[14], r[15], r[16]].filter(Boolean).join(' ')
    const identificacion = String(r[13] || '')
    const eje          = r[0]
    const tel          = extraerTelefono(r[19], r[21])

    if (tel) {
      pacientes.push({ id_utle: idUtle, nombre, identificacion, eje, telefono: tel })
    }
  }

  console.log(`   Con teléfono extraíble: ${pacientes.length.toLocaleString()}`)
  console.log(`   Sin teléfono:           ${(si.length - pacientes.length).toLocaleString()}`)

  const muestra = LIMIT ? pacientes.slice(0, LIMIT) : pacientes
  if (LIMIT) console.log(`\n⚠️  Modo prueba: procesando solo ${LIMIT} registros`)
  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — primeros 10 teléfonos extraídos:')
    muestra.slice(0, 10).forEach(p => console.log(`   ${p.telefono}  →  ${p.nombre}`))
    console.log('\n✅ Dry run completado. Sin llamadas a Infobip.')
    return
  }

  // ── Procesar en batches ────────────────────────────────────────────────────
  const totalBatches = Math.ceil(muestra.length / BATCH_SIZE)
  console.log(`\n🚀 Validando ${muestra.length.toLocaleString()} números en ${totalBatches} batches de ${BATCH_SIZE}`)
  console.log(`   Base URL: ${INFOBIP_BASE}\n`)

  const results = []
  let validos = 0, invalidos = 0, errores = 0

  for (let i = 0; i < muestra.length; i += BATCH_SIZE) {
    const batch    = muestra.slice(i, i + BATCH_SIZE)
    const numeros  = batch.map(p => p.telefono)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const pct      = Math.round((i / muestra.length) * 100)

    process.stdout.write(`   Batch ${String(batchNum).padStart(3)}/${totalBatches} [${pct}%]... `)

    try {
      const resp = await checkBatch(numeros)

      // Infobip devuelve contacts[] con status por número
      const contactMap = {}
      for (const c of (resp.contacts || [])) {
        contactMap[c.phoneNumber] = c
      }

      for (const p of batch) {
        const num  = p.telefono
        const info = contactMap[num] || {}
        const ok   = info.status === 'valid'
        if (ok) validos++; else invalidos++
        results.push({
          id_utle:        p.id_utle,
          nombre:         p.nombre,
          identificacion: p.identificacion,
          eje:            p.eje,
          telefono:       p.telefono,
          whatsapp_valid: ok,
          wa_id:          info.waId || null,
          infobip_status: info.status || 'unknown',
        })
      }
      console.log(`✅ ${batch.filter((_, idx) => (contactMap[batch[idx]?.telefono]?.status === 'valid')).length} válidos`)

    } catch (err) {
      errores += batch.length
      console.log(`❌ ERROR: ${err.message}`)
      for (const p of batch) {
        results.push({ ...p, whatsapp_valid: null, wa_id: null, infobip_status: 'error' })
      }
    }

    if (i + BATCH_SIZE < muestra.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  // ── Guardar resultados ─────────────────────────────────────────────────────
  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2))

  const csvHeader = 'id_utle,nombre,identificacion,eje,telefono,whatsapp_valid,wa_id,infobip_status'
  const csvRows = results.map(r =>
    [r.id_utle, `"${r.nombre}"`, r.identificacion, r.eje, r.telefono,
     r.whatsapp_valid, r.wa_id || '', r.infobip_status].join(',')
  )
  fs.writeFileSync(OUT_CSV, [csvHeader, ...csvRows].join('\n'))

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📊 RESUMEN FINAL`)
  console.log(`   Números validados: ${muestra.length.toLocaleString()}`)
  console.log(`   ✅ Con WhatsApp:    ${validos.toLocaleString()} (${Math.round(validos/muestra.length*100)}%)`)
  console.log(`   ❌ Sin WhatsApp:    ${invalidos.toLocaleString()} (${Math.round(invalidos/muestra.length*100)}%)`)
  if (errores) console.log(`   ⚠️  Errores API:    ${errores}`)
  console.log(`   📁 JSON:  scripts/_wa-validation-results.json`)
  console.log(`   📁 CSV:   scripts/_wa-validation-results.csv`)
  console.log(`${'─'.repeat(50)}\n`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

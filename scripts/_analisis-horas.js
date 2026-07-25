#!/usr/bin/env node
/**
 * Análisis de horas de respuesta y acceso
 * Muestra distribución horaria de encuestas completadas y primer acceso al link
 * Uso: node --env-file=.env.local scripts/_analisis-horas.js
 */

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

const CR_OFFSET = -6 // UTC-6 Costa Rica

function getHourCR(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  return ((d.getUTCHours() + 24 + CR_OFFSET) % 24)
}

function bar(count, max, width = 30) {
  const filled = Math.round((count / max) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pad(n) { return String(n).padStart(2, '0') }

async function fetchAll(field) {
  const PAGE_SIZE = 1000
  let from = 0
  const results = []

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/registros?select=${field}&${field}=not.is.null&limit=${PAGE_SIZE}&offset=${from}`,
      {
        headers: {
          'apikey':        SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    )
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break
    results.push(...data.map(r => r[field]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return results
}

async function main() {
  console.log('\n📊 ANÁLISIS DE HORAS DE RESPUESTA — CCSS UTLE\n')
  console.log('Consultando BD...')

  const [completadas, accesos, clicks] = await Promise.all([
    fetchAll('encuesta_completada_at'),
    fetchAll('primer_acceso_at'),
    fetchAll('correo_click_at'),
  ])

  console.log(`\n   Encuestas completadas : ${completadas.length.toLocaleString()}`)
  console.log(`   Primer acceso al link  : ${accesos.length.toLocaleString()}`)
  console.log(`   Clicks en correo       : ${clicks.length.toLocaleString()}`)

  function distribution(timestamps, label) {
    const counts = new Array(24).fill(0)
    for (const ts of timestamps) {
      const h = getHourCR(ts)
      if (h !== null) counts[h]++
    }
    const max = Math.max(...counts)
    const total = timestamps.length

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`⏰  ${label} (hora CR, n=${total.toLocaleString()})`)
    console.log(`${'─'.repeat(60)}`)

    // Agrupar en bloques para mejor lectura
    for (let h = 0; h < 24; h++) {
      const pct = total > 0 ? ((counts[h] / total) * 100).toFixed(1) : '0.0'
      const b   = bar(counts[h], max || 1)
      const tag = counts[h] === max && max > 0 ? ' ◀ PICO' : ''
      console.log(`  ${pad(h)}:00  ${b} ${String(counts[h]).padStart(5)}  (${pct}%)${tag}`)
    }

    // Top 5 horas
    const ranked = counts
      .map((c, h) => ({ h, c }))
      .filter(x => x.c > 0)
      .sort((a, b) => b.c - a.c)
      .slice(0, 5)

    console.log(`\n  🏆 Top horas:`)
    ranked.forEach(({ h, c }, i) => {
      const pct = ((c / total) * 100).toFixed(1)
      console.log(`     ${i + 1}. ${pad(h)}:00–${pad(h + 1)}:00  →  ${c.toLocaleString()} (${pct}%)`)
    })
  }

  distribution(completadas, 'Encuestas completadas')
  distribution(accesos,     'Primer acceso al link')
  distribution(clicks,      'Clicks en correo (correo_click_at)')

  console.log(`\n${'─'.repeat(60)}`)
  console.log('✅ Análisis completado')
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

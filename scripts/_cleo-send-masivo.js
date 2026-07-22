#!/usr/bin/env node
/**
 * Envío masivo CLEO — socialización Lista de Espera CCSS
 * Lee el Excel, deduplica correos, envía en lotes de 1,000 con 10s de pausa.
 * Uso: node --env-file=.env.local scripts/_cleo-send-masivo.js
 */

const XLSX = require('xlsx')

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const FROM      = 'gm_utle_glisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'La CCSS lo contactará pronto: conozca a CLEO, su nuevo asistente virtual de Listas de espera'
const IMG_URL   = 'https://ccss.cocoreservas.com/infografia/UTLE.png'
const EXCEL_PATH = './Carpeta Correos Socialización, Infografia UTLE y logo CLEO/Correos electronicos BOT socializacion.xlsx'
const BATCH_SIZE  = 1000
const DELAY_MS    = 10000  // 10 segundos entre lotes

// ── HTML del correo ────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>La CCSS informa: Plan piloto CLEO</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#eef2f6;">
    La Caja Costarricense de Seguro Social informa sobre el inicio del plan piloto de CLEO, su nuevo asistente virtual.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#eef2f6;">
    <tr>
      <td align="center" style="padding:28px 12px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background-color:#ffffff;
                      border-radius:4px;overflow:hidden;
                      box-shadow:0 1px 8px rgba(0,75,131,0.10);">
          <tr>
            <td style="padding:0;line-height:0;">
              <img src="${IMG_URL}"
                   alt="La CCSS informa: ¡Inicia el plan piloto de CLEO!"
                   width="600"
                   style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;margin-top:16px;">
          <tr>
            <td style="text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                         color:#7a90a0;line-height:1.6;">
                Caja Costarricense de Seguro Social &middot; Gerencia M&eacute;dica<br>
                Unidad T&eacute;cnica de Listas de Espera<br>
                <a href="mailto:gm_utle_glisespera@ccss.sa.cr"
                   style="color:#004B83;text-decoration:none;">
                  gm_utle_glisespera@ccss.sa.cr
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

// ── Utilidades ─────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Leer y limpiar Excel ───────────────────────────────────────────────────
function loadEmails(filePath) {
  console.log(`\n📂 Leyendo ${filePath}...`)
  const wb   = XLSX.readFile(filePath)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const seen = new Set()
  let invalidos = 0

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i]
    const siac = (row[1] || '').toString().trim().toLowerCase()
    const arca = (row[2] || '').toString().trim().toLowerCase()

    for (const email of [siac, arca]) {
      if (!email || seen.has(email)) continue
      if (!EMAIL_RE.test(email)) { invalidos++; continue }
      seen.add(email)
    }
  }

  const lista = [...seen]
  console.log(`   Total filas:      ${rows.length - 1}`)
  console.log(`   Emails válidos:   ${lista.length}`)
  console.log(`   Inválidos/dup:    ${invalidos}`)
  return lista
}

// ── Enviar un lote ─────────────────────────────────────────────────────────
async function sendBatch(emails, batchNum, total) {
  const payload = {
    personalizations: emails.map(e => ({ to: [{ email: e }] })),
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  })

  const ok = res.status === 202
  const pct = ((batchNum / total) * 100).toFixed(1)
  if (ok) {
    console.log(`   ✅ Lote ${String(batchNum).padStart(2,'0')}/${total} — ${emails.length} correos — HTTP 202 [${pct}%]`)
  } else {
    const txt = await res.text().catch(() => '')
    console.error(`   ❌ Lote ${batchNum}/${total} — HTTP ${res.status}: ${txt}`)
  }
  return ok
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY faltante. Ejecutar con --env-file=.env.local')
    process.exit(1)
  }

  const emails  = loadEmails(EXCEL_PATH)
  const lotes   = chunk(emails, BATCH_SIZE)
  const total   = lotes.length
  let enviados  = 0
  let fallidos  = 0

  console.log(`\n🚀 Iniciando envío masivo`)
  console.log(`   Lista:   ${emails.length} correos`)
  console.log(`   Lotes:   ${total} × ${BATCH_SIZE}`)
  console.log(`   Pausa:   ${DELAY_MS / 1000}s entre lotes`)
  console.log(`   Tiempo estimado: ~${Math.ceil((total * DELAY_MS) / 60000)} minutos\n`)

  for (let i = 0; i < lotes.length; i++) {
    const ok = await sendBatch(lotes[i], i + 1, total)
    if (ok) enviados += lotes[i].length
    else    fallidos += lotes[i].length

    if (i < lotes.length - 1) await sleep(DELAY_MS)
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📊 RESUMEN FINAL`)
  console.log(`   Enviados:  ${enviados}`)
  console.log(`   Fallidos:  ${fallidos}`)
  console.log(`   Lotes:     ${total}`)
  console.log(`${'─'.repeat(50)}\n`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

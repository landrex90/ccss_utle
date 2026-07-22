#!/usr/bin/env node
/**
 * Test piloto — correo de socialización CLEO (imagen como cuerpo)
 * Uso: node --env-file=.env.local scripts/_cleo-send-test.js
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const FROM      = 'gm_utle_glisespera@ccss.sa.cr'
const FROM_NAME = 'CCSS - Lista de Espera'
const SUBJECT   = 'La CCSS lo contactará pronto: conozca a CLEO, su nuevo asistente virtual de Listas de espera'
const IMG_URL   = 'https://ccss.cocoreservas.com/infografia/UTLE.png'

// ── Destinatarios del piloto ───────────────────────────────────────────────
const PILOTO = [
  { email: 'a.zapata@cocotech.ai',       name: 'Andres Zapata' },
  { email: 'comercial.cr@cocotech.ai',   name: 'Mariam Naranjo Bustos' },
  { email: 'mcastillc@ccss.sa.cr',       name: 'Mariam Castillo Carvajal' },
  { email: 'jcchacov@ccss.sa.cr',        name: 'Jeancarlo Chacón' },
  { email: 'mauricio.paba@cocotech.ai',  name: 'Mauricio Paba' },
  { email: 'erarriet@ccss.sa.cr',        name: 'Enué Rodrigo Arrieta Espinoza' },
  { email: 'kcolby@ccss.sa.cr',          name: 'Katherine Colby Jiménez' },
  { email: 'mbreneso@ccss.sa.cr',        name: 'María José Brenes Otarola' },
]

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
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#eef2f6;">
    La Caja Costarricense de Seguro Social informa sobre el inicio del plan piloto de CLEO, su nuevo asistente virtual.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#eef2f6;">
    <tr>
      <td align="center" style="padding:28px 12px 40px;">

        <!-- Contenedor imagen -->
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

        <!-- Pie institucional -->
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

async function sendBatch(recipients) {
  const payload = {
    personalizations: recipients.map(r => ({
      to: [{ email: r.email, name: r.name || r.email }],
    })),
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return res.status
}

async function main() {
  if (!SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY faltante. Ejecutar con --env-file=.env.local')
    process.exit(1)
  }

  console.log(`\n📤 Enviando piloto a ${PILOTO.length} destinatario(s)...`)
  for (const r of PILOTO) {
    console.log(`   → ${r.name} <${r.email}>`)
  }

  const status = await sendBatch(PILOTO)

  if (status === 202) {
    console.log(`\n✅ Enviado correctamente (202 Accepted)`)
    console.log(`   Asunto: ${SUBJECT}`)
    console.log(`   Imagen: ${IMG_URL}\n`)
  } else {
    console.error(`❌ Error SendGrid: HTTP ${status}`)
    process.exit(1)
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

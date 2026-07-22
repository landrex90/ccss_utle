#!/usr/bin/env node
/**
 * Informe de campaña CLEO — envío a equipo UTLE + COCO
 * Adjunta Analisis_BD_Campaña_CLEO.xlsx + resumen del envío masivo
 * Uso: node --env-file=.env.local scripts/_cleo-send-informe.js
 */

const fs   = require('fs')
const path = require('path')
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const FROM      = 'a.zapata@cocotech.ai'
const FROM_NAME = 'Andres Zapata — COCOTECH'
const SUBJECT   = 'Informe CLEO: Análisis de base de datos y envío masivo completado ✅'

const DESTINATARIOS = [
  { email: 'mcastillc@ccss.sa.cr',      name: 'Ing. Mariam Castillo Carvajal' },
  { email: 'jcchacov@ccss.sa.cr',        name: 'Jeancarlo Chacón' },
  { email: 'erarriet@ccss.sa.cr',        name: 'Enué Rodrigo Arrieta Espinoza' },
  { email: 'kcolby@ccss.sa.cr',          name: 'Katherine Colby Jiménez' },
  { email: 'mbreneso@ccss.sa.cr',        name: 'María José Brenes Otarola' },
  { email: 'a.zapata@cocotech.ai',       name: 'Andres Zapata' },
  { email: 'comercial.cr@cocotech.ai',   name: 'Mariam Naranjo Bustos' },
  { email: 'mauricio.paba@cocotech.ai',  name: 'Mauricio Paba' },
  { email: 'natalia@cocotech.ai',        name: 'Natalia Correa' },
]

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe CLEO — Campaña de Socialización</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;">
    <tr><td align="center" style="padding:32px 16px 48px;">

      <!-- Contenedor principal -->
      <table role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(0,75,131,.10);">

        <!-- Header -->
        <tr>
          <td style="background:#004B83;padding:28px 36px;">
            <p style="margin:0;color:#a8c8f0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">
              CCSS · Gerencia Médica · UTLE &nbsp;|&nbsp; Campaña CLEO
            </p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.25;">
              Informe: Socialización CLEO
            </h1>
            <p style="margin:6px 0 0;color:#a8c8f0;font-size:13px;">4 de julio, 2026</p>
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="padding:32px 36px;">

            <p style="margin:0 0 16px;font-size:15px;color:#1a2533;line-height:1.6;">
              Estimado equipo,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#1a2533;line-height:1.6;">
              A continuación el resumen ejecutivo de la campaña de socialización del asistente virtual <strong>CLEO</strong>,
              incluyendo el análisis de la base de datos de correos y el resultado del envío masivo completado el día de hoy.
            </p>

            <!-- Sección 1: Análisis BD -->
            <table role="presentation" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="border-left:4px solid #004B83;padding-left:14px;padding-bottom:4px;">
                  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#004B83;">
                    Análisis de la base de datos
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 14px;font-size:14px;color:#1a2533;line-height:1.6;">
              Se procesó el archivo <strong>Correos electronicos BOT socializacion.xlsx</strong> con doble columna de correo (fuentes SIAC y ARCA), aplicando validación de formato y deduplicación:
            </p>

            <!-- Stats -->
            <table role="presentation" width="100%" style="margin-bottom:24px;border-collapse:separate;border-spacing:8px 0;">
              <tr>
                <td style="background:#e8f0f8;border-radius:6px;padding:16px;text-align:center;width:33%;">
                  <span style="display:block;font-size:26px;font-weight:700;color:#004B83;line-height:1;">92,060</span>
                  <span style="display:block;font-size:11px;color:#5a6a7e;margin-top:4px;">Registros totales</span>
                </td>
                <td style="background:#e8f0f8;border-radius:6px;padding:16px;text-align:center;width:33%;">
                  <span style="display:block;font-size:26px;font-weight:700;color:#004B83;line-height:1;">58,218</span>
                  <span style="display:block;font-size:11px;color:#5a6a7e;margin-top:4px;">Correos válidos únicos</span>
                </td>
                <td style="background:#fff4e5;border-radius:6px;padding:16px;text-align:center;width:33%;border:1px solid #f0c060;">
                  <span style="display:block;font-size:26px;font-weight:700;color:#b05a00;line-height:1;">36.8%</span>
                  <span style="display:block;font-size:11px;color:#7a5010;margin-top:4px;">Sin correo alcanzable</span>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#1a2533;">
              <strong>Dominios principales:</strong> gmail.com (75.6% · 43,988), hotmail.com (10.7% · 6,241), yahoo.com (3.6% · 2,108), ccss.sa.cr (1.8% · 1,047).
            </p>
            <p style="margin:0 0 28px;font-size:13px;color:#5a6a7e;">
              El desglose completo por eje asistencial y top 30 dominios se encuentra en el archivo adjunto.
            </p>

            <!-- Sección 2: Resultado envío -->
            <table role="presentation" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="border-left:4px solid #1a7f4e;padding-left:14px;padding-bottom:4px;">
                  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a7f4e;">
                    Resultado del envío masivo
                  </p>
                </td>
              </tr>
            </table>

            <!-- Resultado box -->
            <table role="presentation" width="100%" style="background:#e6f4ec;border-radius:6px;border:1px solid #a3d5be;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%">
                    <tr>
                      <td style="font-size:13px;color:#1a2533;padding:4px 0;"><strong>Correos enviados</strong></td>
                      <td style="font-size:13px;color:#1a7f4e;font-weight:700;text-align:right;padding:4px 0;">58,218 ✅</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#1a2533;padding:4px 0;"><strong>Errores</strong></td>
                      <td style="font-size:13px;color:#1a7f4e;font-weight:700;text-align:right;padding:4px 0;">0 ✅</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#1a2533;padding:4px 0;"><strong>Lotes ejecutados</strong></td>
                      <td style="font-size:13px;color:#1a2533;text-align:right;padding:4px 0;">59 × 1,000 correos</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#1a2533;padding:4px 0;"><strong>Remitente</strong></td>
                      <td style="font-size:13px;color:#1a2533;text-align:right;padding:4px 0;">gm_utle_glisespera@ccss.sa.cr</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#1a2533;padding:4px 0;"><strong>Autenticación</strong></td>
                      <td style="font-size:13px;color:#1a2533;text-align:right;padding:4px 0;">SPF · DKIM · DMARC ✅</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#1a2533;padding:4px 0;"><strong>Fecha</strong></td>
                      <td style="font-size:13px;color:#1a2533;text-align:right;padding:4px 0;">4 de julio, 2026</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Siguiente paso -->
            <table role="presentation" width="100%" style="background:#e8f0f8;border-radius:6px;margin-bottom:8px;">
              <tr>
                <td style="padding:16px 20px;font-size:13px;color:#1a2533;line-height:1.6;">
                  <strong style="color:#004B83;">Siguiente paso:</strong> monitorear las métricas de entregabilidad en SendGrid (tasas de apertura, rebotes y spam) durante los próximos 2-3 días. Con base en los resultados, se definirá la estrategia del envío interactivo de encuestas individuales de la Lista de Espera.
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f7fa;padding:20px 36px;border-top:1px solid #d0dcea;">
            <p style="margin:0;font-size:11px;color:#7a90a0;line-height:1.6;text-align:center;">
              Caja Costarricense de Seguro Social · Gerencia Médica · Unidad Técnica de Listas de Espera<br>
              Soporte técnico: COCOTECH · <a href="mailto:a.zapata@cocotech.ai" style="color:#004B83;text-decoration:none;">a.zapata@cocotech.ai</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`

async function main() {
  if (!SENDGRID_API_KEY) {
    console.error('❌ SENDGRID_API_KEY faltante.')
    process.exit(1)
  }

  // ── Adjunto Excel ──────────────────────────────────────────────────────────
  const excelPath = path.join(
    __dirname,
    '../Carpeta Correos Socialización, Infografia UTLE y logo CLEO/Analisis_BD_Campaña_CLEO.xlsx'
  )
  if (!fs.existsSync(excelPath)) {
    console.error('❌ Archivo Excel no encontrado:', excelPath)
    process.exit(1)
  }
  const excelB64 = fs.readFileSync(excelPath).toString('base64')
  console.log(`📎 Excel adjunto: ${(fs.statSync(excelPath).size / 1024 / 1024).toFixed(1)} MB`)

  // ── Payload SendGrid ───────────────────────────────────────────────────────
  const payload = {
    personalizations: [
      {
        to: DESTINATARIOS.map(d => ({ email: d.email, name: d.name })),
      },
    ],
    from:    { email: FROM, name: FROM_NAME },
    subject: SUBJECT,
    content: [{ type: 'text/html', value: html }],
    attachments: [
      {
        content:     excelB64,
        filename:    'Analisis_BD_Campaña_CLEO.xlsx',
        type:        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: 'attachment',
      },
    ],
  }

  console.log(`\n📤 Enviando informe a ${DESTINATARIOS.length} destinatarios...`)
  DESTINATARIOS.forEach(d => console.log(`   → ${d.name} <${d.email}>`))

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  if (res.status === 202) {
    console.log(`\n✅ Informe enviado correctamente (202 Accepted)`)
    console.log(`   Asunto: ${SUBJECT}\n`)
  } else {
    const txt = await res.text().catch(() => '')
    console.error(`❌ Error SendGrid: HTTP ${res.status}`, txt)
    process.exit(1)
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })

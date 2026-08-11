import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clasificarIvr, normalizarIvrRespuesta, parseFechaInfobip } from '@/lib/infobip-mappers'
import { createHmac, timingSafeEqual } from 'crypto'

// ── Auth ──────────────────────────────────────────────────────────────────────
// Infobip usa header x-hub-signature con formato "SHA256=<hex_uppercase>"
function verifyRequest(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.INFOBIP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[infobip-llamadas] INFOBIP_WEBHOOK_SECRET no configurado')
    return false
  }

  const sigHeader = req.headers.get('x-hub-signature')
  if (!sigHeader) return false

  const sig      = sigHeader.startsWith('SHA256=') ? sigHeader.slice(7) : sigHeader
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex').toUpperCase()
  const expBuf   = Buffer.from(expected)
  const gotBuf   = Buffer.from(sig.toUpperCase())
  if (expBuf.length !== gotBuf.length) return false
  return timingSafeEqual(expBuf, gotBuf)
}

// ── Mapper de campos ──────────────────────────────────────────────────────────
// Infobip flow callback: {"results":[{..., "callbackData":"{...}", ...}]}
// callbackData contiene la "Carga útil de datos" configurada en el flujo (id_registro_utle, etc.)
// Los IVR Mapped Responses vienen en campos separados del result object
function extractFields(body: Record<string, unknown>) {
  // Desempaquetar results array
  const results = Array.isArray(body['results']) ? body['results'] : null
  const r = (results?.[0] ?? body) as Record<string, unknown>

  const status     = String(r['status']     ?? r['Status']     ?? body['status']     ?? '').trim() || null
  const answeredBy = String(r['answeredBy'] ?? r['Answered By'] ?? r['answered_by']  ?? '').trim() || null
  const sendAtRaw  = r['sentAt'] ?? r['sendAt'] ?? r['Send At'] ?? r['send_at'] ?? body['sentAt']
  const sendAt     = parseFechaInfobip(sendAtRaw)

  // IVR Mapped Responses — campo en el result object
  let mapped: Record<string, unknown> = {}
  const ivrRaw = r['ivrMappedResponses'] ?? r['IVR Mapped Responses'] ?? r['ivr_mapped_responses'] ?? body['ivrMappedResponses']
  if (ivrRaw) {
    try { mapped = typeof ivrRaw === 'string' ? JSON.parse(ivrRaw) : (ivrRaw as Record<string, unknown>) } catch { /* empty */ }
  }

  // callbackData = "Carga útil de datos" del flujo (JSON string)
  let payload: Record<string, unknown> = {}
  const callbackRaw = r['callbackData'] ?? r['dataPayload'] ?? body['callbackData'] ?? body['dataPayload'] ?? body['Data Payload']
  if (callbackRaw) {
    try { payload = typeof callbackRaw === 'string' ? JSON.parse(callbackRaw) : (callbackRaw as Record<string, unknown>) } catch { /* empty */ }
  }

  const idRaw = String(
    payload['id_registro_utle'] ??
    payload['externalPersonId'] ??
    r['externalPersonId'] ??
    body['externalPersonId'] ??
    ''
  ).trim()

  return { status, answeredBy, sendAt, mapped, payload, idRaw, raw: r }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifyRequest(rawBody, req)) {
    console.error('[infobip-llamadas] Firma HMAC inválida — request rechazado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Log completo para verificar campos IVR en siguientes pruebas
  console.log('[infobip-llamadas] payload:', JSON.stringify(body).slice(0, 1500))

  const { status, answeredBy, sendAt, mapped, payload, idRaw, raw } = extractFields(body)

  if (status === 'Pending') {
    return NextResponse.json({ ok: true, skipped: 'pending' })
  }

  if (!idRaw) {
    console.error('[infobip-llamadas] id_registro_utle ausente. callbackData keys:', Object.keys(payload), 'result keys:', Object.keys(raw))
    return NextResponse.json({ error: 'id_registro_utle requerido' }, { status: 422 })
  }

  const idNum = parseInt(idRaw, 10)
  if (isNaN(idNum)) {
    return NextResponse.json({ error: 'id_registro_utle inválido' }, { status: 422 })
  }

  const clas = clasificarIvr(mapped, status, answeredBy)

  const sb = createClient()

  const updReg: Record<string, unknown> = {
    llamada_estado:     clas.llamadaEstado,
    llamada_enviada_at: sendAt,
  }
  if (clas.estadoRegistro) updReg.estado = clas.estadoRegistro
  const esDefinitiva = clas.estadoFinal === 'ACTIVO' || clas.estadoFinal === 'DEPURADO_RENUNCIA' || clas.estadoFinal === 'NO_AUTORIZO'
  if (esDefinitiva && sendAt) updReg.encuesta_completada_at = sendAt

  const { error: errReg } = await sb.from('registros').update(updReg).eq('id_registro', idNum)
  if (errReg) {
    console.error('[infobip-llamadas] update registros:', errReg.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (clas.hasInteraction) {
    const respuesta = { id_registro: idNum, ...normalizarIvrRespuesta(mapped, payload, clas) }
    const { error: errResp } = await sb
      .from('respuestas')
      .upsert(respuesta, { onConflict: 'id_registro, canal', ignoreDuplicates: false })
    if (errResp) console.error('[infobip-llamadas] upsert respuestas:', errResp.message)
  }

  console.log(`[infobip-llamadas] ✓ id=${idNum} estado=${clas.estadoFinal ?? clas.llamadaEstado}`)
  return NextResponse.json({ ok: true, id_registro: idNum, estado: clas.estadoFinal ?? clas.llamadaEstado })
}

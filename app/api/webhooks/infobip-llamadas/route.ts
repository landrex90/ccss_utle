import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clasificarIvr, normalizarIvrRespuesta, parseFechaInfobip } from '@/lib/infobip-mappers'
import { createHmac, timingSafeEqual } from 'crypto'

// ── Auth ──────────────────────────────────────────────────────────────────────
// Infobip enviará el secreto en un header — ajustar nombre del header cuando lo confirmen
// Soportamos HMAC-SHA256 (esperado) y token estático (fallback simple)
function verifyRequest(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.INFOBIP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[infobip-llamadas] INFOBIP_WEBHOOK_SECRET no configurado')
    return false
  }

  // Intento 1: HMAC-SHA256 en X-Infobip-Signature
  const sigHeader = req.headers.get('x-infobip-signature')
  if (sigHeader) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const expBuf   = Buffer.from(expected)
    const gotBuf   = Buffer.from(sigHeader)
    if (expBuf.length === gotBuf.length) {
      return timingSafeEqual(expBuf, gotBuf)
    }
    return false
  }

  // Intento 2: token estático en Authorization header (Bearer <secret>)
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '')
    return token === secret
  }

  return false
}

// ── Mapper de campos del webhook ──────────────────────────────────────────────
// Cubre camelCase y snake_case — ajustar si Infobip usa otros nombres
function extractFields(body: Record<string, unknown>) {
  const status     = String(body['status']      ?? body['Status']      ?? '').trim() || null
  const answeredBy = String(body['answeredBy']  ?? body['Answered By'] ?? body['answered_by'] ?? '').trim() || null
  const sendAtRaw  = body['sendAt'] ?? body['Send At'] ?? body['send_at'] ?? body['startTime'] ?? body['Start Time']
  const sendAt     = parseFechaInfobip(sendAtRaw)

  let mapped: Record<string, unknown> = {}
  const ivrRaw = body['ivrMappedResponses'] ?? body['IVR Mapped Responses'] ?? body['ivr_mapped_responses']
  if (ivrRaw) {
    try { mapped = typeof ivrRaw === 'string' ? JSON.parse(ivrRaw) : (ivrRaw as Record<string, unknown>) } catch { /* leave empty */ }
  }

  let payload: Record<string, unknown> = {}
  const payloadRaw = body['dataPayload'] ?? body['Data Payload'] ?? body['data_payload']
  if (payloadRaw) {
    try { payload = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : (payloadRaw as Record<string, unknown>) } catch { /* leave empty */ }
  }

  // id_registro_utle puede venir en el dataPayload o directamente en el body
  const idRaw = String(
    payload['id_registro_utle'] ??
    payload['externalPersonId'] ??
    body['externalPersonId'] ??
    body['external_person_id'] ??
    ''
  ).trim()

  return { status, answeredBy, sendAt, mapped, payload, idRaw }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Log headers para diagnosticar qué envía Infobip (remover cuando auth esté confirmada)
  const allHeaders: Record<string, string> = {}
  req.headers.forEach((v, k) => { allHeaders[k] = v })
  console.log('[infobip-llamadas] headers:', JSON.stringify(allHeaders))
  console.log('[infobip-llamadas] body preview:', rawBody.slice(0, 300))

  if (!verifyRequest(rawBody, req)) {
    console.warn('[infobip-llamadas] Firma inválida — headers arriba para diagnóstico')
    // Temporalmente: aceptar de todas formas para ver el payload del primer request real
    // TODO: cambiar a return 401 cuando se confirme el header de firma de Infobip
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status, answeredBy, sendAt, mapped, payload, idRaw } = extractFields(body)

  // Ignorar eventos intermedios (Infobip puede enviar Pending antes del resultado final)
  if (status === 'Pending') {
    return NextResponse.json({ ok: true, skipped: 'pending' })
  }

  if (!idRaw) {
    console.error('[infobip-llamadas] id_registro_utle ausente en payload:', JSON.stringify(body).slice(0, 200))
    return NextResponse.json({ error: 'id_registro_utle requerido' }, { status: 422 })
  }

  const idNum = parseInt(idRaw, 10)
  if (isNaN(idNum)) {
    return NextResponse.json({ error: 'id_registro_utle inválido' }, { status: 422 })
  }

  const clas = clasificarIvr(mapped, status, answeredBy)

  const sb = createClient()

  // Actualizar registro
  const updReg: Record<string, unknown> = {
    llamada_estado:     clas.llamadaEstado,
    llamada_enviada_at: sendAt,
  }
  if (clas.estadoRegistro)  updReg.estado = clas.estadoRegistro
  const esDefinitiva = clas.estadoFinal === 'ACTIVO' || clas.estadoFinal === 'DEPURADO_RENUNCIA' || clas.estadoFinal === 'NO_AUTORIZO'
  if (esDefinitiva && sendAt) updReg.encuesta_completada_at = sendAt

  const { error: errReg } = await sb.from('registros').update(updReg).eq('id_registro', idNum)
  if (errReg) {
    console.error('[infobip-llamadas] update registros:', errReg.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Upsert respuesta si hubo interacción
  if (clas.hasInteraction) {
    const respuesta = { id_registro: idNum, ...normalizarIvrRespuesta(mapped, payload, clas) }
    const { error: errResp } = await sb
      .from('respuestas')
      .upsert(respuesta, { onConflict: 'id_registro, canal', ignoreDuplicates: false })
    if (errResp) {
      console.error('[infobip-llamadas] upsert respuestas:', errResp.message)
    }
  }

  console.log(`[infobip-llamadas] id=${idNum} estado=${clas.estadoFinal ?? clas.llamadaEstado}`)
  return NextResponse.json({ ok: true, id_registro: idNum, estado: clas.estadoFinal ?? clas.llamadaEstado })
}

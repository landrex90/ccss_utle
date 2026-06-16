import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FormAnswers } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body: FormAnswers = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'token requerido' }, { status: 400 })
    }

    const supabase = createClient()

    // Resolver token → registro (nunca viaja en la URL)
    const { data: reg, error: regError } = await supabase
      .from('registros')
      .select('id_registro, verification_token, verification_token_expires_at')
      .eq('token', token)
      .single()

    if (regError || !reg) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
    }

    // Verificar que la identidad fue validada en servidor para cualquier respuesta
    // que pase del paso 1 (excepto NO_AUTORIZO y NO_VERIFICADO que no requieren verificación)
    const skipVerification = body.estado_final === 'NO_AUTORIZO' || body.estado_final === 'NO_VERIFICADO'
    if (!skipVerification) {
      if (!body.verification_token || body.verification_token !== reg.verification_token) {
        return NextResponse.json({ error: 'Verificación de identidad requerida' }, { status: 403 })
      }
      if (!reg.verification_token_expires_at || new Date(reg.verification_token_expires_at) < new Date()) {
        return NextResponse.json({ error: 'La sesión de verificación ha expirado' }, { status: 403 })
      }
    }

    const ESTADOS_VALIDOS = [
      'ACTIVO', 'NO_AUTORIZO', 'NO_VERIFICADO',
      'INFO_INCORRECTA', 'DEPURADO_RENUNCIA', 'NO_ASEGURADO', 'DEPURADO',
    ]

    if (body.estado_final && !ESTADOS_VALIDOS.includes(body.estado_final)) {
      return NextResponse.json({ error: 'Estado final inválido' }, { status: 400 })
    }

    const id_registro = reg.id_registro

    // Insertar respuesta
    const { error: insertError } = await supabase.from('respuestas').insert({
      id_registro,
      canal: body.canal ?? 'correo',
      paso_1_consentimiento: body.paso_1_consentimiento ?? null,
      paso_2_verificacion: body.paso_2_verificacion ?? null,
      paso_2_intentos: body.paso_2_intentos ?? null,
      paso_3_info_correcta: body.paso_3_info_correcta ?? null,
      paso_4_desea_continuar: body.paso_4_desea_continuar ?? null,
      motivo_retiro: body.motivo_retiro ?? null,
      paso_5a_flexibilidad_centro: body.paso_5a_flexibilidad_centro ?? null,
      paso_5b_condiciones_asistir: body.paso_5b_condiciones_asistir ?? null,
      paso_5b_motivo_no_asistir: body.paso_5b_motivo_no_asistir ?? null,
      paso_6_medio_contacto: body.paso_6_medio_contacto ?? null,
      estado_final: body.estado_final ?? null,
      completado: body.completado ?? false,
      paso_abandono: body.paso_abandono ?? null,
    })

    if (insertError) {
      console.error('Error inserting respuesta:', insertError)
      return NextResponse.json({ error: 'Error al guardar respuesta' }, { status: 500 })
    }

    // Actualizar estado del registro
    if (body.estado_final) {
      const { error: updateError } = await supabase
        .from('registros')
        .update({
          estado: body.estado_final,
          ...(body.completado ? { encuesta_completada_at: new Date().toISOString() } : {}),
        })
        .eq('id_registro', id_registro)
      if (updateError) {
        console.error('Error updating estado registro:', updateError)
      }
    }

    // Reenviar webhook a COCO si está configurado
    const webhookUrl = process.env.COCO_WEBHOOK_URL
    if (webhookUrl && webhookUrl.startsWith('https://')) {
      try {
        const { verification_token: _vt, ...safeBody } = body
        const whRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.COCO_WEBHOOK_SECRET
              ? { Authorization: `Bearer ${process.env.COCO_WEBHOOK_SECRET}` }
              : {}),
          },
          body: JSON.stringify({ ...safeBody, timestamp: new Date().toISOString() }),
        })
        if (!whRes.ok) {
          console.error(`Webhook forward failed: ${whRes.status} ${await whRes.text()}`)
        }
      } catch (err) {
        console.error('Webhook forward error:', err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

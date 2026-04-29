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

    // Resolver token → id_registro (nunca viaja en la URL)
    const { data: reg, error: regError } = await supabase
      .from('registros')
      .select('id_registro')
      .eq('token', token)
      .single()

    if (regError || !reg) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
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
      await supabase
        .from('registros')
        .update({ estado: body.estado_final })
        .eq('id_registro', id_registro)
    }

    // Reenviar webhook a COCO si está configurado
    const webhookUrl = process.env.COCO_WEBHOOK_URL
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.COCO_WEBHOOK_SECRET
            ? { Authorization: `Bearer ${process.env.COCO_WEBHOOK_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ ...body, timestamp: new Date().toISOString() }),
      }).catch((err) => console.error('Webhook forward error:', err))
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

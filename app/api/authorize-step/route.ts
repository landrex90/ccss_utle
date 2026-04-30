import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FormAnswers } from '@/lib/types'

const VALID_CONTACT = ['llamada', 'whatsapp', 'correo', 'sms', 'cualquiera']

function validateStepAnswer(fromStep: number, answers: Partial<FormAnswers>): string | null {
  switch (fromStep) {
    case 3:
      if (answers.paso_3_info_correcta !== 'si') return 'Respuesta del paso 3 inválida'
      return null
    case 4:
      if (answers.paso_4_desea_continuar !== 'si') return 'Respuesta del paso 4 inválida'
      return null
    case 5:
      if (!['si', 'no'].includes(answers.paso_5a_flexibilidad_centro ?? '')) return 'Respuesta de flexibilidad inválida'
      if (!['si', 'no'].includes(answers.paso_5b_condiciones_asistir ?? '')) return 'Respuesta de condiciones inválida'
      return null
    case 6:
      if (!VALID_CONTACT.includes(answers.paso_6_medio_contacto ?? '')) return 'Medio de contacto inválido'
      return null
    default:
      return 'Paso inválido'
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, verification_token, from_step, answers } = body

    if (!token || !verification_token || !from_step || !answers) {
      return NextResponse.json({ authorized: false, error: 'Parámetros faltantes' }, { status: 400 })
    }

    const supabase = createClient()

    // Resolver token → registro y validar verification_token
    const { data: reg, error } = await supabase
      .from('registros')
      .select('id_registro, verification_token, verification_token_expires_at')
      .eq('token', token)
      .single()

    if (error || !reg) {
      return NextResponse.json({ authorized: false, error: 'Registro no encontrado' }, { status: 403 })
    }

    if (!reg.verification_token || reg.verification_token !== verification_token) {
      return NextResponse.json({ authorized: false, error: 'Token de verificación inválido' }, { status: 403 })
    }

    if (!reg.verification_token_expires_at || new Date(reg.verification_token_expires_at) < new Date()) {
      return NextResponse.json({ authorized: false, error: 'Sesión expirada, por favor recargue la página' }, { status: 403 })
    }

    // Validar que la respuesta del paso actual es coherente para avanzar
    const answerError = validateStepAnswer(from_step, answers)
    if (answerError) {
      return NextResponse.json({ authorized: false, error: answerError }, { status: 403 })
    }

    return NextResponse.json({ authorized: true })
  } catch {
    return NextResponse.json({ authorized: false, error: 'Error interno' }, { status: 500 })
  }
}

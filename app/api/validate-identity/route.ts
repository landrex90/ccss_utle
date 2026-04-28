import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_ATTEMPTS = 3

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id_registro, digits } = body

    if (!id_registro || !digits) {
      return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 })
    }

    if (!/^\d{4}$/.test(digits)) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
    }

    const supabase = createClient()
    const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null

    // Contar intentos previos fallidos en el registro
    const { count } = await supabase
      .from('intentos_validacion')
      .select('*', { count: 'exact', head: true })
      .eq('id_registro', id_registro)
      .eq('exitoso', false)

    const attemptsSoFar = count ?? 0

    if (attemptsSoFar >= MAX_ATTEMPTS) {
      return NextResponse.json({ valid: false, attempts_remaining: 0, locked: true }, { status: 200 })
    }

    // Obtener los últimos 4 dígitos reales desde la BD (nunca expuesto al frontend)
    const { data: registro, error } = await supabase
      .from('registros')
      .select('ultimos_4_asegurado')
      .eq('id_registro', id_registro)
      .single()

    if (error || !registro) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
    }

    const valid = registro.ultimos_4_asegurado === digits

    // Registrar el intento
    await supabase.from('intentos_validacion').insert({
      id_registro,
      exitoso: valid,
      ip_address: ip,
    })

    if (valid) {
      return NextResponse.json({ valid: true })
    }

    const remaining = MAX_ATTEMPTS - (attemptsSoFar + 1)
    return NextResponse.json({ valid: false, attempts_remaining: remaining, locked: remaining === 0 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_ATTEMPTS = 3

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, digits } = body

    if (!token || !digits) {
      return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 })
    }

    if (!/^\d{4}$/.test(digits)) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
    }

    const supabase = createClient()
    const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null

    // Resolver token → id_registro + ultimos_4_asegurado (nunca expuesto al frontend)
    const { data: registro, error } = await supabase
      .from('registros')
      .select('id_registro, ultimos_4_asegurado, link_expires_at')
      .eq('token', token)
      .single()

    if (error || !registro) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
    }

    const { id_registro } = registro

    // Calcular cuándo se emitió el token actual (link_expires_at − 3 días)
    // Así, al refrescar el enlace el contador de intentos se reinicia automáticamente
    const tokenIssuedAt = new Date(
      new Date(registro.link_expires_at).getTime() - 3 * 24 * 60 * 60 * 1000
    ).toISOString()

    // Contar intentos fallidos solo desde la emisión del token vigente
    const { count } = await supabase
      .from('intentos_validacion')
      .select('*', { count: 'exact', head: true })
      .eq('id_registro', id_registro)
      .eq('exitoso', false)
      .gte('created_at', tokenIssuedAt)

    const attemptsSoFar = count ?? 0

    if (attemptsSoFar >= MAX_ATTEMPTS) {
      return NextResponse.json({ valid: false, attempts_remaining: 0, locked: true }, { status: 200 })
    }

    const valid = registro.ultimos_4_asegurado === digits

    // Registrar el intento
    await supabase.from('intentos_validacion').insert({
      id_registro,
      exitoso: valid,
      ip_address: ip,
    })

    if (valid) {
      const verificationToken = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2h

      await supabase
        .from('registros')
        .update({ verification_token: verificationToken, verification_token_expires_at: expiresAt })
        .eq('id_registro', id_registro)

      // Revalidar: releer la BD y confirmar que el token guardado pertenece a este mismo registro
      const { data: confirmado, error: confirmError } = await supabase
        .from('registros')
        .select('id_registro, verification_token')
        .eq('token', token)
        .eq('id_registro', id_registro)
        .eq('verification_token', verificationToken)
        .single()

      if (confirmError || !confirmado) {
        return NextResponse.json({ error: 'Error al confirmar verificación' }, { status: 500 })
      }

      return NextResponse.json({ valid: true, verification_token: confirmado.verification_token })
    }

    const remaining = MAX_ATTEMPTS - (attemptsSoFar + 1)
    return NextResponse.json({ valid: false, attempts_remaining: remaining, locked: remaining === 0 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

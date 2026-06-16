import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, getExpectedCookieValue } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const MAX_FAILED_ATTEMPTS = 5
const WINDOW_MINUTES       = 15

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: 'Contraseña requerida' }, { status: 400 })
    }

    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminPassword) {
      return NextResponse.json({ error: 'Configuración de servidor incompleta' }, { status: 500 })
    }

    const ip = request.headers.get('x-nf-client-connection-ip')
            ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim()
            ?? 'unknown'

    const supabase    = createClient()
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

    const { count: recentFails } = await supabase
      .from('admin_login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', windowStart)

    if ((recentFails ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Espere ${WINDOW_MINUTES} minutos.` },
        { status: 429 }
      )
    }

    const a     = Buffer.from(password)
    const b     = Buffer.from(adminPassword)
    const match = a.length === b.length && crypto.timingSafeEqual(a, b)

    if (!match) {
      await supabase.from('admin_login_attempts').insert({ ip_address: ip })
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
    }

    const sessionValue = getExpectedCookieValue()

    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, sessionValue, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return response
}

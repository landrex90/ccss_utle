import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_NAME, buildViewerToken, hashCedula } from '@/lib/viewer-auth'
import { validateOrigin } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
  }

  try {
    const { username, cedula } = await request.json()

    if (!username || !cedula) {
      return NextResponse.json({ error: 'Usuario y cédula requeridos' }, { status: 400 })
    }

    const supabase = createClient()

    const { data: user, error } = await supabase
      .from('viewer_users')
      .select('username, cedula_hash, activo')
      .eq('username', username.trim().toLowerCase())
      .single()

    if (error || !user || !user.activo) {
      return NextResponse.json({ error: 'Usuario o cédula incorrectos' }, { status: 401 })
    }

    const cedulaHash = hashCedula(cedula)
    if (user.cedula_hash !== cedulaHash) {
      return NextResponse.json({ error: 'Usuario o cédula incorrectos' }, { status: 401 })
    }

    const token    = buildViewerToken(user.username)
    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 horas
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

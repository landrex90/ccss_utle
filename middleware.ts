import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'admin_session'

// Edge Runtime usa Web Crypto API (no Node.js crypto)
async function computeExpectedCookie(): Promise<string> {
  const password = process.env.ADMIN_PASSWORD ?? ''
  const secret   = process.env.ADMIN_SESSION_SECRET ?? password
  const enc      = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookie = request.cookies.get(COOKIE)
    if (!cookie) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const expected = await computeExpectedCookie()
    if (cookie.value !== expected) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*',
}

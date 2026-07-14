import { NextRequest, NextResponse } from 'next/server'

const ADMIN_COOKIE  = 'admin_session'
const VIEWER_COOKIE = 'viewer_session'

// Edge Runtime usa Web Crypto API (no Node.js crypto)
async function computeAdminCookie(): Promise<string> {
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

// Viewer cookie = "{username}|{HMAC(VIEWER_SESSION_SECRET, username)}"
async function verifyViewerCookie(cookieValue: string): Promise<boolean> {
  const sep = cookieValue.lastIndexOf('|')
  if (sep < 0) return false
  const username = cookieValue.slice(0, sep)
  const received = cookieValue.slice(sep + 1)
  const secret = process.env.VIEWER_SESSION_SECRET ?? ''
  const enc    = new TextEncoder()
  const key    = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username))
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return received === expected
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookie = request.cookies.get(ADMIN_COOKIE)
    if (!cookie) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    const expected = await computeAdminCookie()
    if (cookie.value !== expected) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  if (pathname.startsWith('/estadisticas') && !pathname.startsWith('/estadisticas/login')) {
    const adminCookie  = request.cookies.get(ADMIN_COOKIE)
    const expectedAdmin = await computeAdminCookie()
    const adminValid   = adminCookie?.value === expectedAdmin

    if (!adminValid) {
      const viewerCookie = request.cookies.get(VIEWER_COOKIE)
      if (!viewerCookie || !(await verifyViewerCookie(viewerCookie.value))) {
        return NextResponse.redirect(new URL('/estadisticas/login', request.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/estadisticas/:path*'],
}

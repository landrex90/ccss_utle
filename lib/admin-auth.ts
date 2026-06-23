import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'admin_session'

const ALLOWED_ORIGINS = new Set([
  'https://ccss-utle-prod.netlify.app',
  'https://ccss-utle-preprod.netlify.app',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
])

// Returns true when the request comes from an allowed origin.
// Requests without an Origin header (server-to-server, curl) are allowed
// because they cannot carry session cookies set by the browser.
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  return ALLOWED_ORIGINS.has(origin)
}

// Node.js crypto is used here (not Web Crypto) because API Routes run on the
// Node.js runtime. middleware.ts uses crypto.subtle (Web Crypto) because it
// runs on Edge Runtime where Node.js built-ins are unavailable. Both must
// produce identical HMAC output or logins will appear valid but then fail on
// protected routes.
//
// Cookie value = HMAC-SHA256(ADMIN_SESSION_SECRET, ADMIN_PASSWORD) as hex.
// The cookie never carries the password. Rotating ADMIN_SESSION_SECRET
// invalidates all active sessions instantly.
export function getExpectedCookieValue(): string {
  const password = process.env.ADMIN_PASSWORD ?? ''
  const secret   = process.env.ADMIN_SESSION_SECRET ?? password
  return crypto.createHmac('sha256', secret).update(password).digest('hex')
}

function cookiesMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length) return false
    return crypto.timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

export function validateAdminSession(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE_NAME)
  if (!cookie) return false
  return cookiesMatch(cookie.value, getExpectedCookieValue())
}

export function validateAdminSessionServer(): boolean {
  try {
    const cookieStore = cookies()
    const cookie = cookieStore.get(COOKIE_NAME)
    if (!cookie) return false
    return cookiesMatch(cookie.value, getExpectedCookieValue())
  } catch {
    return false
  }
}

export { COOKIE_NAME }

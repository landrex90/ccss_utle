import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'admin_session'

// Computes HMAC-SHA256 of the password using ADMIN_SESSION_SECRET.
// The cookie never contains the password — only a cryptographic commitment.
// Rotating ADMIN_SESSION_SECRET instantly invalidates all active sessions.
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

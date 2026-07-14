import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'viewer_session'

// Cookie value = "{username}|{HMAC-SHA256(VIEWER_SESSION_SECRET, username)}"
// The HMAC binds the username to the secret — a forged username won't validate.
// Rotating VIEWER_SESSION_SECRET invalidates all viewer sessions instantly.

function getSecret(): string {
  return process.env.VIEWER_SESSION_SECRET ?? ''
}

export function buildViewerToken(username: string): string {
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(username)
    .digest('hex')
  return `${username}|${hmac}`
}

function verifyToken(token: string): string | null {
  const sep = token.lastIndexOf('|')
  if (sep < 0) return null
  const username = token.slice(0, sep)
  const received = token.slice(sep + 1)
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(username)
    .digest('hex')
  try {
    const a = Buffer.from(received, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return null
    return crypto.timingSafeEqual(a, b) ? username : null
  } catch {
    return null
  }
}

export function hashCedula(cedula: string): string {
  return crypto.createHash('sha256').update(cedula.trim()).digest('hex')
}

export function validateViewerSession(request: NextRequest): string | null {
  const cookie = request.cookies.get(COOKIE_NAME)
  if (!cookie) return null
  return verifyToken(cookie.value)
}

export function validateViewerSessionServer(): string | null {
  try {
    const cookieStore = cookies()
    const cookie = cookieStore.get(COOKIE_NAME)
    if (!cookie) return null
    return verifyToken(cookie.value)
  } catch {
    return null
  }
}

export { COOKIE_NAME }

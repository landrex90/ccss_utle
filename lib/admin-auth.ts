import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'

export function getExpectedCookieValue(): string {
  const password = process.env.ADMIN_PASSWORD ?? ''
  return Buffer.from(password).toString('base64')
}

/**
 * Validates the admin_session cookie in an API route (has access to request).
 */
export function validateAdminSession(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE_NAME)
  if (!cookie) return false
  try {
    const expected = getExpectedCookieValue()
    return cookie.value === expected
  } catch {
    return false
  }
}

/**
 * Validates the admin_session cookie in a Server Component (uses next/headers).
 */
export function validateAdminSessionServer(): boolean {
  try {
    const cookieStore = cookies()
    const cookie = cookieStore.get(COOKIE_NAME)
    if (!cookie) return false
    const expected = getExpectedCookieValue()
    return cookie.value === expected
  } catch {
    return false
  }
}

export { COOKIE_NAME }

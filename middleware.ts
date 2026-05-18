import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'admin_session'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookie = request.cookies.get(COOKIE)
    const expected = Buffer.from(
      process.env.ADMIN_PASSWORD ?? 'coco2026'
    ).toString('base64')

    if (!cookie || cookie.value !== expected) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*',
}

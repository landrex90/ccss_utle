import { redirect } from 'next/navigation'
import { validateAdminSessionServer } from '@/lib/admin-auth'
import Image from 'next/image'
import Link from 'next/link'
import LogoutClientButton from './LogoutClientButton'

export const metadata = {
  title: 'Panel COCO — CCSS UTLE',
  robots: 'noindex, nofollow',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isValid = validateAdminSessionServer()
  if (!isValid) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top nav */}
      <header className="bg-[#005d8f] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logos/ccss-logo-blanco.png"
              alt="CCSS Logo"
              width={40}
              height={40}
              className="flex-shrink-0"
            />
            <div>
              <span className="font-semibold text-base">CCSS UTLE — Panel COCO</span>
              <span className="ml-3 text-xs text-blue-200 hidden sm:inline">Operaciones de campaña</span>
            </div>
          </div>

          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded hover:bg-[#004268] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/campanas"
              className="px-3 py-1.5 rounded hover:bg-[#004268] transition-colors"
            >
              Campañas
            </Link>
            <Link
              href="/admin/importar"
              className="px-3 py-1.5 rounded hover:bg-[#004268] transition-colors"
            >
              Importar
            </Link>
            <Link
              href="/admin/resultados"
              className="px-3 py-1.5 rounded hover:bg-[#004268] transition-colors"
            >
              Resultados
            </Link>

            <div className="w-px h-5 bg-blue-400 mx-2" />

            <LogoutClientButton />
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

import Image from 'next/image'
import ViewerLogoutButton from './ViewerLogoutButton'

export const metadata = {
  title: 'Resultados CLEO — CCSS UTLE',
  robots: 'noindex, nofollow',
}

export default function EstadisticasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <header className="bg-[#004B83] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Image
            src="/logos/ccss-logo-blanco.png"
            alt="CCSS Logo"
            width={36}
            height={36}
            className="flex-shrink-0"
          />
          <div className="flex-1">
            <span className="font-semibold text-sm sm:text-base">CCSS UTLE — Resultados CLEO</span>
            <span className="ml-3 text-xs text-blue-200 hidden sm:inline">Solo lectura</span>
          </div>
          <ViewerLogoutButton />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  )
}

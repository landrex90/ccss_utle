import type { Metadata } from 'next'
import './globals.css'
import { A11yProvider }    from '@/lib/accessibility-context'
import AccessibilityMenu   from '@/components/AccessibilityMenu'

export const metadata: Metadata = {
  title:       'CCSS – Actualización Lista de Espera',
  description: 'Formulario de actualización de atención pendiente en lista de espera – Caja Costarricense de Seguro Social',
  robots:      'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <A11yProvider>
          <AccessibilityMenu />
          {children}
          <footer className="text-center py-4">
            <p className="text-xs text-gray-400 dark:text-gray-600">
              Plataforma desarrollada por{' '}
              <span className="font-medium text-gray-500 dark:text-gray-500">COCO Tech AI</span>
            </p>
          </footer>
        </A11yProvider>
      </body>
    </html>
  )
}

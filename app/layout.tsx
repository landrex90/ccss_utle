import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CCSS – Actualización Lista de Espera',
  description: 'Formulario de actualización de atención pendiente en lista de espera – Caja Costarricense de Seguro Social',
  robots: 'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  )
}

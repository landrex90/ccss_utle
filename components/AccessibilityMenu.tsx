'use client'

import { useState } from 'react'
import { useA11y } from '@/lib/accessibility-context'

export default function AccessibilityMenu() {
  const { theme, contrast, fontSize, toggleTheme, toggleContrast, cycleFontSize } = useA11y()
  const [open, setOpen] = useState(false)

  const fontLabel = { normal: 'A', large: 'A+', xlarge: 'A++' }[fontSize]

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Opciones de accesibilidad"
        className="a11y-toggle w-10 h-10 rounded-full bg-ccss-primary dark:bg-ccss-accent text-white shadow-lg
                   flex items-center justify-center hover:bg-ccss-dark transition-colors
                   focus:outline-none focus:ring-2 focus:ring-ccss-primary focus:ring-offset-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" strokeWidth="2"/>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
      </button>

      {/* Menu panel */}
      {open && (
        <div className="card dark:bg-gray-800 dark:border-gray-700 p-3 shadow-xl flex flex-col gap-2 min-w-[160px]
                        animate-fade-in">
          <p className="a11y-label text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide px-1">
            Accesibilidad
          </p>

          {/* Dark mode */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left
                       text-gray-700 dark:text-gray-100"
          >
            <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>

          {/* High contrast */}
          <button
            onClick={toggleContrast}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left
                       text-gray-700 dark:text-gray-100"
          >
            <span className="text-lg">◑</span>
            {contrast === 'high' ? 'Contraste normal' : 'Alto contraste'}
          </button>

          {/* Font size */}
          <button
            onClick={cycleFontSize}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left
                       text-gray-700 dark:text-gray-100"
          >
            <span className="text-lg font-bold w-6 text-center">{fontLabel}</span>
            Tamaño de texto
          </button>
        </div>
      )}
    </div>
  )
}
